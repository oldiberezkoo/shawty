import type { Metadata } from 'next'
import { requireSession } from '@/server/auth/require-session'
import { createAccess, PERMISSIONS } from '@/domain/authz/permissions'
import { apiGet } from '@/server/api'
import { ScheduleBoard } from '@/features/scheduling/ui/ScheduleBoard'
import type { PlaylistVersionChoice } from '@/shared/lib/playlist-version'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = { title: 'Расписание' }

export default async function SchedulingPage() {
  const session = await requireSession()
  const membership = session.companies[0]
  if (!membership) return null

  const access = createAccess(membership.role, membership.scopes)
  const { versions } = await apiGet<{ versions: PlaylistVersionChoice[] }>(
    '/api/dashboard/playlists',
    membership.companyId,
  )

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="page-title">Расписание</h1>
        <p className="mt-1 max-w-[74ch] text-[13px] leading-relaxed text-text-muted">
          Что должно идти на каждом экране сейчас и когда программа сменится. Окна считаются в часовом поясе
          филиала: «с 09:00» в Самарканде и в Ташкенте — это разное время. Здесь же назначается постоянная
          программа: отметьте экраны и выберите плейлист.
        </p>
      </div>

      <ScheduleBoard
        companyId={membership.companyId}
        canAssign={access.can(PERMISSIONS.releasesPublish)}
        canPublish={access.can(PERMISSIONS.releasesPublish)}
        versions={versions}
      />
    </div>
  )
}
