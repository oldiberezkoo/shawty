import type { Metadata } from 'next'
import { requireSession } from '@/server/auth/require-session'
import { createAccess, PERMISSIONS } from '@/domain/authz/permissions'
import { deliverySummary, listAssignments, listRecentReleases, receiptsForRelease } from '@/server/services/release-service'
import { listBranches, listGroups } from '@/server/services/screen-service'
import { listPlaylists, listVersions } from '@/server/services/playlist-service'
import { DeliveryBoard } from './DeliveryBoard'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = { title: 'Публикация' }

export default async function ReleasesPage() {
  const session = await requireSession()
  const membership = session.companies[0]
  if (!membership) return null

  const access = createAccess(membership.role, membership.scopes)
  const canPublish = access.can(PERMISSIONS.releasesPublish)

  const companyId = membership.companyId
  const summary = deliverySummary(companyId)
  const releases = listRecentReleases(companyId)
  const assignments = listAssignments(companyId)

  const branches = listBranches(companyId)
  const groups = listGroups(companyId)
  const playlists = listPlaylists(companyId)

  // Версии нужны только для выбора в форме назначения.
  const versions = playlists.map((playlist) => ({
    playlistId: playlist.id,
    name: playlist.name,
    version: playlist.version,
    versions: listVersions(companyId, playlist.id).map((entry) => ({
      id: entry.id,
      version: entry.version,
    })),
  }))

  const latest = releases[0]
  const receipts = latest ? receiptsForRelease(latest.id) : []

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-[22px] font-semibold tracking-[-0.02em]">Публикация</h1>
        <p className="mt-1 text-[13px] text-text-muted">
          Не «опубликовано», а что произошло на экранах: отправлено, применили, грузят, нет связи. Числа
          обновляются сами — после публикации они меняются в течение нескольких секунд.
        </p>
      </div>

      <DeliveryBoard
        companyId={companyId}
        canPublish={canPublish}
        summary={summary}
        latestRelease={
          latest
            ? {
                version: latest.manifestVersion,
                createdAt: latest.createdAt.toISOString(),
                itemCount: latest.itemCount,
              }
            : null
        }
        receipts={receipts.map((receipt) => ({
          screenId: receipt.screenId,
          screenName: receipt.screenName,
          state: receipt.state,
          ackedAt: receipt.ackedAt ? receipt.ackedAt.toISOString() : null,
          errorCode: receipt.errorCode,
        }))}
        assignments={assignments.map((assignment) => ({
          id: assignment.id,
          scopeType: assignment.scopeType,
          scopeId: assignment.scopeId,
          playlistVersionId: assignment.playlistVersionId,
        }))}
        branches={branches.map((branch) => ({ id: branch.id, name: branch.name }))}
        groups={groups.map((group) => ({ id: group.id, name: group.name }))}
        playlistVersions={versions}
      />
    </div>
  )
}
