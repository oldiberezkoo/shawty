'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardBody } from '@/components/ui/card'
import { FormError, FormSuccess } from '@/components/ui/form'
import { Badge } from '@/components/ui/status-badge'
import { readCsrfToken } from '@/shared/lib/csrf'

type Invitation = {
  email: string
  role: string
  roleLabel: string
  companyName: string
  expiresAt: string
  accepted: boolean
  expired: boolean
}

/**
 * Приём приглашения.
 *
 * Страница показывает, кто пригласил и в какую компанию, **до** нажатия: иначе
 * человек соглашается вслепую, а ссылка из письма вводит в компанию, которую
 * он не выбирал.
 */
export function InviteAccept({ token }: { token: string }) {
  const router = useRouter()
  const [invitation, setInvitation] = useState<Invitation | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)

  /**
   * Вошёл ли человек уже сейчас.
   *
   * Приглашение живёт неделю, поэтому первый вопрос на странице — «есть ли у
   * меня учётная запись». Без этого ответа человек, впервые получивший
   * приглашение, упрётся в «войдите» без способа войти.
   */
  const [hasAccount, setHasAccount] = useState<boolean | null>(null)

  useEffect(() => {
    let stopped = false

    // Проверяется запросом к защищённому маршруту: ответ без 401 означает, что
    // сессия жива. Отдельного эндпоинта «кто я» для этого жалко.
    fetch('/api/dashboard/team', { headers: { 'x-company-id': 'probe' } })
      .then((response) => {
        if (!stopped) setHasAccount(response.status !== 401)
      })
      .catch(() => {
        if (!stopped) setHasAccount(false)
      })

    return () => {
      stopped = true
    }
  }, [])

  useEffect(() => {
    if (!token) {
      setError('Ссылка приглашения неполная. Попросите приглашение заново.')
      setLoading(false)
      return
    }

    let stopped = false

    const load = async () => {
      try {
        const response = await fetch(`/api/team/invitation?token=${encodeURIComponent(token)}`)

        if (stopped) return

        if (!response.ok) {
          const payload = (await response.json().catch(() => null)) as { error?: { message?: string } } | null
          setError(payload?.error?.message ?? 'Приглашение не найдено')
          setLoading(false)
          return
        }

        const payload = (await response.json()) as { invitation: Invitation }
        setInvitation(payload.invitation)
      } catch {
        if (!stopped) setError('Не удалось загрузить приглашение')
      } finally {
        if (!stopped) setLoading(false)
      }
    }

    void load()

    return () => {
      stopped = true
    }
  }, [token])

  const accept = useCallback(async () => {
    setError(null)
    setBusy(true)

    try {
      const response = await fetch('/api/team/invitation', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-csrf-token': readCsrfToken() },
        body: JSON.stringify({ token }),
      })

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: { message?: string } } | null
        setError(payload?.error?.message ?? 'Не удалось принять приглашение')
        return
      }

      setNotice('Готово. Перехожу в панель…')
      router.push('/dashboard')
      router.refresh()
    } finally {
      setBusy(false)
    }
  }, [router, token])

  if (loading) {
    return (
      <Card>
        <CardBody className="py-10 text-center text-[13px] text-text-muted">Проверяем приглашение…</CardBody>
      </Card>
    )
  }

  if (error && !invitation) {
    return (
      <Card>
        <CardBody className="flex flex-col gap-4">
          <FormError>{error}</FormError>
          <Link href="/login">
            <Button size="sm">Войти</Button>
          </Link>
        </CardBody>
      </Card>
    )
  }

  if (!invitation) return null

  if (invitation.expired) {
    return (
      <Card>
        <CardBody className="flex flex-col gap-3">
          <FormError>Срок приглашения истёк. Попросите администратора прислать новое.</FormError>
          <Link href="/login">
            <Button size="sm">Войти</Button>
          </Link>
        </CardBody>
      </Card>
    )
  }

  // Приглашение живёт неделю и не переживает уход человека со страницы.
  // Значит, первый вопрос «есть ли у меня учётная запись» стоит задать здесь:
  // иначе принять приглашение сможет только тот, кто уже вошёл, а завести его
  // без приглашения нечем.
  if (invitation && hasAccount === false) {
    return (
      <Card>
        <CardBody className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5 text-[13px]">
            <div className="text-[16px] font-medium tracking-[-0.02em]">{invitation.companyName}</div>
            <div className="text-text-muted">
              Вас пригласили с правом «{invitation.roleLabel}» на адрес {invitation.email}.
            </div>
          </div>

          {error ? <FormError onDismiss={() => setError(null)}>{error}</FormError> : null}

          <Link href={`/register?token=${encodeURIComponent(token)}`}>
            <Button size="sm" variant="primary" className="w-full">
              Создать учётную запись и принять приглашение
            </Button>
          </Link>

          <p className="text-center text-[12px] text-text-subtle">
            Уже зарегистрированы? Войдите, затем вернитесь по этой ссылке.
          </p>
        </CardBody>
      </Card>
    )
  }

  if (invitation.accepted) {
    return (
      <Card>
        <CardBody className="flex flex-col gap-3">
          <FormSuccess>Это приглашение уже использовано. Если вы вошли другой учётной записью — войдите ей.</FormSuccess>
          <Link href="/dashboard">
            <Button size="sm">Перейти в панель</Button>
          </Link>
        </CardBody>
      </Card>
    )
  }

  return (
    <Card>
      <CardBody className="flex flex-col gap-5">
        <div className="flex flex-col gap-1.5 text-[13px]">
          <div className="text-text-muted">Вас пригласили в</div>
          <div className="text-[16px] font-medium tracking-[-0.02em]">{invitation.companyName}</div>
          <div className="mt-2 flex items-center gap-2 text-text-muted">
            Роль:
            <Badge tone="info">{invitation.roleLabel}</Badge>
          </div>
          <div className="mt-1 text-[12px] text-text-subtle">
            Приглашение на адрес {invitation.email}. Войти нужно именно под ним — иначе доступ будет выдан другому
            человеку.
          </div>
        </div>

        {error ? <FormError onDismiss={() => setError(null)}>{error}</FormError> : null}
        {notice ? <FormSuccess>{notice}</FormSuccess> : null}

        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="primary" disabled={busy} onClick={() => void accept()}>
            Принять приглашение
          </Button>
          <Link href="/login">
            <Button size="sm">Я уже вошёл</Button>
          </Link>
        </div>
      </CardBody>
    </Card>
  )
}