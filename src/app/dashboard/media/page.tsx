import type { Metadata } from 'next'
import { requireSession } from '@/server/auth/require-session'
import { PERMISSIONS } from '@/domain/authz/permissions'
import { createAccess } from '@/domain/authz/permissions'
import { listMedia, listFolders, storageUsage, formatBytes } from '@/server/services/media-service'
import { MediaLibrary } from './MediaLibrary'
import { Card, CardBody, CardHeader } from '@/components/ui/card'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = { title: 'Медиатека' }

export default async function MediaPage() {
  const session = await requireSession()
  const membership = session.companies[0]
  if (!membership) return null

  const access = createAccess(membership.role, membership.scopes)
  const canUpload = access.can(PERMISSIONS.mediaWrite)
  const canDelete = access.can(PERMISSIONS.mediaDelete)

  const assets = listMedia(membership.companyId)
  const folders = listFolders(membership.companyId)
  const usage = storageUsage(membership.companyId)

  const percent = usage.limitBytes > 0 ? Math.min(100, (usage.usedBytes / usage.limitBytes) * 100) : 0

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-end justify-between gap-6">
        <div>
          <h1 className="text-[22px] font-semibold tracking-[-0.02em]">Медиатека</h1>
          <p className="mt-1 text-[13px] text-text-muted">
            Файлы хранятся один раз по содержимому: повторная загрузка того же файла
            не создаёт новый ассет.
          </p>
        </div>
      </div>

      <Card>
        <CardHeader
          title="Хранилище"
          description={`${usage.files} файлов · ${formatBytes(usage.usedBytes)} из ${formatBytes(usage.limitBytes)}`}
        />
        <CardBody>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-3">
            <div
              className={`h-full transition-[width] ${percent > 90 ? 'bg-danger' : percent > 70 ? 'bg-warn' : 'bg-text'}`}
              style={{ width: `${percent}%` }}
            />
          </div>
          <p className="mt-2 text-[12px] text-text-subtle">
            Видео приводится к единому профилю MP4/H.264, поэтому после обработки размер
            может отличаться от загруженного.
          </p>
        </CardBody>
      </Card>

      <MediaLibrary
        companyId={membership.companyId}
        canUpload={canUpload}
        canDelete={canDelete}
        folders={folders.map((folder) => ({ id: folder.id, name: folder.name }))}
        initialAssets={assets
          // Шаблон — это документ макета (P9), а не файл для показа.
          // В сетку медиатеки он не попадает, пока не будет отрендерен в ассет.
          .filter((asset) => asset.kind !== 'template' && asset.state !== 'archived')
          .map((asset) => ({
            id: asset.id,
            fileName: asset.fileName,
            kind: asset.kind === 'video' ? ('video' as const) : ('image' as const),
            state:
              asset.state === 'processing'
                ? ('processing' as const)
                : asset.state === 'failed'
                  ? ('failed' as const)
                  : ('ready' as const),
            mime: asset.mime,
            bytes: asset.bytes,
            width: asset.width,
            height: asset.height,
            durationMs: asset.durationMs,
            transcoded: asset.transcoded,
            error: asset.error,
            hasPoster: Boolean(asset.posterSha256),
            createdAt: asset.createdAt.toISOString(),
          }))}
      />
    </div>
  )
}
