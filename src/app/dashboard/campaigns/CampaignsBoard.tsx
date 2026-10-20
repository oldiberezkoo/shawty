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
  playlistName: string | null
  playlistVersion: number | null
  fallbackPlaylistVersionId: string | null
  timezoneOverride: string | null
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

function scopeLabel(
  target: CampaignTargetView,
  props: { companyName: string; branches: ScopeOption[]; groups: ScopeOption[]; screens: ScopeOption[] },
): string {
  switch (target.scopeType) {
    case 'company':
      return 'вся компания'
    case 'branch':
      return `филиал «${props.branches.find((item) => item.id === target.scopeId)?.name ?? 'удалён'}»`
    case 'group':
      return `группа «${props.groups.find((item) => item.id === target.scopeId)?.name ?? 'удалена'}»`
    case 'screen':
      return `экран «${props.screens.find((item) => item.id === target.scopeId)?.name ?? 'удалён'}»`
  }
}

function plural(value: number, one: string, few: string, many: string): string {
  const mod10 = value % 10
  const mod100 = value % 100
  if (mod10 === 1 && mod100 !== 11) return one
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few
  return many
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
  companyName: string
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
  const [editing, setEditing] = useState<CampaignView | null>(null)
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
                <th className="px-5 py-2 font-normal">Что показывает</th>
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
                    <span className="mt-0.5 block text-[12px] text-text-subtle">
                      {campaign.targets.length === 0
                        ? 'площадки не выбраны'
                        : campaign.targets
                            .map((target) =>
                              scopeLabel(target, {
                                companyName: props.companyName,
                                branches: props.branches,
                                groups: props.groups,
                                screens: props.screens,
                              }),
                            )
                            .join(', ')}
                    </span>
                  </td>
                  <td data-label="Что показывает" className="px-5 py-2 text-text-muted">
                    {campaign.playlistName ? (
                      <>{campaign.playlistName}</>
                    ) : (
                      <span className="text-text-subtle">плейлист не выбран</span>
                    )}
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
          <CardBody className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5 text-[13px] text-text-muted">
              <p>
                Показывает{' '}
                <span className="font-medium text-text">
                  {selected.playlistName ? selected.playlistName : 'плейлист не выбран'}
                </span>{' '}
                {selected.targets.length > 0 ? 'на ' : ''}
                {selected.targets
                  .map((target) =>
                    scopeLabel(target, {
                      companyName: props.companyName,
                      branches: props.branches,
                      groups: props.groups,
                      screens: props.screens,
                    }),
                  )
                  .join(', ')}
                {selected.windows.length === 0
                  ? ' круглосуточно'
                  : `: ${selected.windows.map(windowLabel).join('; ')}`}
                .
              </p>

              <p>
                Срок: {selected.startsOn} — {selected.endsOn ?? 'бессрочно'}
                {selected.withinDates ? ' (идёт по датам)' : ' (вне текущих дат)'}. Приоритет {selected.priority}.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3 border-t border-border pt-3">
              {props.canWrite ? (
                <Button size="sm" onClick={() => setEditing(selected)}>
                  Изменить условия
                </Button>
              ) : null}

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
            </div>
          </CardBody>
        </Card>
      ) : null}

      {props.canWrite ? (
        <CampaignForm
          key={editing?.id ?? 'new'}
          companyId={props.companyId}
          companyName={props.companyName}
          today={props.today}
          branches={props.branches}
          groups={props.groups}
          screens={props.screens}
          playlistVersions={props.playlistVersions}
          initial={editing}
          onCancel={editing ? () => setEditing(null) : undefined}
          onSaved={(message) => setNotice(message)}
        />
      ) : null}
    </div>
  )
}

type DraftWindow = CampaignWindowView
type TargetDraft = { scopeType: 'branch' | 'group' | 'screen'; scopeId: string }

/**
 * Форма кампании: создание и правка.
 *
 * Отдельная карточка, а не модальное окно: правил много, и прятать их
 * в диалог значит показать половину и потерять вторую.
 */
