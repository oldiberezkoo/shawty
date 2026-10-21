import { z } from 'zod'
import { eq } from 'drizzle-orm'
import { db } from '@/db/client'
import { hashSecret } from '@/lib/crypto'
import { companies, invitations, memberships } from '@/db/schema'
import { requireSessionForApi } from '@/server/auth/require-session'
import { ROLE_LABELS } from '@/domain/authz/permissions'
import { route, jsonResponse, readJsonBody } from '@/server/http/request'
import { acceptInvitation } from '@/server/services/team-service'
import { HttpError } from '@/server/http/errors'

/**
 * Приглашение по одноразовой ссылке.
 *
 * Токен известен только тому, кому переслали письмо, и живёт неделю. В базе —
 * только HMAC, поэтому ссылку нельзя перечислить даже из базы.
 *
 * Приглашение не требует входа: посмотреть, кто пригласил и в какую компанию,
 * можно и до входа. Принять — уже только вошедшему.
 */
export const GET = route(async (request: Request) => {
  const token = new URL(request.url).searchParams.get('token') ?? ''

  if (!token) {
    throw HttpError.badRequest('invalid_token', 'Ссылка приглашения неполная')
  }

  const invitation = db
    .select({
      email: invitations.email,
      role: invitations.role,
      expiresAt: invitations.expiresAt,
      acceptedAt: invitations.acceptedAt,
      companyName: companies.name,
    })
    .from(invitations)
    .innerJoin(companies, eq(companies.id, invitations.companyId))
    .where(eq(invitations.tokenHash, hashSecret(token)))
    .get()

  if (!invitation) {
    throw HttpError.notFound('Приглашение не найдено. Возможно, ссылка устарела.')
  }

  return jsonResponse({
    invitation: {
      email: invitation.email,
      role: invitation.role,
      roleLabel: ROLE_LABELS[invitation.role],
      companyName: invitation.companyName,
      expiresAt: invitation.expiresAt.toISOString(),
      accepted: invitation.acceptedAt !== null,
      expired: invitation.expiresAt.getTime() < Date.now(),
    },
  })
})

export const POST = route(async (request: Request) => {
  const session = await requireSessionForApi()

  const body = z.object({ token: z.string().min(8).max(256) }).safeParse(await readJsonBody(request))

  if (!body.success) {
    throw HttpError.badRequest('invalid_token', 'Ссылка приглашения неполная')
  }

  const result = acceptInvitation({ token: body.data.token, userId: session.userId })

  // Человек мог уже состоять в другой компании — это не мешает: одна учётная
  // запись, несколько компаний, роль в каждой своя.
  const membership = db
    .select({ companyId: memberships.companyId })
    .from(memberships)
    .where(eq(memberships.userId, session.userId))
    .all()

  return jsonResponse({
    ok: true,
    ...result,
    companies: membership.length,
  })
})