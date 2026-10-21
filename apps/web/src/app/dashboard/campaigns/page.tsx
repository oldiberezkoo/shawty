import type { Metadata } from 'next'
import { requireSession } from '@/server/auth/require-session'
import { createAccess, PERMISSIONS } from '@/domain/authz/permissions'
import { apiGet } from '@/server/api'
import { Notice } from '@/components/ui/status-badge'
import { CampaignsBoard } from './CampaignsBoard'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = { title: 'Кампании' }

export default async function CampaignsPage() {
  const session = await requireSession()
  const membership = session.companies[0]
  if (!membership) return null

  const access = createAccess(membership.role, membership.scopes)
  const companyId = membership.companyId

  const [campaignsData, structure, screensData, playlistsData] = await Promise.all([
    apiGet<{ campaigns: any[]; today: string }>('/api/dashboard/campaigns', companyId),
    apiGet<{ branches: any[]; groups: any[] }>('/api/dashboard/structure', companyId),
    apiGet<{ screens: any[] }>('/api/dashboard/screens', companyId),
    apiGet<{ playlists: any[]; versions: any[] }>('/api/dashboard/playlists', companyId),
  ])

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="page-title">Кампании</h1>
        <p className="mt-1 text-[13px] text-text-muted">
          Кампания — это не файл, а правило: кому, когда и что показывать. Расписание считает сервер, и при
          пересечении кампаний результат один и тот же на всей сети — приоритет, затем более узкая область, затем
          более свежая кампания.
        </p>
      </div>

      <Notice>
        Пример: «Скидка 20%» на экранах филиала «Центр» по будням с 10:00 до 20:00. Вне этого окна экраны
        показывают обычный назначенный плейлист — отдельно останавливать кампанию не нужно.
      </Notice>

      <CampaignsBoard
        companyId={companyId}
        companyName={membership.companyName}
        canWrite={access.can(PERMISSIONS.campaignsWrite)}
        canApprove={access.can(PERMISSIONS.campaignsApprove)}
        canPublish={access.can(PERMISSIONS.releasesPublish)}
        today={campaignsData.today}
        campaigns={campaignsData.campaigns.map((campaign) => ({
          id: campaign.id,
          name: campaign.name,
          kind: campaign.kind,
          priority: campaign.priority,
          status: campaign.status,
          startsOn: campaign.startsOn,
          endsOn: campaign.endsOn,
          startsAt: campaign.startsAt ?? null,
          endsAt: campaign.endsAt ?? null,
          approvalRequired: campaign.approvalRequired,
          playlistVersionId: campaign.playlistVersionId,
          playlistName: campaign.playlistName,
          playlistVersion: campaign.playlistVersion,
          fallbackPlaylistVersionId: campaign.fallbackPlaylistVersionId,
          timezoneOverride: campaign.timezoneOverride,
          targets: campaign.targets,
          windows: campaign.windows,
          withinDates: campaign.withinDates,
        }))}
        branches={structure.branches.map((branch) => ({ id: branch.id, name: branch.name }))}
        groups={structure.groups.map((group) => ({ id: group.id, name: group.name }))}
        screens={screensData.screens.map((screen) => ({ id: screen.id, name: screen.name }))}
        playlistVersions={playlistsData.versions.map((version) => ({
          id: version.id,
          label: version.playlistName,
        }))}
      />
    </div>
  )
}