function CampaignForm(props: {
  companyId: string
  companyName: string
  today: string
  branches: ScopeOption[]
  groups: ScopeOption[]
  screens: ScopeOption[]
  playlistVersions: PlaylistVersionOption[]
  initial: CampaignView | null
  onCancel?: () => void
  onSaved?: (message: string) => void
}) {
  const router = useRouter()
  const initial = props.initial
  const [name, setName] = useState(initial?.name ?? '')
  const [kind, setKind] = useState<'internal' | 'commercial'>(initial?.kind ?? 'internal')
  const [priority, setPriority] = useState(initial?.priority ?? 0)
  const [startsOn, setStartsOn] = useState(initial?.startsOn ?? props.today)
  const [endsOn, setEndsOn] = useState(initial?.endsOn ?? '')
  const [approvalRequired, setApprovalRequired] = useState(initial?.approvalRequired ?? false)
  const [playlistVersionId, setPlaylistVersionId] = useState(initial?.playlistVersionId ?? '')
  const [allCompany, setAllCompany] = useState(
    initial ? initial.targets.some((target) => target.scopeType === 'company') : true,
  )
  const [targets, setTargets] = useState<TargetDraft[]>(
    initial ? initial.targets.filter((target): target is TargetDraft => target.scopeType !== 'company') : [],
  )
  const [targetTab, setTargetTab] = useState<TargetDraft['scopeType']>('screen')
  const [screenFilter, setScreenFilter] = useState('')
  const [windows, setWindows] = useState<DraftWindow[]>(initial?.windows ?? [])
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const targetOptions =
    targetTab === 'branch' ? props.branches : targetTab === 'group' ? props.groups : props.screens
  const query = screenFilter.trim().toLowerCase()
  const visibleTargetOptions =
    targetTab === 'screen' && query
      ? targetOptions.filter((option) => option.name.toLowerCase().includes(query))
      : targetOptions

  const toggleTarget = (scopeType: TargetDraft['scopeType'], scopeId: string) => {
    setTargets((current) =>
      current.some((target) => target.scopeType === scopeType && target.scopeId === scopeId)
        ? current.filter((target) => !(target.scopeType === scopeType && target.scopeId === scopeId))
        : [...current, { scopeType, scopeId }],
    )
  }

  const submit = useCallback(async () => {
    setError(null)
    setNotice(null)

    if (!name.trim()) {
      setError('Укажите название кампании: по нему её потом искать в списке.')
      return
    }

    if (!playlistVersionId) {
      setError('Выберите плейлист — без него кампании нечего показывать.')
      return
    }

    if (!allCompany && targets.length === 0) {
      setError('Отметьте хотя бы один филиал, группу или экран.')
      return
    }

    setBusy(true)

    try {
      const response = await fetch(
        initial ? `/api/dashboard/campaigns/${initial.id}` : '/api/dashboard/campaigns',
        {
          method: initial ? 'PATCH' : 'POST',
          headers: {
            'content-type': 'application/json',
            'x-company-id': props.companyId,
            'x-csrf-token': readCsrf(),
          },
          body: JSON.stringify({
            name: name.trim(),
            kind,
            priority,
            startsOn,
            endsOn: endsOn || null,
            approvalRequired,
            playlistVersionId,
            // Запасной плейлист и часовой пояс в форме не редактируются, но при
            // сохранении их нельзя молча обнулить: PATCH заменяет кампанию целиком.
            fallbackPlaylistVersionId: initial?.fallbackPlaylistVersionId ?? null,
            timezoneOverride: initial?.timezoneOverride ?? null,
            targets: allCompany ? [{ scopeType: 'company', scopeId: props.companyId }] : targets,
            windows,
          }),
        },
      )

      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as { error?: { message?: string } } | null
        setError(data?.error?.message ?? (initial ? 'Не удалось сохранить кампанию' : 'Не удалось создать кампанию'))
        return
      }

      if (initial) {
        props.onSaved?.('Изменения сохранены. Они попадут на экраны после публикации.')
        props.onCancel?.()
      } else {
        setName('')
        setWindows([])
        setNotice('Кампания создана. Проверьте условия и опубликуйте её, когда будете готовы.')
      }

      router.refresh()
    } finally {
      setBusy(false)
    }
  }, [
    allCompany,
    approvalRequired,
    endsOn,
    initial,
    kind,
    name,
    playlistVersionId,
    priority,
    props,
    router,
    startsOn,
    targets,
    windows,
  ])

  const patchWindow = (index: number, patch: Partial<DraftWindow>) => {
    setWindows((current) => current.map((window, position) => (position === index ? { ...window, ...patch } : window)))
  }

  return (
    <Card>
      <CardHeader
        title={initial ? `Изменить кампанию «${initial.name}»` : 'Новая кампания'}
        description="Кампания работает поверх обычного плейлиста: в выбранные дни и часы экраны показывают её контент, в остальное время — назначенный плейлист. Пустые окна показа означают «круглосуточно в срок действия»."
      />
      <CardBody className="flex flex-col gap-4">
        {error ? (
          <Notice tone="danger">{error}</Notice>
        ) : null}
        {notice ? <Notice>{notice}</Notice> : null}

        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1.5 text-[12.5px] font-medium text-text">
            Название
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              className="field w-56"
              placeholder="Осенняя акция"
            />
          </label>

          <label className="flex flex-col gap-1.5 text-[12.5px] font-medium text-text">
            Тип
            <select
              value={kind}
              onChange={(event) => setKind(event.target.value as 'internal' | 'commercial')}
              className="field w-36"
            >
              <option value="internal">внутренний</option>
              <option value="commercial">реклама</option>
            </select>
          </label>

          <label className="flex flex-col gap-1.5 text-[12.5px] font-medium text-text">
            Приоритет
            <input
              type="number"
              value={priority}
              onChange={(event) => setPriority(Number.parseInt(event.target.value || '0', 10))}
              className="field tnum w-20"
            />
          </label>

          <label className="flex flex-col gap-1.5 text-[12.5px] font-medium text-text">
            Начало
            <input
              type="date"
              value={startsOn}
              onChange={(event) => setStartsOn(event.target.value)}
              className="field w-36"
            />
          </label>

          <label className="flex flex-col gap-1.5 text-[12.5px] font-medium text-text">
            Окончание
            <input
              type="date"
              value={endsOn}
              onChange={(event) => setEndsOn(event.target.value)}
              className="field w-36"
            />
          </label>
        </div>

        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1.5 text-[12.5px] font-medium text-text">
            Плейлист
            <select
              value={playlistVersionId}
              onChange={(event) => setPlaylistVersionId(event.target.value)}
              className="field w-64"
            >
              <option value="">Не выбрана</option>
              {props.playlistVersions.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <label className="flex items-center gap-2 pb-2 text-[13px] text-text">
            <input type="checkbox" checked={approvalRequired} onChange={(event) => setApprovalRequired(event.target.checked)} />
            Требуется согласование
          </label>
        </div>

        <div className="flex flex-col gap-2 border-t border-border pt-3">
          <span className="text-[12px] font-medium text-text">Где показывать</span>
          <label className="flex items-center gap-2 text-[13px] text-text">
            <input type="checkbox" checked={allCompany} onChange={(event) => setAllCompany(event.target.checked)} />
            Вся компания
            <span className="text-[12px] text-text-subtle">включая экраны, которые добавят позже</span>
          </label>

          {!allCompany ? (
            <>
              <div className="flex flex-wrap gap-2">
                {(
                  [
                    ['branch', 'Филиалы', props.branches],
                    ['group', 'Группы', props.groups],
                    ['screen', 'Экраны', props.screens],
                  ] as const
                ).map(([value, label, options]) => {
                  const selectedCount = targets.filter((target) => target.scopeType === value).length

                  return (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setTargetTab(value)}
                      className={`h-8 rounded-[var(--radius-md)] border px-3 text-[12.5px] transition-colors ${
                        targetTab === value
                          ? 'border-primary bg-primary text-primary-text'
                          : 'border-border text-text-muted hover:bg-surface-2'
                      }`}
                    >
                      {label}
                      <span className="ml-1.5 opacity-70">
                        {selectedCount > 0 ? `${selectedCount}/${options.length}` : options.length}
                      </span>
                    </button>
                  )
                })}
              </div>

              {targetTab === 'screen' ? (
                <input
                  value={screenFilter}
                  onChange={(event) => setScreenFilter(event.target.value)}
                  className="field w-full max-w-xs"
                  placeholder="Найти экран по названию"
                />
              ) : null}

              <div className="max-h-52 overflow-y-auto rounded-[var(--radius-md)] border border-border">
                {visibleTargetOptions.length === 0 ? (
                  <p className="px-3 py-2 text-[12.5px] text-text-subtle">
                    {query ? 'Ничего не найдено.' : 'Здесь пока пусто — добавьте филиалы, группы или экраны в разделе «Структура».'}
                  </p>
                ) : (
                  visibleTargetOptions.map((option) => {
                    const checked = targets.some(
                      (target) => target.scopeType === targetTab && target.scopeId === option.id,
                    )

                    return (
                      <label
                        key={option.id}
                        className="flex cursor-pointer items-center gap-2 border-b border-border px-3 py-1.5 text-[13px] last:border-0 hover:bg-surface-2"
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleTarget(targetTab, option.id)}
                        />
                        {option.name}
                      </label>
                    )
                  })
                )}
              </div>

              {targets.length > 0 ? (
                <div className="flex flex-wrap gap-1.5">
                  {targets.map((target) => (
                    <button
                      key={`${target.scopeType}:${target.scopeId}`}
                      type="button"
                      onClick={() => toggleTarget(target.scopeType, target.scopeId)}
                      className="flex items-center gap-1.5 rounded-full bg-surface-3 px-2.5 py-1 text-[12px] text-text-muted hover:text-text"
                      title="Убрать площадку"
                    >
                      {scopeLabel(
                        { scopeType: target.scopeType, scopeId: target.scopeId },
                        {
                          companyName: props.companyName,
                          branches: props.branches,
                          groups: props.groups,
                          screens: props.screens,
                        },
                      )}
                      <span aria-hidden>×</span>
                    </button>
                  ))}
                </div>
              ) : (
                <p className="text-[12px] text-warn">Отметьте хотя бы одну площадку.</p>
              )}
            </>
          ) : null}
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

        <div className="flex flex-wrap items-center gap-3">
          <Button size="sm" variant="primary" disabled={busy} onClick={() => void submit()}>
            {initial ? 'Сохранить изменения' : 'Создать кампанию'}
          </Button>
          {initial && props.onCancel ? (
            <Button size="sm" variant="ghost" disabled={busy} onClick={props.onCancel}>
              Отмена
            </Button>
          ) : null}
        </div>
      </CardBody>
    </Card>
  )
}