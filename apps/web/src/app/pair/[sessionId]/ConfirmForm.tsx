'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { FormError, FormField, SelectField } from '@/components/ui/form'
import { CSRF_COOKIE } from '@/lib/cookie-names'

type Option = { id: string; name: string }

export function ConfirmForm(props: {
  sessionId: string
  codeFromQr: string | null
  codeRequired: boolean
  expiresAt: string
  companies: Option[]
  defaultCompanyId: string
  branches: Option[]
  groups: Option[]
}) {
  const router = useRouter()
  const [companyId, setCompanyId] = useState(props.defaultCompanyId)
  const [branchId, setBranchId] = useState(props.branches[0]?.id ?? '')
  const [groupId, setGroupId] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const [remaining, setRemaining] = useState(() => new Date(props.expiresAt).getTime() - Date.now())

  const csrfRef = useRef<string>('')

  // CSRF-кука намеренно доступна скрипту: значение дублируется в заголовке,
  // а сервер сверяет его с секретом сессии.
  useEffect(() => {
    const match = document.cookie.match(new RegExp(`(?:^|; )${CSRF_COOKIE}=([^;]+)`))
    if (match?.[1]) csrfRef.current = decodeURIComponent(match[1])
  }, [])

  useEffect(() => {
    const timer = setInterval(() => {
      setRemaining(Math.max(0, new Date(props.expiresAt).getTime() - Date.now()))
    }, 1000)
    return () => clearInterval(timer)
  }, [props.expiresAt])

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    setPending(true)

    const form = new FormData(event.currentTarget)

    try {
      const response = await fetch('/api/dashboard/pairing/confirm', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-csrf-token': csrfRef.current,
        },
        body: JSON.stringify({
          sessionId: props.sessionId,
          code: form.get('code'),
          companyId,
          branchId,
          groupId: groupId || null,
          screenName: form.get('screenName'),
        }),
      })

      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as
          | { error?: { message?: string } }
          | null
        setError(data?.error?.message ?? 'Не удалось подтвердить привязку')
        setPending(false)
        return
      }

      router.push('/dashboard/screens')
      router.refresh()
    } catch {
      setError('Сервер недоступен')
      setPending(false)
    }
  }

  const minutes = Math.floor(remaining / 60_000)
  const seconds = Math.floor((remaining % 60_000) / 1000)
  const expired = remaining <= 0

  return (
    <form onSubmit={onSubmit} className="card flex flex-col gap-5 p-5 sm:p-6">
      {error ? <FormError>{error}</FormError> : null}

      {props.codeRequired ? (
        <FormField
          label="Код с экрана"
          name="code"
          defaultValue={props.codeFromQr ?? ''}
          autoComplete="off"
          inputMode="text"
          maxLength={12}
          required
          autoFocus
          description="Восемь символов. Похожие буквы легко спутать при чтении с расстояния."
        />
      ) : (
        <div className="border border-border-strong border-l-[3px] border-l-border-strong bg-surface-2 px-3.5 py-3 text-[12.5px] leading-relaxed text-text-muted">
          Код подтверждения содержится в QR — вводить его вручную не нужно.
        </div>
      )}

      {props.companies.length > 1 ? (
        <SelectField
          label="Компания"
          name="companyId"
          options={props.companies.map((company) => ({ value: company.id, label: company.name }))}
          defaultValue={companyId}
          required
        />
      ) : (
        <input type="hidden" name="companyId" value={companyId} />
      )}

      <div className="flex flex-col gap-1.5">
        <label htmlFor="branchId" className="text-[12px] font-medium text-text">
          Филиал
        </label>
        <select
          id="branchId"
          name="branchId"
          value={branchId}
          onChange={(event) => setBranchId(event.target.value)}
          required
          className="field"
        >
          {props.branches.map((branch) => (
            <option key={branch.id} value={branch.id}>
              {branch.name}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="groupId" className="text-[12px] font-medium text-text">
          Группа экранов <span className="font-normal text-text-subtle">— необязательно</span>
        </label>
        <select
          id="groupId"
          name="groupId"
          value={groupId}
          onChange={(event) => setGroupId(event.target.value)}
          className="field"
        >
          <option value="">Без группы</option>
          {props.groups.map((group) => (
            <option key={group.id} value={group.id}>
              {group.name}
            </option>
          ))}
        </select>
      </div>

      <FormField
        label="Название экрана"
        name="screenName"
        placeholder="Например: Витрина — вход"
        required
        maxLength={120}
        description="Показывается в панели. На самом экране не отображается."
      />

      <div className="flex items-center justify-between gap-4 border-t border-border pt-4">
        <span className="tnum font-mono text-[11px] tracking-[0.06em] text-text-subtle uppercase">
          {expired ? 'Срок кода истёк' : `Осталось ${minutes}:${String(seconds).padStart(2, '0')}`}
        </span>
        <Button type="submit" variant="primary" disabled={pending || expired}>
          {pending ? 'Подтверждаем…' : 'Подключить экран'}
        </Button>
      </div>
    </form>
  )
}
