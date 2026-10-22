'use client'

import { useCallback, useState } from 'react'
import { useRouter } from 'next/navigation'
import { FormError, FormSuccess } from '@/components/ui/form'
import { dashboardRequest } from '@/shared/api/dashboard-client'
import type { BranchView, DeleteTarget, GroupView, ScreenRef } from '../model'
import { BranchDialog } from './BranchDialog'
import { BranchList } from './BranchList'
import { DeleteStructureDialog } from './DeleteStructureDialog'
import { GroupDialog } from './GroupDialog'
import { GroupList } from './GroupList'

/**
 * Филиалы и группы.
 *
 * Филиал отвечает за площадку и часовой пояс, группа — за подбор экранов
 * внутри площадки («витрина», «касса»). До этого раздела обе сущности
 * появлялись только вместе с привязкой телевизора, и переименовать филиал
 * было нечем.
 */
export function StructureBoard(props: {
  companyId: string
  branches: BranchView[]
  groups: GroupView[]
  screens: ScreenRef[]
  canWriteBranches: boolean
  canWriteGroups: boolean
}) {
  const router = useRouter()

  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const [branchModal, setBranchModal] = useState<{ mode: 'create' } | { mode: 'edit'; branch: BranchView } | null>(null)
  const [groupModal, setGroupModal] = useState<{ mode: 'create' } | { mode: 'edit'; group: GroupView } | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null)

  const call = useCallback(
    async (path: string, init: RequestInit) => {
      setError(null)
      setNotice(null)
      setBusy(true)

      const result = await dashboardRequest(path, init, props.companyId)

      setBusy(false)

      if (!result.ok) {
        setError(result.message)
        return false
      }

      router.refresh()
      return true
    },
    [props.companyId, router],
  )

  const saveBranch = useCallback(
    async (form: HTMLFormElement, id?: string) => {
      const data = new FormData(form)
      const name = String(data.get('name') ?? '').trim()
      const code = String(data.get('code') ?? '').trim()
      const timezone = String(data.get('timezone') ?? '').trim()

      const payload = { kind: 'branch', name, code: code || null, timezone: timezone || null }

      const ok = id
        ? await call('/api/dashboard/structure', { method: 'PATCH', body: JSON.stringify({ ...payload, id }) })
        : await call('/api/dashboard/structure', { method: 'POST', body: JSON.stringify(payload) })

      if (!ok) return

      setBranchModal(null)
      setNotice(id ? 'Филиал изменён.' : 'Филиал создан. Теперь к нему можно привязать экраны.')
    },
    [call],
  )

  const saveGroup = useCallback(
    async (form: HTMLFormElement, id?: string) => {
      const data = new FormData(form)
      const name = String(data.get('name') ?? '').trim()
      const branchId = String(data.get('branchId') ?? '')

      const payload = { kind: 'group', name, branchId: branchId || null }

      const ok = id
        ? await call('/api/dashboard/structure', { method: 'PATCH', body: JSON.stringify({ ...payload, id }) })
        : await call('/api/dashboard/structure', { method: 'POST', body: JSON.stringify(payload) })

      if (!ok) return

      setGroupModal(null)
      setNotice(id ? 'Группа изменена.' : 'Группа создана.')
    },
    [call],
  )

  const remove = useCallback(async () => {
    if (!deleteTarget) return

    const params = new URLSearchParams({ kind: deleteTarget.kind, id: deleteTarget.id })
    const ok = await call(`/api/dashboard/structure?${params.toString()}`, { method: 'DELETE' })

    if (!ok) return

    setDeleteTarget(null)
    setNotice(deleteTarget.kind === 'branch' ? 'Филиал удалён.' : 'Группа удалена.')
  }, [call, deleteTarget])

  return (
    <div className="flex flex-col gap-4">
      {error ? <FormError onDismiss={() => setError(null)}>{error}</FormError> : null}
      {notice ? <FormSuccess onDismiss={() => setNotice(null)}>{notice}</FormSuccess> : null}

      <BranchList
        branches={props.branches}
        screens={props.screens}
        canWrite={props.canWriteBranches}
        busy={busy}
        onCreate={() => setBranchModal({ mode: 'create' })}
        onEdit={(branch) => setBranchModal({ mode: 'edit', branch })}
        onDelete={(branch) => setDeleteTarget({ kind: 'branch', id: branch.id, name: branch.name })}
      />

      <GroupList
        groups={props.groups}
        screens={props.screens}
        canWrite={props.canWriteGroups}
        busy={busy}
        onCreate={() => setGroupModal({ mode: 'create' })}
        onEdit={(group) => setGroupModal({ mode: 'edit', group })}
        onDelete={(group) => setDeleteTarget({ kind: 'group', id: group.id, name: group.name })}
      />

      <BranchDialog
        open={branchModal !== null}
        branch={branchModal?.mode === 'edit' ? branchModal.branch : null}
        busy={busy}
        onClose={() => setBranchModal(null)}
        onSave={(form, id) => void saveBranch(form, id)}
      />

      <GroupDialog
        open={groupModal !== null}
        group={groupModal?.mode === 'edit' ? groupModal.group : null}
        branches={props.branches}
        busy={busy}
        onClose={() => setGroupModal(null)}
        onSave={(form, id) => void saveGroup(form, id)}
      />

      <DeleteStructureDialog
        target={deleteTarget}
        busy={busy}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => void remove()}
      />
    </div>
  )
}
