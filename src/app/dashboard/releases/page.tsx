import type { Metadata } from 'next'
import Link from 'next/link'
import { requireSession } from '@/server/auth/require-session'
import { createAccess, PERMISSIONS } from '@/domain/authz/permissions'
import { deliverySummary, listAssignments, listRecentReleases, receiptsForRelease } from '@/server/services/release-service'
import { listBranches, listGroups } from '@/server/services/screen-service'
import { listPlaylists, listVersions } from '@/server/services/playlist-service'
import { Card, CardBody, CardHeader } from '@/components/ui/card'
import { DeliveryBoard } from './DeliveryBoard'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = { title: 'Публикация' }

function relativeTime(date: Date | null): string {
  if (!date) return '—'
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000)
  if (seconds < 60) return `${seconds} сек назад`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes} мин назад`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} ч назад`
  return `${Math.floor(hours / 24)} дн назад`
}

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
      items: entry.totalDurationMs,
    })),
  }))

  const latest = releases[0]
  const receipts = latest ? receiptsForRelease(latest.id) : []

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-[22px] font-semibold tracking-[-0.02em]">Публикация</h1>
        <p className="mt-1 text-[13px] text-text-muted">
          Не «опубликовано», а что произошло на экранах: отправлено, применили, грузят, нет связи.
        </p>
      </div>

      <DeliveryBoard
        companyId={companyId}
        canPublish={canPublish}
        summary={summary}
        releases={releases.map((release) => ({
          id: release.id,
          version: release.manifestVersion,
          createdAt: release.createdAt.toISOString(),
          itemCount: release.itemCount,
        }))}
        latestReceipts={
          latest
            ? receipts.map((receipt) => ({
                screenId: receipt.screenId,
                screenName: receipt.screenName,
                state: receipt.state,
                ackedAt: receipt.ackedAt ? receipt.ackedAt.toISOString() : null,
              }))
            : []
        }
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

      {latest ? (
        <Card>
          <CardHeader
            title={`Публикация №${latest.manifestVersion}`}
            description={`${relativeTime(latest.createdAt)} · ${latest.itemCount} материалов · ${
              receipts.length
            } экранов`}
          />
          <CardBody className="p-0">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="border-b border-border text-left text-[12px] text-text-subtle">
                  <th className="px-5 py-2 font-normal">Экран</th>
                  <th className="px-5 py-2 font-normal">Состояние доставки</th>
                  <th className="px-5 py-2 text-right font-normal">Подтверждено</th>
                </tr>
              </thead>
              <tbody>
                {receipts.map((receipt) => (
                  <tr key={receipt.screenId} className="border-b border-border last:border-0">
                    <td className="px-5 py-2">
                      <Link
                        href="/dashboard/screens"
                        className="font-medium hover:underline underline-offset-4"
                      >
                        {receipt.screenName}
                      </Link>
                    </td>
                    <td className="px-5 py-2 text-text-muted">{receipt.state}</td>
                    <td className="px-5 py-2 text-right text-text-muted">
                      {receipt.ackedAt ? relativeTime(receipt.ackedAt) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardBody>
        </Card>
      ) : null}
    </div>
  )
}
