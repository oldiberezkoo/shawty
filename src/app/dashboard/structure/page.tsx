import type { Metadata } from 'next'
import { requireSession } from '@/server/auth/require-session'
import { createAccess, PERMISSIONS } from '@/domain/authz/permissions'
import { listScreens } from '@/server/services/screen-service'
import { listBranchViews, listGroupViews } from '@/server/services/structure-service'
import { StructureBoard } from './StructureBoard'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = { title: 'Структура сети' }

/**
 * Структура сети.
 *
 * Отдельная страница, потому что филиалы и группы — не настройки экрана:
 * их заводят один раз и потом используют в расписании, кампаниях и правах
 * доступа. Раньше они появлялись только вместе с привязкой телевизора.
 */
export default async function StructurePage() {
  const session = await requireSession()
  const membership = session.companies[0]
  if (!membership) return null

  const access = createAccess(membership.role, membership.scopes)
  const branches = listBranchViews(membership.companyId)
  const groups = listGroupViews(membership.companyId)

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="page-title">Структура сети</h1>
        <p className="mt-1 max-w-[74ch] text-[13px] leading-relaxed text-text-muted">
          Филиалы задают площадки и часовые пояса, группы — наборы экранов внутри площадки. И то, и другое можно
          выбирать как область показа: назначить плейлист или запустить кампанию сразу на филиал или на группу.
        </p>
      </div>

      <StructureBoard
        companyId={membership.companyId}
        branches={branches}
        groups={groups}
        screens={listScreens(membership.companyId).map((screen) => ({
          id: screen.id,
          name: screen.name,
          branchId: screen.branchId,
          groupId: screen.groupId,
        }))}        canWriteBranches={access.can(PERMISSIONS.branchesWrite)}
        canWriteGroups={access.can(PERMISSIONS.groupsWrite)}
      />
    </div>
  )
}
