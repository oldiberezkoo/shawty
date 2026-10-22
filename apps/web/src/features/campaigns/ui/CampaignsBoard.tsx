'use client'

import { useCallback, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Notice } from '@/components/ui/status-badge'
import { dashboardRequest } from '@/shared/api/dashboard-client'
import type { CampaignView, PlaylistVersionOption, ScopeOption } from '../model'
import { CampaignDetails } from './CampaignDetails'
import { CampaignForm } from './CampaignForm'
import { CampaignTable } from './CampaignTable'

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
        const result = await dashboardRequest<Record<string, unknown>>(
          path,
          { method, body: body === undefined ? undefined : JSON.stringify(body) },
          props.companyId,
        )

        if (!result.ok) {
          setError(result.message)
          return null
        }

        return result.data
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
      {error ? <Notice tone="danger">{error}</Notice> : null}
      {notice ? <Notice>{notice}</Notice> : null}

      <CampaignTable
        campaigns={props.campaigns}
        selectedId={selectedId}
        onSelect={setSelectedId}
        branches={props.branches}
        groups={props.groups}
        screens={props.screens}
      />

      {selected ? (
        <CampaignDetails
          campaign={selected}
          canWrite={props.canWrite}
          canApprove={props.canApprove}
          canPublish={props.canPublish}
          busy={busy}
          branches={props.branches}
          groups={props.groups}
          screens={props.screens}
          onEdit={() => setEditing(selected)}
          onAct={(action) => void act(action)}
          onRemove={() => void remove()}
        />
      ) : null}

      {props.canWrite ? (
        <CampaignForm
          key={editing?.id ?? 'new'}
          companyId={props.companyId}
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
