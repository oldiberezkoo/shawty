import type { Metadata } from 'next'
import { requireSession } from '@/server/auth/require-session'
import { createAccess, PERMISSIONS } from '@/domain/authz/permissions'
import { apiGet } from '@/server/api'
import { DeliveryBoard } from '@/features/releases/ui/DeliveryBoard'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = { title: 'Публикация' }

export default async function ReleasesPage() {
  const session = await requireSession()
  const membership = session.companies[0]
  if (!membership) return null

  const access = createAccess(membership.role, membership.scopes)
  const canPublish = access.can(PERMISSIONS.releasesPublish)

  const companyId = membership.companyId
  const [releasesData, structure, playlistsData] = await Promise.all([
    apiGet<{ assignments: any[]; releases: any[]; summary: any; receipts: any[] }>(
      '/api/dashboard/releases',
      companyId,
    ),
    apiGet<{ branches: any[]; groups: any[] }>('/api/dashboard/structure', companyId),
    apiGet<{ playlists: any[]; versions: any[] }>('/api/dashboard/playlists', companyId),
  ])

  const { summary, releases, assignments } = releasesData
  const branches = structure.branches
  const groups = structure.groups

  // В форме назначения — только текущая версия плейлиста: выбора версий
  // в продукте больше нет.
  const versions = playlistsData.versions.map((version) => ({
    playlistId: version.playlistId,
    name: version.playlistName,
    version: version.version,
    versions: [{ id: version.id, version: version.version }],
  }))

  const latest = releases[0]
  const receipts = releasesData.receipts

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="page-title">Публикация</h1>
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
                createdAt: new Date(latest.createdAt).toISOString(),
                itemCount: latest.itemCount,
              }
            : null
        }
        receipts={receipts.map((receipt) => ({
          screenId: receipt.screenId,
          screenName: receipt.screenName,
          state: receipt.state,
          ackedAt: receipt.ackedAt ? new Date(receipt.ackedAt).toISOString() : null,
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
