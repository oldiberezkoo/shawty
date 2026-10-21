import { z } from 'zod'
import { eq } from 'drizzle-orm'
import { db, withImmediateTransaction } from '@/db/client'
import { hashSecret } from '@/lib/crypto'
import { auditLog, invitations, memberships, users } from '@/db/schema'
import { hashPassword } from '@/lib/crypto'
import { route, clientIp, clientUserAgent, readJsonBody, jsonResponse } from '@/server/http/request'
import { createSession } from '@/server/services/auth-service'
import { setAuthCookies } from '@/server/http/cookies'
import { enforceRateLimit, ipKey } from '@/server/http/rate-limit'
import { HttpError } from '@/server/http/errors'

/**
 * Минимальная длина пароля.
 *
 * Восемь символов — не замысел, а граница практики: короче разбирается
 * перебором по справочникам, а требовать длиннее мешает сотрудникам, которые
 * вводят пароль с телефона раз в месяц.
 */
const MIN_PASSWORD = 8

const registerSchema = z.object({
  email: z.string().min(3).max(320),
  password: z.string().min(MIN_PASSWORD, 'Пароль должен быть не короче 8 символов').max(200),
  name: z.string().min(1).max(120),
  /**
   * Токен приглашения.
   *
   * Необязателен: первый сотрудник компании может зарегистрироваться сам.
   * С приглашением аккаунт сразу получает доступ к компании, ради которой его и
   * создавали.
   */
  token: z.string().max(256).optional(),
})

/**
 * Регистрация.
 *
 * Регистрация по приглашению — основной путь: человек приходит по ссылке из
 * письма и после регистрации сразу оказывается внутри компании. Без этого
 * приглашение было бы мёртвым: принять его мог бы только тот, кто уже заведён
 * в систему, а заводить его без приглашения нечем.
 */
export const POST = route(async (request) => {
  enforceRateLimit(
    ipKey('auth:register', request),
    // Порог ниже, чем у входа: регистрация создаёт аккаунт, и перебор адресов
    // здесь — способ завалить почту чужими письмами.
    { limit: 5, windowMs: 60 * 60_000 },
    'Слишком много регистраций с этого адреса. Попробуйте позже.',
  )

  const body = registerSchema.safeParse(await readJsonBody(request))

  if (!body.success) {
    throw HttpError.badRequest('invalid_input', body.error.issues[0]?.message ?? 'Проверьте данные')
  }

  const email = body.data.email.trim().toLowerCase()

  // Приглашение проверяется до создания аккаунта: иначе человек заведёт
  // учётную запись, узнав, что приглашение было просрочено, и не сможет войти
  // в компанию никогда.
  const invitation = body.data.token
    ? db
        .select()
        .from(invitations)
        .where(eq(invitations.tokenHash, hashSecret(body.data.token)))
        .get()
    : undefined

  if (body.data.token) {
    if (!invitation) {
      throw HttpError.notFound('Приглашение не найдено')
    }

    if (invitation.acceptedAt) {
      throw HttpError.conflict('invitation_used', 'Это приглашение уже использовано')
    }

    if (invitation.expiresAt.getTime() < Date.now()) {
      throw HttpError.gone('invitation_expired', 'Срок приглашения истёк. Попросите новое.')
    }

    // Приглашение адресовано конкретному человеку. Регистрация на другой адрес
    // по этой ссылке украла бы чужое место в компании.
    if (invitation.email !== email) {
      throw HttpError.forbidden(
        'Это приглашение отправлено на другой адрес. Войдите под тем адресом, который указан в письме.',
      )
    }
  }

  const existing = db.select({ id: users.id }).from(users).where(eq(users.email, email)).get()

  if (existing) {
    // Адрес уже занят: сообщаем об этом прямо. Не разделяем с «неверным
    // паролем» здесь нечего — пароля ещё нет.
    throw HttpError.conflict('email_taken', 'Аккаунт с таким адресом уже существует. Попробуйте войти.')
  }

  const userId = crypto.randomUUID()

  withImmediateTransaction((tx) => {
    tx.insert(users)
      .values({
        id: userId,
        email,
        passwordHash: hashPassword(body.data.password),
        name: body.data.name.trim().slice(0, 120),
        locale: 'ru',
      })
      .run()

    if (invitation) {
      // Условный UPDATE: одноразовость приглашения держится здесь, а не на
      // посетителе страницы.
      const claimed = tx
        .update(invitations)
        .set({ acceptedAt: new Date() })
        .where(eq(invitations.id, invitation.id))
        .run()

      if (claimed.changes === 0) {
        throw HttpError.conflict('invitation_used', 'Это приглашение уже использовано')
      }

      tx.insert(memberships)
        .values({
          id: crypto.randomUUID(),
          userId,
          companyId: invitation.companyId,
          role: invitation.role,
          status: 'active',
        })
        .run()

      tx.insert(auditLog)
        .values({
          id: crypto.randomUUID(),
          companyId: invitation.companyId,
          actorUserId: userId,
          action: 'team.joined',
          targetType: 'user',
          targetId: userId,
          metaJson: JSON.stringify({ email, role: invitation.role, via: 'registration' }),
          at: new Date(),
        })
        .run()
    }
  })

  // Сессия создаётся сразу: после регистрации человек не должен искать,
  // где ввести пароль, который он только что задал.
  const session = createSession(userId, {
    ip: clientIp(request),
    userAgent: clientUserAgent(request),
  })

  await setAuthCookies(session.token, session.csrfSecret, session.expiresAt)

  return jsonResponse(
    {
      ok: true,
      user: session.user,
      companyId: invitation?.companyId ?? null,
    },
    { status: 201 },
  )
})
