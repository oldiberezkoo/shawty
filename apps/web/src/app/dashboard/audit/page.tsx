import type { Metadata } from 'next'
import { requireSession } from '@/server/auth/require-session'
import { createAccess, PERMISSIONS } from '@/domain/authz/permissions'
import { AuditLog } from './AuditLog'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = { title: 'Журнал действий' }

export default async function AuditPage() {
  const session = await requireSession()
  const membership = session.companies[0]
  if (!membership) return null

  const access = createAccess(membership.role, membership.scopes)

  // Страница закрыта по праву, а не прячется на клиенте: журнал показывает, кто
  // отвязывал экраны и удалял файлы, и роль «аналитик» его видеть не должна.
  if (!access.can(PERMISSIONS.auditRead)) {
    return (
      <div className="flex flex-col gap-2">
        <h1 className="page-title">Журнал действий</h1>
        <p className="text-[13px] text-text-muted">
          У вашей роли нет доступа к журналу. Он показывает, кто отвязывал экраны, удалял файлы и публиковал
          контент, — и доступен администраторам и владельцу.
        </p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="page-title">Журнал действий</h1>
        <p className="mt-1 text-[13px] text-text-muted">
          Кто и когда отвязывал экраны, удалял файлы, согласовывал кампании и выпускал публикации. Запись
          появляется только после успешного действия и живёт в той же транзакции, что и само действие.
        </p>
      </div>

      <AuditLog companyId={membership.companyId} />
    </div>
  )
}