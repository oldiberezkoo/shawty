import type { Metadata } from 'next'
import Link from 'next/link'
import { MonitorSmartphone } from 'lucide-react'
import { requireSession } from '@/server/auth/require-session'
import { createAccess, PERMISSIONS } from '@/domain/authz/permissions'
import { serverConfig } from '@/config/server'
import { listScreens } from '@/server/services/screen-service'
import { listPublishedVersions } from '@/server/services/playlist-service'
import { Card, EmptyState } from '@/components/ui/card'
import { Notice } from '@/components/ui/status-badge'
import { Button } from '@/components/ui/button'
import { ScreensBoard } from './ScreensBoard'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = { title: 'Экраны' }

function plural(value: number, one: string, few: string, many: string): string {
  const mod10 = value % 10
  const mod100 = value % 100
  if (mod10 === 1 && mod100 !== 11) return one
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few
  return many
}

/**
 * Парк экранов.
 *
 * Здесь же массовое действие: отметить несколько телевизоров и назначить им
 * один плейлист. Раньше назначить можно было только всей сети или по одному
 * экрану, а «средний» случай — пять витрин в одном филиале — требовал пяти
 * заходов.
 */
export default async function ScreensPage() {
  const session = await requireSession()
  const membership = session.companies[0]
  if (!membership) return null

  const access = createAccess(membership.role, membership.scopes)
  const screens = listScreens(membership.companyId)

  if (screens.length === 0) {
    return (
      <div className="flex flex-col gap-6">
        <div>
          <h1 className="page-title">Экраны</h1>
        </div>

        <Card>
          <EmptyState
            title="Экранов пока нет"
            hint="Телевизор показывает код — введите его на странице подключения. QR нужен, только если удобнее отсканировать камерой телефона."
            icon={<MonitorSmartphone className="size-5" strokeWidth={1.75} />}
            action={
              <Link href="/pair">
                <Button size="sm" variant="primary">
                  Подключить экран
                </Button>
              </Link>
            }
          />
        </Card>
      </div>
    )
  }

  const versions = listPublishedVersions(membership.companyId)
  const branches = new Set(screens.map((screen) => screen.branchName ?? 'Без филиала')).size

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="page-title">Экраны</h1>
          <p className="mt-1 max-w-[74ch] text-[13px] leading-relaxed text-text-muted">
            {screens.length} {plural(screens.length, 'экран', 'экрана', 'экранов')} в {branches}{' '}
            {plural(branches, 'филиале', 'филиалах', 'филиалах')}. Состояние считается по времени последнего
            heartbeat, а не по наличию соединения на сервере. Отметьте экраны, чтобы назначить им плейлист сразу
            всем.
          </p>
        </div>

        <Link href="/pair">
          <Button size="sm" variant="primary">
            Подключить экран
          </Button>
        </Link>
      </div>

      <Notice>
        Новый телевизор: откройте на нём{' '}
        <code className="rounded bg-surface px-1.5 py-0.5 font-mono text-[12px]">
          {serverConfig.publicUrl}/player/pairing
        </code>{' '}
        и введите показанный код на странице «Подключить экран».
      </Notice>

      <ScreensBoard
        companyId={membership.companyId}
        canAssign={access.can(PERMISSIONS.releasesPublish)}
        canPublish={access.can(PERMISSIONS.releasesPublish)}
        versions={versions.map((version) => ({
          id: version.id,
          playlistName: version.playlistName,
          version: version.version,
          itemCount: version.itemCount,
          totalDurationMs: version.totalDurationMs,
          isCurrent: version.isCurrent,
        }))}
        screens={screens.map((screen) => ({
          id: screen.id,
          name: screen.name,
          onlineState: screen.onlineState,
          branchId: screen.branchId,
          branchName: screen.branchName,
          groupId: screen.groupId,
          groupName: screen.groupName,
          deviceId: screen.deviceId,
          lastSeenSecondsAgo: screen.lastSeenSecondsAgo,
          playerVersion: screen.playerVersion,
          desiredVersion: screen.desiredVersion,
          appliedVersion: screen.appliedVersion,
        }))}
      />
    </div>
  )
}
