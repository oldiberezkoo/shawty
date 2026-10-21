import type { Metadata } from 'next'
import { requireSession } from '@/server/auth/require-session'
import { createAccess, PERMISSIONS } from '@/domain/authz/permissions'
import { publicConfig } from '@/config/public'
import { apiGet } from '@/server/api'
import { PlaylistList } from './PlaylistList'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = { title: 'Плейлисты' }

export default async function PlaylistsPage() {
  const session = await requireSession()
  const membership = session.companies[0]
  if (!membership) return null

  const access = createAccess(membership.role, membership.scopes)
  const [playlistsData, mediaData] = await Promise.all([
    apiGet<{ playlists: any[] }>('/api/dashboard/playlists', membership.companyId),
    apiGet<{ assets: any[] }>('/api/dashboard/media?state=ready', membership.companyId),
  ])
  const playlists = playlistsData.playlists
  const assets = mediaData.assets

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="page-title">Плейлисты</h1>
        <p className="mt-1 max-w-[74ch] text-[13px] leading-relaxed text-text-muted">
          Плейлист задаёт, что и в каком порядке играет на экране. Любое изменение сохраняется сразу и
          применяется к назначенным экранам автоматически — публиковать отдельно не нужно.
        </p>
      </div>

      <PlaylistList
        companyId={membership.companyId}
        canWrite={access.can(PERMISSIONS.playlistsWrite)}
        canUpload={access.can(PERMISSIONS.mediaWrite)}
        defaultImageDurationMs={publicConfig.defaultImageDurationMs}
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
          fileName: asset.fileName,
          mime: asset.mime,
          width: asset.width,
          height: asset.height,
          durationMs: asset.durationMs,
          hasPoster: Boolean(asset.posterSha256),
          posterSha256: asset.posterSha256,
          state: asset.state,
        }))}
      />
    </div>
  )
}
