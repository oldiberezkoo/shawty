import type { Metadata } from 'next'
import { requireSession } from '@/server/auth/require-session'
import { createAccess, PERMISSIONS } from '@/domain/authz/permissions'
import { listPlaylists } from '@/server/services/playlist-service'
import { listMedia } from '@/server/services/media-service'
import { PlaylistList } from './PlaylistList'
import { Card, CardBody } from '@/components/ui/card'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = { title: 'Плейлисты' }

export default async function PlaylistsPage() {
  const session = await requireSession()
  const membership = session.companies[0]
  if (!membership) return null

  const access = createAccess(membership.role, membership.scopes)
  const playlists = listPlaylists(membership.companyId)
  const assets = listMedia(membership.companyId, { state: 'ready' })

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-[22px] font-semibold tracking-[-0.02em]">Плейлисты</h1>
        <p className="mt-1 text-[13px] text-text-muted">
          Порядок показа и длительность слайдов. Публикация фиксирует версию:
          после этого правки черновика не меняют то, что уже играет на экранах.
        </p>
      </div>

      <PlaylistList
        companyId={membership.companyId}
        canWrite={access.can(PERMISSIONS.playlistsWrite)}
        canPublish={access.can(PERMISSIONS.playlistsPublish)}
        initialPlaylists={playlists.map((playlist) => ({
          id: playlist.id,
          name: playlist.name,
          state: playlist.state,
          version: playlist.version,
          items: playlist.items,
          cycleDurationMs: playlist.cycleDurationMs,
          assigned: playlist.assigned,
        }))}
        availableAssets={assets.map((asset) => ({
          id: asset.id,
          kind: asset.kind,
          mime: asset.mime,
          width: asset.width,
          height: asset.height,
          durationMs: asset.durationMs,
          hasPoster: Boolean(asset.posterSha256),
        }))}
      />

      {playlists.length === 0 ? (
        <Card>
          <CardBody className="py-10 text-center text-[13px] text-text-muted">
            Плейлистов пока нет. Создайте первый и добавьте в него файлы из медиатеки.
          </CardBody>
        </Card>
      ) : null}
    </div>
  )
}
