'use client'

import Link from 'next/link'
import { useCallback, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardBody, CardHeader } from '@/components/ui/card'
import { Modal } from '@/components/ui/modal'
import { FormError, FormField, FormSuccess, SelectField } from '@/components/ui/form'
import { CSRF_COOKIE } from '@/lib/cookie-names'

export type BranchView = {
  id: string
  name: string
  code: string | null
  timezone: string | null
  screens: number
}

export type GroupView = {
  id: string
  name: string
  branchId: string | null
  branchName: string | null
  screens: number
}

export type ScreenRef = {
  id: string
  name: string
  branchId: string | null
  groupId: string | null
}

/** Частые зоны: подсказка, а не ограничение — поле остаётся текстовым. */
const TIMEZONE_HINTS = ['Asia/Tashkent', 'Asia/Samarkand', 'Asia/Almaty', 'Europe/Moscow', 'Asia/Bishkek']

function readCsrf(): string {
  const match = document.cookie.match(new RegExp(`(?:^|; )${CSRF_COOKIE}=([^;]+)`))
  return match?.[1] ? decodeURIComponent(match[1]) : ''
}

function plural(value: number, one: string, few: string, many: string): string {
  const mod10 = value % 10
  const mod100 = value % 100
  if (mod10 === 1 && mod100 !== 11) return one
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few
  return many
}

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
  const [deleteTarget, setDeleteTarget] = useState<{ kind: 'branch' | 'group'; id: string; name: string } | null>(null)

  const call = useCallback(
    async (path: string, init: RequestInit) => {
      setError(null)
      setNotice(null)
      setBusy(true)

      const response = await fetch(path, {
        ...init,
        headers: {
          'content-type': 'application/json',
          'x-company-id': props.companyId,
          'x-csrf-token': readCsrf(),
        },
      })

      setBusy(false)

      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as { error?: { message?: string } } | null
        setError(data?.error?.message ?? 'Не удалось выполнить действие')
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

  const branchOptions = props.branches.map((branch) => ({ value: branch.id, label: branch.name }))

  return (
    <div className="flex flex-col gap-4">
      {error ? <FormError onDismiss={() => setError(null)}>{error}</FormError> : null}
      {notice ? <FormSuccess onDismiss={() => setNotice(null)}>{notice}</FormSuccess> : null}

      <datalist id="timezone-hints">
        {TIMEZONE_HINTS.map((zone) => (
          <option key={zone} value={zone} />
        ))}
      </datalist>

      <Card>
        <CardHeader
          title="Филиалы"
          description="Площадка с собственным часовым поясом. Расписание «с 09:00» считается в зоне филиала, поэтому магазин в другом городе не начинает день по чужому времени."
          action={
            props.canWriteBranches ? (
              <Button size="md" variant="primary" onClick={() => setBranchModal({ mode: 'create' })}>
                Добавить филиал
              </Button>
            ) : null
          }
        />

        <CardBody className="p-0">
          {props.branches.length === 0 ? (
            <p className="px-6 py-6 text-[13px] text-text-muted">
              Филиалов пока нет. Экраны без филиала работают по часовому поясу компании.
            </p>
          ) : (
            <ul>
              {props.branches.map((branch) => {
                const screens = props.screens.filter((screen) => screen.branchId === branch.id)

                return (
                  <li key={branch.id} className="flex flex-wrap items-start gap-x-4 gap-y-2 border-b border-border px-6 py-4 last:border-0">
                    <div className="min-w-[200px] flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-[14px] font-medium">{branch.name}</span>
                        {branch.code ? <span className="font-mono text-[12px] text-text-subtle">{branch.code}</span> : null}
                      </div>

                      <div className="mt-1 text-[12.5px] text-text-muted">
                        {branch.screens} {plural(branch.screens, 'экран', 'экрана', 'экранов')} · зона{' '}
                        {branch.timezone ?? 'компании'}
                      </div>

                      {screens.length > 0 ? (
                        <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1">
                          {screens.slice(0, 8).map((screen) => (
                            <Link
                              key={screen.id}
                              href={`/dashboard/screens/${screen.id}`}
                              className="text-[12px] text-primary hover:underline"
                            >
                              {screen.name}
                            </Link>
                          ))}
                          {screens.length > 8 ? (
                            <span className="text-[12px] text-text-subtle">и ещё {screens.length - 8}</span>
                          ) : null}
                        </div>
                      ) : null}
                    </div>

                    {props.canWriteBranches ? (
                      <div className="flex gap-1">
                        <Button size="sm" variant="ghost" onClick={() => setBranchModal({ mode: 'edit', branch })}>
                          Изменить
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={busy}
                          onClick={() => setDeleteTarget({ kind: 'branch', id: branch.id, name: branch.name })}
                        >
                          Удалить
                        </Button>
                      </div>
                    ) : null}
                  </li>
                )
              })}
            </ul>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title="Группы экранов"
          description="Подбор внутри филиала: «витрина», «касса», «вход». Группе можно назначить плейлист и запустить на ней кампанию, не перечисляя экраны по одному."
          action={
            props.canWriteGroups ? (
              <Button size="md" variant="primary" onClick={() => setGroupModal({ mode: 'create' })}>
                Добавить группу
              </Button>
            ) : null
          }
        />

        <CardBody className="p-0">
          {props.groups.length === 0 ? (
            <p className="px-6 py-6 text-[13px] text-text-muted">
              Групп пока нет. Они нужны, когда внутри площадки есть разные наборы экранов: витрина, касса, склад.
            </p>
          ) : (
            <ul>
              {props.groups.map((group) => {
                const screens = props.screens.filter((screen) => screen.groupId === group.id)

                return (
                  <li key={group.id} className="flex flex-wrap items-start gap-x-4 gap-y-2 border-b border-border px-6 py-4 last:border-0">
                    <div className="min-w-[200px] flex-1">
                      <span className="text-[14px] font-medium">{group.name}</span>

                      <div className="mt-1 text-[12.5px] text-text-muted">
                        {group.branchName ?? 'Без филиала'} · {group.screens}{' '}
                        {plural(group.screens, 'экран', 'экрана', 'экранов')}
                      </div>

                      {screens.length > 0 ? (
                        <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1">
                          {screens.slice(0, 8).map((screen) => (
                            <Link
                              key={screen.id}
                              href={`/dashboard/screens/${screen.id}`}
                              className="text-[12px] text-primary hover:underline"
                            >
                              {screen.name}
                            </Link>
                          ))}
                        </div>
                      ) : null}
                    </div>

                    {props.canWriteGroups ? (
                      <div className="flex gap-1">
                        <Button size="sm" variant="ghost" onClick={() => setGroupModal({ mode: 'edit', group })}>
                          Изменить
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={busy}
                          onClick={() => setDeleteTarget({ kind: 'group', id: group.id, name: group.name })}
                        >
                          Удалить
                        </Button>
                      </div>
                    ) : null}
                  </li>
                )
              })}
            </ul>
          )}
        </CardBody>
      </Card>

      <Modal
        open={branchModal !== null}
        onClose={() => setBranchModal(null)}
        title={branchModal?.mode === 'edit' ? 'Филиал' : 'Новый филиал'}
        description="Часовой пояс можно не указывать: тогда филиал работает по зоне компании."
        footer={
          <>
            <Button size="md" onClick={() => setBranchModal(null)}>
              Отмена
            </Button>
            <Button size="md" variant="primary" type="submit" form="branch-form" disabled={busy}>
              Сохранить
            </Button>
          </>
        }
      >
        <form
          id="branch-form"
          className="flex flex-col gap-3"
          onSubmit={(event) => {
            event.preventDefault()
            const form = event.currentTarget
            void saveBranch(form, branchModal?.mode === 'edit' ? branchModal.branch.id : undefined)
          }}
        >
          <FormField
            label="Название"
            name="name"
            defaultValue={branchModal?.mode === 'edit' ? branchModal.branch.name : ''}
            placeholder="Например, «ТРЦ Compass»"
            required
            autoFocus
            maxLength={120}
          />

          <FormField
            label="Код"
            name="code"
            defaultValue={branchModal?.mode === 'edit' ? (branchModal.branch.code ?? '') : ''}
            placeholder="Необязательно: короткий код площадки"
            maxLength={32}
          />

          <FormField
            label="Часовой пояс"
            name="timezone"
            list="timezone-hints"
            defaultValue={branchModal?.mode === 'edit' ? (branchModal.branch.timezone ?? '') : ''}
            placeholder="Asia/Tashkent"
            maxLength={64}
            description="Формат IANA. Если пусто — берётся зона компании."
          />
        </form>
      </Modal>

      <Modal
        open={groupModal !== null}
        onClose={() => setGroupModal(null)}
        title={groupModal?.mode === 'edit' ? 'Группа экранов' : 'Новая группа'}
        description="Группа — это набор экранов внутри филиала. Экраны добавляются в неё на карточке экрана."
        footer={
          <>
            <Button size="md" onClick={() => setGroupModal(null)}>
              Отмена
            </Button>
            <Button size="md" variant="primary" type="submit" form="group-form" disabled={busy}>
              Сохранить
            </Button>
          </>
        }
      >
        <form
          id="group-form"
          className="flex flex-col gap-3"
          onSubmit={(event) => {
            event.preventDefault()
            const form = event.currentTarget
            void saveGroup(form, groupModal?.mode === 'edit' ? groupModal.group.id : undefined)
          }}
        >
          <FormField
            label="Название"
            name="name"
            defaultValue={groupModal?.mode === 'edit' ? groupModal.group.name : ''}
            placeholder="Например, «Витрина»"
            required
            autoFocus
            maxLength={120}
          />

          <SelectField
            label="Филиал"
            name="branchId"
            defaultValue={groupModal?.mode === 'edit' ? (groupModal.group.branchId ?? '') : ''}
            placeholder="Без филиала"
            options={[{ value: '', label: 'Без филиала' }, ...branchOptions]}
          />
        </form>
      </Modal>

      <Modal
        open={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        title={deleteTarget?.kind === 'branch' ? 'Удалить филиал?' : 'Удалить группу?'}
        description={
          deleteTarget?.kind === 'branch'
            ? `«${deleteTarget.name}» будет удалён. Экраны останутся в сети без филиала, группы филиала тоже сохранятся.`
            : `«${deleteTarget?.name ?? ''}» будет удалена. Экраны останутся без группы.`
        }
        size="sm"
        footer={
          <>
            <Button size="md" onClick={() => setDeleteTarget(null)}>
              Отмена
            </Button>
            <Button size="md" variant="danger" disabled={busy} onClick={() => void remove()}>
              Удалить
            </Button>
          </>
        }
      >
        <p className="text-[13px] text-text-muted">
          Если на филиал или группу назначен плейлист либо ссылается кампания, удаление будет отклонено: сначала
          снимите назначение.
        </p>
      </Modal>
    </div>
  )
}
