'use client'

import { useCallback, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Notice } from '@/components/ui/status-badge'
import { Button } from '@/components/ui/button'
import { Card, CardBody, CardHeader } from '@/components/ui/card'
import { saveCampaign } from '../api'
import { isoTime, localInstant } from '../format'
import type {
  CampaignDraft,
  CampaignView,
  CampaignWindowView,
  PlaylistVersionOption,
  ScopeOption,
  TargetDraft,
} from '../model'
import { CampaignTargetPicker } from './CampaignTargetPicker'
import { CampaignWindowsEditor } from './CampaignWindowsEditor'

/**
 * Форма кампании: создание и правка.
 *
 * Отдельная карточка, а не модальное окно: правил много, и прятать их
 * в диалог значит показать половину и потерять вторую.
 */
export function CampaignForm(props: {
  companyId: string
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
  const { initial } = props
  const [name, setName] = useState(initial?.name ?? '')
  const [kind, setKind] = useState<'internal' | 'commercial'>(initial?.kind ?? 'internal')
  const [priority, setPriority] = useState(initial?.priority ?? 0)
  const [startsOn, setStartsOn] = useState(initial?.startsOn ?? props.today)
  const [endsOn, setEndsOn] = useState(initial?.endsOn ?? '')
  const [startsTime, setStartsTime] = useState(isoTime(initial?.startsAt ?? null))
  const [endsTime, setEndsTime] = useState(isoTime(initial?.endsAt ?? null))
  const [approvalRequired, setApprovalRequired] = useState(initial?.approvalRequired ?? false)
  const [playlistVersionId, setPlaylistVersionId] = useState(initial?.playlistVersionId ?? '')
  const [allCompany, setAllCompany] = useState(
    initial ? initial.targets.some((target) => target.scopeType === 'company') : true,
  )
  const [targets, setTargets] = useState<TargetDraft[]>(
    initial ? initial.targets.filter((target): target is TargetDraft => target.scopeType !== 'company') : [],
  )
  const [windows, setWindows] = useState<CampaignWindowView[]>(initial?.windows ?? [])
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

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

    if (endsTime && !endsOn) {
      setError('Для времени окончания укажите дату окончания периода.')
      return
    }

    const startsAt = localInstant(startsOn, startsTime)
    const endsAt = localInstant(endsOn, endsTime)

    if (startsTime && !startsAt) {
      setError('Проверьте время начала периода.')
      return
    }

    if (endsTime && !endsAt) {
      setError('Проверьте время окончания периода.')
      return
    }

    if (startsAt && endsAt && new Date(endsAt).getTime() <= new Date(startsAt).getTime()) {
      setError('Окончание периода должно быть позже начала.')
      return
    }

    const draft: CampaignDraft = {
      name: name.trim(),
      kind,
      priority,
      startsOn,
      endsOn: endsOn || null,
      startsAt,
      endsAt,
      approvalRequired,
      playlistVersionId,
      // Запасной плейлист и часовой пояс в форме не редактируются, но при
      // сохранении их нельзя молча обнулить: PATCH заменяет кампанию целиком.
      fallbackPlaylistVersionId: initial?.fallbackPlaylistVersionId ?? null,
      timezoneOverride: initial?.timezoneOverride ?? null,
      targets: allCompany ? [{ scopeType: 'company', scopeId: props.companyId }] : targets,
      windows,
    }

    setBusy(true)

    try {
      const result = await saveCampaign(props.companyId, initial?.id ?? null, draft)

      if (!result.ok) {
        setError(result.message)
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
    endsTime,
    initial,
    kind,
    name,
    playlistVersionId,
    priority,
    props,
    router,
    startsOn,
    startsTime,
    targets,
    windows,
  ])

  return (
    <Card>
      <CardHeader
        title={initial ? `Изменить кампанию «${initial.name}»` : 'Новая кампания'}
        description="Кампания работает поверх обычного плейлиста: в выбранные дни и часы экраны показывают её контент, в остальное время — назначенный плейлист. Пустые окна показа означают «круглосуточно в срок действия»."
      />
      <CardBody className="flex flex-col gap-4">
        {error ? <Notice tone="danger">{error}</Notice> : null}
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
            Дата начала
            <input
              type="date"
              value={startsOn}
              onChange={(event) => setStartsOn(event.target.value)}
              className="field w-36"
            />
          </label>

          <label className="flex flex-col gap-1.5 text-[12.5px] font-medium text-text">
            Время начала
            <input
              type="time"
              value={startsTime}
              onChange={(event) => setStartsTime(event.target.value)}
              className="field w-28"
            />
          </label>

          <label className="flex flex-col gap-1.5 text-[12.5px] font-medium text-text">
            Дата окончания
            <input
              type="date"
              value={endsOn}
              onChange={(event) => setEndsOn(event.target.value)}
              className="field w-36"
            />
          </label>

          <label className="flex flex-col gap-1.5 text-[12.5px] font-medium text-text">
            Время окончания
            <input
              type="time"
              value={endsTime}
              onChange={(event) => setEndsTime(event.target.value)}
              className="field w-28"
            />
          </label>
        </div>

        <p className="text-[11.5px] text-text-subtle">
          Время можно не указывать: тогда кампания действует с начала первого дня по конец последнего.
          Если время задано, период начинается и заканчивается точно в этот момент.
        </p>

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

        <CampaignTargetPicker
          branches={props.branches}
          groups={props.groups}
          screens={props.screens}
          allCompany={allCompany}
          onAllCompanyChange={setAllCompany}
          targets={targets}
          onToggle={toggleTarget}
        />

        <CampaignWindowsEditor windows={windows} onChange={setWindows} />

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
