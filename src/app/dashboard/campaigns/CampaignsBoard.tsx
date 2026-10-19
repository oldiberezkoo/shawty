'use client'

import { Notice } from '@/components/ui/status-badge'
import { useCallback, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardBody, CardHeader } from '@/components/ui/card'
import { CSRF_COOKIE } from '@/lib/cookie-names'

export type CampaignTargetView = { scopeType: 'screen' | 'group' | 'branch' | 'company'; scopeId: string }
export type CampaignWindowView = {
  daysOfWeek: number
  startMinute: number
  endMinute: number
  timezoneSource: 'branch' | 'company' | 'campaign'
}
export type CampaignView = {
  id: string
  name: string
  kind: 'internal' | 'commercial'
  priority: number
  status: string
  startsOn: string
  endsOn: string | null
  approvalRequired: boolean
  playlistVersionId: string | null
  playlistVersion: number | null
  targets: CampaignTargetView[]
  windows: CampaignWindowView[]
  withinDates: boolean
}

export type ScopeOption = { id: string; name: string }
export type PlaylistVersionOption = { id: string; label: string }

/** Дни недели в порядке ISO. Бит 0 — понедельник. */
const WEEKDAYS = [
  { bit: 1 << 0, short: 'Пн' },
  { bit: 1 << 1, short: 'Вт' },
  { bit: 1 << 2, short: 'Ср' },
  { bit: 1 << 3, short: 'Чт' },
  { bit: 1 << 4, short: 'Пт' },
  { bit: 1 << 5, short: 'Сб' },
  { bit: 1 << 6, short: 'Вс' },
]

const STATUS_LABEL: Record<string, string> = {
  draft: 'черновик',
  in_review: 'на согласовании',
  approved: 'согласована',
  scheduled: 'запланирована',
  active: 'идёт',
  ended: 'завершена',
  archived: 'в архиве',
}

const STATUS_TONE: Record<string, string> = {
  in_review: 'text-warn',
  approved: 'text-info',
  active: 'text-success',
  ended: 'text-text-subtle',
  draft: 'text-text-muted',
}

