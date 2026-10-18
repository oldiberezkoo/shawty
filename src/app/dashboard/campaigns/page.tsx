import type { Metadata } from 'next'
import { requireSession } from '@/server/auth/require-session'
import { createAccess, PERMISSIONS } from '@/domain/authz/permissions'
import { listCampaigns } from '@/server/services/campaign-service'
import { companyToday } from '@/server/services/schedule-service'
import { listBranches, listGroups, listScreens } from '@/server/services/screen-service'
import { listPlaylists, listVersions } from '@/server/services/playlist-service'
import { CampaignsBoard } from './CampaignsBoard'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = { title: 'Кампании' }

export default async function CampaignsPage() {
  const session = await requireSession()
  const membership = session.companies[0]
  if (!membership) return null

  const access = createAccess(membership.role, membership.scopes)
  const companyId = membership.companyId

  const playlists = listPlaylists(companyId)

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-[22px] font-semibold tracking-[-0.02em]">Кампании</h1>
        <p className="mt-1 text-[13px] text-text-muted">
          Кампания — это не файл, а правило: кому, когда и что показывать. Расписание считает сервер, и при
          пересечении кампаний результат один и тот же на всей сети — приоритет, затем более узкая область, затем
          более свежая кампания.
        </p>
      </div>

      <CampaignsBoard
        companyId={companyId}
        canWrite={access.can(PERMISSIONS.campaignsWrite)}
        canApprove={access.can(PERMISSIONS.campaignsApprove)}
        canPublish={access.can(PERMISSIONS.releasesPublish)}
        today={companyToday(companyId)}
        campaigns={listCampaigns(companyId).map((campaign) => ({
          id: campaign.id,
          name: campaign.name,
          kind: campaign.kind,
          priority: campaign.priority,
          status: campaign.status,
          startsOn: campaign.startsOn,
          endsOn: campaign.endsOn,
          approvalRequired: campaign.approvalRequired,
          playlistVersionId: campaign.playlistVersionId,
          playlistVersion: campaign.playlistVersion,
          targets: campaign.targets,
          windows: campaign.windows,
          withinDates: campaign.withinDates,
        }))}
        branches={listBranches(companyId).map((branch) => ({ id: branch.id, name: branch.name }))}
        groups={listGroups(companyId).map((group) => ({ id: group.id, name: group.name }))}
        screens={listScreens(companyId).map((screen) => ({ id: screen.id, name: screen.name }))}
        playlistVersions={playlists.flatMap((playlist) =>
          listVersions(companyId, playlist.id).map((entry) => ({
            id: entry.id,
            label: `${playlist.name} · версия ${entry.version}`,
          })),
        )}
      />
    </div>
  )
}