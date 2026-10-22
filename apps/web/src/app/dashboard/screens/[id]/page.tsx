import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { requireSession } from '@/server/auth/require-session'
import { createAccess, PERMISSIONS } from '@/domain/authz/permissions'
import { apiGet, ApiError } from '@/server/api'
import { ScreenDetail } from '@/features/screens/ui/ScreenDetail'
import type { ScreenDetailView, ScreenProgramItem } from '@/features/screens/model'
import type { PlaylistVersionChoice } from '@/shared/lib/playlist-version'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = { title: 'Экран' }

/**
 * Карточка одного экрана.
 *
 * Страница только загружает данные и собирает карточку: представление живёт
 * в `features/screens/ui/ScreenDetail`.
 */
export default async function ScreenDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession()
  const membership = session.companies[0]
  if (!membership) return null

  const { id } = await params
  const access = createAccess(membership.role, membership.scopes)

  let screenData: { screen: ScreenDetailView; items: ScreenProgramItem[] }

  try {
    screenData = await apiGet<{ screen: ScreenDetailView; items: ScreenProgramItem[] }>(
      `/api/dashboard/screens/${id}`,
      membership.companyId,
    )
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) notFound()
    throw error
  }

  const [structure, playlistsData] = await Promise.all([
    apiGet<{
      branches: { id: string; name: string }[]
      groups: { id: string; name: string; branchId: string | null }[]
    }>('/api/dashboard/structure', membership.companyId),
    apiGet<{ versions: PlaylistVersionChoice[] }>('/api/dashboard/playlists', membership.companyId),
  ])

  return (
    <ScreenDetail
      companyId={membership.companyId}
      detail={screenData.screen}
      items={screenData.items}
      branches={structure.branches}
      groups={structure.groups}
      versions={playlistsData.versions}
      canWrite={access.can(PERMISSIONS.screensWrite)}
      canAssign={access.can(PERMISSIONS.releasesPublish)}
      canPublish={access.can(PERMISSIONS.releasesPublish)}
    />
  )
}