function minutesToTime(minutes: number): string {
  const effective = minutes === 1439 ? 1440 : minutes
  const hours = Math.floor(effective / 60) % 24
  const mins = effective % 60
  return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`
}

function timeToMinutes(value: string): number {
  const [hours, minutes] = value.split(':').map(Number)
  const total = (hours || 0) * 60 + (minutes || 0)
  return total >= 1440 ? 1439 : total
}

function windowLabel(window: CampaignWindowView): string {
  const days =
    window.daysOfWeek === 127
      ? 'ежедневно'
      : WEEKDAYS.filter((day) => (window.daysOfWeek & day.bit) !== 0)
          .map((day) => day.short)
          .join(' ') || 'нет дней'

  const end = minutesToTime(window.endMinute)

  // Окно, заданное «23:59», в интерфейсе честнее показать как «до 24:00»:
  // иначе оператор будет гадать, что показывается последнюю минуту суток.
  return `${days}, ${minutesToTime(window.startMinute)}–${end === '24:00' ? '24:00' : end}`
}

function readCsrf(): string {
  const match = document.cookie.match(new RegExp(`(?:^|; )${CSRF_COOKIE}=([^;]+)`))
  return match?.[1] ? decodeURIComponent(match[1]) : ''
}

/**
 * Кампании: список, создание и правка.
 *
 * Клиентский компонент целиком: после правки расписания меняется то, что
 * пойдёт на экраны по всей сети, и оператор должен видеть результат своей
 * кнопки без перезагрузки страницы.
 */
export function CampaignsBoard(props: {
  companyId: string
  canWrite: boolean
  canApprove: boolean
  canPublish: boolean
  today: string
  campaigns: CampaignView[]
  branches: ScopeOption[]
  groups: ScopeOption[]
  screens: ScopeOption[]
  playlistVersions: PlaylistVersionOption[]
}) {
  const router = useRouter()
  const [selectedId, setSelectedId] = useState<string | null>(props.campaigns[0]?.id ?? null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const selected = props.campaigns.find((campaign) => campaign.id === selectedId) ?? null

  const call = useCallback(
    async (path: string, method: string, body?: unknown) => {
      setError(null)
      setNotice(null)
      setBusy(true)

      try {
        const response = await fetch(path, {
          method,
          headers: {
            'content-type': 'application/json',
            'x-company-id': props.companyId,
            'x-csrf-token': readCsrf(),
          },
          body: body === undefined ? undefined : JSON.stringify(body),
        })

        if (!response.ok) {
          const data = (await response.json().catch(() => null)) as { error?: { message?: string } } | null
          setError(data?.error?.message ?? 'Не удалось выполнить действие')
          return null
        }

        return (await response.json().catch(() => null)) as Record<string, unknown> | null
      } finally {
        setBusy(false)
        router.refresh()
      }
    },
    [props.companyId, router],
  )

  const act = useCallback(
    async (action: string) => {
      if (!selected) return

      const result = await call(`/api/dashboard/campaigns/${selected.id}/action`, 'POST', { action })

      if (result) {
        setNotice(
          action === 'publish_now'
            ? `Опубликована версия ${result.published ? (result.published as { version: number }).version : '—'} для ${
                result.published ? (result.published as { screens: number }).screens : 0
              } экранов. Числа доставки смотрите на экране «Публикация».`
            : 'Кампания переведена в состояние «выполнено действие».',
        )
      }
    },
    [call, selected],
  )

  const remove = useCallback(async () => {
    if (!selected) return
    const result = await call(`/api/dashboard/campaigns/${selected.id}`, 'DELETE')
    if (result) setSelectedId(null)
  }, [call, selected])

  return (
    <div className="flex flex-col gap-6">
      {error ? (
        <Notice tone="danger">{error}</Notice>
      ) : null}
      {notice ? (
        <Notice>{notice}</Notice>
      ) : null}

      <Card>
        <CardHeader
          title="Кампании"
          description="Кампания задаёт, что и когда идёт на экранах. При пересечении расписаний побеждает приоритет, затем более узкая область, а при равенстве — более свежая кампания."
        />
        <CardBody className="p-0">
          <div className="@container w-full overflow-x-auto">
          <table className="stack-table w-full border-collapse text-[13px]">
            <thead>
              <tr className="border-b border-border text-left text-[12px] text-text-subtle">
                <th className="px-5 py-2 font-normal">Кампания</th>
                <th className="px-5 py-2 font-normal">Состояние</th>
                <th className="px-5 py-2 font-normal">Сроки</th>
                <th className="px-5 py-2 font-normal">Расписание</th>
                <th className="px-5 py-2 text-right font-normal">Приоритет</th>
              </tr>
            </thead>
            <tbody>
              {props.campaigns.map((campaign) => (
                <tr
                  key={campaign.id}
                  onClick={() => setSelectedId(campaign.id)}
                  className={`cursor-pointer border-b border-border last:border-0 ${
                    campaign.id === selectedId ? 'bg-surface-2' : ''
                  }`}
                >
                  <td data-primary className="px-5 py-2">
                    <span className="font-medium">{campaign.name}</span>
                    {campaign.kind === 'commercial' ? (
                      <span className="ml-2 rounded bg-surface-3 px-1.5 py-0.5 text-[11px] text-text-muted">реклама</span>
                    ) : null}
                  </td>
                  <td data-label="Состояние" className={`px-5 py-2 ${STATUS_TONE[campaign.status] ?? 'text-text-muted'}`}>
                    {STATUS_LABEL[campaign.status] ?? campaign.status}
                    {!campaign.withinDates && campaign.status !== 'ended' ? (
                      <span className="ml-2 text-[12px] text-text-subtle">вне сроков</span>
                    ) : null}
                  </td>
                  <td data-label="Сроки" className="px-5 py-2 text-text-muted">
                    {campaign.startsOn} — {campaign.endsOn ?? 'бессрочно'}
                  </td>
                  <td data-label="Расписание" className="px-5 py-2 text-text-muted">
                    {campaign.windows.length === 0 ? (
                      'круглосуточно'
                    ) : (
                      campaign.windows.map((window, index) => (
                        <div key={index}>{windowLabel(window)}</div>
                      ))
                    )}
                  </td>
                  <td data-label="Приоритет" className="tnum px-5 py-2 text-right text-text-muted">{campaign.priority}</td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>

          {props.campaigns.length === 0 ? (
            <p className="px-5 py-4 text-[13px] text-text-subtle">
              Кампаний пока нет. Без них экраны показывают назначенный плейлист постоянно.
            </p>
          ) : null}
        </CardBody>
      </Card>

      {selected ? (
        <Card>
          <CardHeader
            title={selected.name}
            description={`${STATUS_LABEL[selected.status] ?? selected.status} · ${
              selected.approvalRequired ? 'требуется согласование' : 'без согласования'
            }`}
          />
          <CardBody className="flex flex-wrap items-center gap-3">
            {selected.status === 'in_review' || selected.status === 'draft' ? (
              <Button
                size="sm"
                variant="primary"
                disabled={busy || !props.canApprove}
                title={props.canApprove ? undefined : 'Согласование доступно не этой роли'}
                onClick={() => void act('approve')}
              >
                Согласовать
              </Button>
            ) : null}

            {selected.status === 'approved' || selected.status === 'scheduled' ? (
              <Button size="sm" disabled={busy || !props.canWrite} onClick={() => void act('activate')}>
                Перевести в «идёт»
              </Button>
            ) : null}

            {selected.status === 'approved' || selected.status === 'scheduled' || selected.status === 'active' ? (
              <Button size="sm" disabled={busy || !props.canWrite} onClick={() => void act('end')}>
                Завершить
              </Button>
            ) : null}

            <Button
              size="sm"
              variant="primary"
              disabled={busy || !props.canPublish || selected.status === 'in_review' || selected.status === 'draft'}
              title={
                selected.status === 'in_review' || selected.status === 'draft'
                  ? 'Сначала согласуйте кампанию'
                  : undefined
              }
              onClick={() => void act('publish_now')}
            >
              Опубликовать сейчас
            </Button>

            <Button size="sm" variant="danger" disabled={busy || !props.canWrite || selected.status === 'active'} onClick={() => void remove()}>
              Удалить
            </Button>
          </CardBody>
        </Card>
      ) : null}

      {props.canWrite ? (
        <CampaignForm
          companyId={props.companyId}
          today={props.today}
          branches={props.branches}
          groups={props.groups}
          screens={props.screens}
          playlistVersions={props.playlistVersions}
        />
      ) : null}
    </div>
  )
}

type DraftWindow = CampaignWindowView

/**
 * Форма создания кампании.
 *
 * Отдельная карточка, а не модальное окно: правил много, и прятать их
 * в диалог значит показать половину и потерять вторую.
 */
function CampaignForm(props: {
  companyId: string
  today: string
  branches: ScopeOption[]
  groups: ScopeOption[]
  screens: ScopeOption[]
  playlistVersions: PlaylistVersionOption[]
}) {
  const router = useRouter()
  const [name, setName] = useState('')
  const [kind, setKind] = useState<'internal' | 'commercial'>('internal')
  const [priority, setPriority] = useState(0)
  const [startsOn, setStartsOn] = useState(props.today)
  const [endsOn, setEndsOn] = useState('')
  const [approvalRequired, setApprovalRequired] = useState(false)
  const [playlistVersionId, setPlaylistVersionId] = useState('')
  const [scopeType, setScopeType] = useState<'company' | 'branch' | 'group' | 'screen'>('company')
  const [scopeId, setScopeId] = useState('')
  const [windows, setWindows] = useState<DraftWindow[]>([])
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const scopeOptions =
    scopeType === 'company'
      ? []
      : scopeType === 'branch'
        ? props.branches
        : scopeType === 'group'
          ? props.groups
          : props.screens

  const submit = useCallback(async () => {
    setError(null)
    setBusy(true)

    try {
      const response = await fetch('/api/dashboard/campaigns', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-company-id': props.companyId,
          'x-csrf-token': readCsrf(),
        },
        body: JSON.stringify({
          name,
          kind,
          priority,
          startsOn,
          endsOn: endsOn || null,
          approvalRequired,
          playlistVersionId: playlistVersionId || null,
          fallbackPlaylistVersionId: null,
          timezoneOverride: null,
          targets: [{ scopeType, scopeId: scopeType === 'company' ? props.companyId : scopeId }],
          windows,
        }),
      })

      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as { error?: { message?: string } } | null
        setError(data?.error?.message ?? 'Не удалось создать кампанию')
        return
      }

      setName('')
      setWindows([])
      router.refresh()
    } finally {
      setBusy(false)
    }
  }, [approvalRequired, endsOn, kind, name, playlistVersionId, priority, props.companyId, router, scopeId, scopeType, startsOn, windows])

  const patchWindow = (index: number, patch: Partial<DraftWindow>) => {
    setWindows((current) => current.map((window, position) => (position === index ? { ...window, ...patch } : window)))
  }

  return (
    <Card>
      <CardHeader
        title="Новая кампания"
        description="Пустые окна означают «круглосуточно в срок действия». Окно можно задать для части недели — например, только будни с 09:00 до 18:00."
      />
      <CardBody className="flex flex-col gap-4">
        {error ? (
          <Notice tone="danger">{error}</Notice>
        ) : null}

        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1.5 text-[12px] text-text-muted">
            Название
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              className="h-9 w-56 rounded-[var(--radius-md)] border border-border bg-surface px-2 text-[13px] text-text"
              placeholder="Осенняя акция"
            />
          </label>

          <label className="flex flex-col gap-1.5 text-[12px] text-text-muted">
            Тип
            <select
              value={kind}
              onChange={(event) => setKind(event.target.value as 'internal' | 'commercial')}
              className="h-9 rounded-[var(--radius-md)] border border-border bg-surface px-2 text-[13px] text-text"
            >
              <option value="internal">внутренний</option>
              <option value="commercial">реклама</option>
            </select>
          </label>

          <label className="flex flex-col gap-1.5 text-[12px] text-text-muted">
            Приоритет
            <input
              type="number"
              value={priority}
              onChange={(event) => setPriority(Number.parseInt(event.target.value || '0', 10))}
              className="tnum h-9 w-20 rounded-[var(--radius-md)] border border-border bg-surface px-2 text-[13px] text-text"
            />
          </label>

          <label className="flex flex-col gap-1.5 text-[12px] text-text-muted">
            Начало
            <input
              type="date"
              value={startsOn}
              onChange={(event) => setStartsOn(event.target.value)}
              className="h-9 rounded-[var(--radius-md)] border border-border bg-surface px-2 text-[13px] text-text"
            />
          </label>

          <label className="flex flex-col gap-1.5 text-[12px] text-text-muted">
            Окончание
            <input
              type="date"
              value={endsOn}
              onChange={(event) => setEndsOn(event.target.value)}
              className="h-9 rounded-[var(--radius-md)] border border-border bg-surface px-2 text-[13px] text-text"
            />
          </label>
        </div>

        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1.5 text-[12px] text-text-muted">
            Версия плейлиста
            <select
              value={playlistVersionId}
              onChange={(event) => setPlaylistVersionId(event.target.value)}
              className="h-9 w-64 rounded-[var(--radius-md)] border border-border bg-surface px-2 text-[13px] text-text"
            >
              <option value="">Не выбрана</option>
              {props.playlistVersions.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1.5 text-[12px] text-text-muted">
            Область
            <select
              value={scopeType}
              onChange={(event) => {
                setScopeType(event.target.value as typeof scopeType)
                setScopeId('')
              }}
              className="h-9 rounded-[var(--radius-md)] border border-border bg-surface px-2 text-[13px] text-text"
            >
              <option value="company">Вся компания</option>
              <option value="branch">Филиал</option>
              <option value="group">Группа экранов</option>
              <option value="screen">Один экран</option>
            </select>
          </label>

          {scopeType !== 'company' ? (
            <label className="flex flex-col gap-1.5 text-[12px] text-text-muted">
              {scopeType === 'branch' ? 'Филиал' : scopeType === 'group' ? 'Группа' : 'Экран'}
              <select
                value={scopeId}
                onChange={(event) => setScopeId(event.target.value)}
                className="h-9 w-56 rounded-[var(--radius-md)] border border-border bg-surface px-2 text-[13px] text-text"
              >
                <option value="">Выберите</option>
                {scopeOptions.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.name}
                  </option>
                ))}
              </select>
            </label>
          ) : null}

          <label className="flex items-center gap-2 pb-2 text-[13px] text-text">
            <input type="checkbox" checked={approvalRequired} onChange={(event) => setApprovalRequired(event.target.checked)} />
            Требуется согласование
          </label>
        </div>

        <div className="flex flex-col gap-2 border-t border-border pt-3">
          <div className="flex items-center justify-between">
            <span className="text-[12px] text-text-muted">Окна показа</span>
            <Button
              size="sm"
              onClick={() => setWindows((current) => [...current, { daysOfWeek: 127, startMinute: 540, endMinute: 1080, timezoneSource: 'branch' }])}
            >
              Добавить окно
            </Button>
          </div>

          {windows.map((window, index) => (
            <div key={index} className="flex flex-wrap items-center gap-2 text-[13px]">
              <div className="flex items-center gap-1">
                {WEEKDAYS.map((day) => (
                  <button
                    key={day.bit}
                    type="button"
                    onClick={() => {
                      // Снятие последнего дня недопустимо: маска 0 означала бы
                      // «никогда», и оператор потерял бы и окно, и способ его вернуть.
                      const next = window.daysOfWeek ^ day.bit
                      patchWindow(index, { daysOfWeek: next === 0 ? 127 : next })
                    }}
                    className={`h-7 w-7 rounded-[var(--radius-sm)] border text-[12px] transition-colors ${
                      (window.daysOfWeek & day.bit) !== 0
                        ? 'border-primary bg-primary text-primary-text'
                        : 'border-border text-text-subtle hover:bg-surface-2'
                    }`}
                  >
                    {day.short}
                  </button>
                ))}
              </div>

              <input
                type="time"
                value={minutesToTime(window.startMinute)}
                onChange={(event) => patchWindow(index, { startMinute: timeToMinutes(event.target.value) })}
                className="h-8 rounded-[var(--radius-md)] border border-border bg-surface px-2 text-[13px] text-text"
              />
              <span className="text-text-subtle">—</span>
              <input
                type="time"
                value={minutesToTime(window.endMinute)}
                onChange={(event) => patchWindow(index, { endMinute: timeToMinutes(event.target.value) })}
                className="h-8 rounded-[var(--radius-md)] border border-border bg-surface px-2 text-[13px] text-text"
              />

              <Button size="sm" variant="ghost" onClick={() => setWindows((current) => current.filter((_, position) => position !== index))}>
                Убрать
              </Button>
            </div>
          ))}
        </div>

        <div>
          <Button size="sm" variant="primary" disabled={busy} onClick={() => void submit()}>
            Создать кампанию
          </Button>
        </div>
      </CardBody>
    </Card>
  )
}