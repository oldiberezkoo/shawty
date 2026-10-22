import type { Metadata } from 'next'
import Link from 'next/link'
import { MonitorSmartphone } from 'lucide-react'
import { requireSession } from '@/server/auth/require-session'
import { createAccess, PERMISSIONS } from '@/domain/authz/permissions'
import { publicConfig } from '@/config/public'
import { apiGet } from '@/server/api'
import { Card, EmptyState } from '@/components/ui/card'
import { Notice } from '@/components/ui/status-badge'
import { Button } from '@/components/ui/button'
import { ScreensBoard } from '@/features/screens/ui/ScreensBoard'
import type { ScreenRow } from '@/features/screens/model'
import { plural } from '@/shared/lib/plural'
import type { PlaylistVersionChoice } from '@/shared/lib/playlist-version'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = { title: 'Экраны' }

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
  const { screens, versions } = await apiGet<{
    screens: ScreenRow[]
    versions: PlaylistVersionChoice[]
  }>('/api/dashboard/screens', membership.companyId)

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
        <code className=" bg-surface px-1.5 py-0.5 font-mono text-[12px]">
          {publicConfig.appUrl}/player/pairing
        </code>{' '}
        и введите показанный код на странице «Подключить экран».
      </Notice>

      <ScreensBoard
        companyId={membership.companyId}
        canAssign={access.can(PERMISSIONS.releasesPublish)}
        canPublish={access.can(PERMISSIONS.releasesPublish)}
        versions={versions}
        screens={screens}
      />
    </div>
  )
}
