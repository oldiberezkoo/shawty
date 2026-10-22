'use client'

import { useCallback, useState } from 'react'
import { Button } from '@/components/ui/button'
import { FormError } from '@/components/ui/form'
import { Modal } from '@/components/ui/modal'
import { saveMemberScopes } from '../api'
import type { MemberView, ScopeDraft, ScopeOption } from '../model'

function ScopeChecklist(props: {
  title: string
  empty: string
  options: ScopeOption[]
  isSelected: (id: string) => boolean
  onToggle: (id: string) => void
}) {
  return (
    <div className="flex flex-col gap-2">
      <span className="text-[12px] font-medium text-text-muted">{props.title}</span>
      <div className="flex max-h-40 flex-col overflow-y-auto border border-border">
        {props.options.length === 0 ? (
          <p className="px-3 py-2 text-[12.5px] text-text-subtle">{props.empty}</p>
        ) : (
          props.options.map((option) => (
            <label
              key={option.id}
              className="flex cursor-pointer items-center gap-2 border-b border-border px-3 py-1.5 text-[13px] last:border-0 hover:bg-surface-2"
            >
              <input type="checkbox" checked={props.isSelected(option.id)} onChange={() => props.onToggle(option.id)} />
              <span className="truncate">{option.name}</span>
            </label>
          ))
        )}
      </div>
    </div>
  )
}

/** Ограничение доступа сотрудника: вся компания или выбранные площадки. */
export function ScopeDialog(props: {
  companyId: string
  member: MemberView
  branches: ScopeOption[]
  groups: ScopeOption[]
  screens: ScopeOption[]
  onClose: () => void
  onDone: () => void
}) {
  const { member } = props
  const [restricted, setRestricted] = useState(member.scopes.length > 0)
  const [selected, setSelected] = useState<ScopeDraft[]>(
    member.scopes.flatMap((scope) =>
      scope.scopeType === 'company'
        ? []
        : [{ scopeType: scope.scopeType as ScopeDraft['scopeType'], scopeId: scope.scopeId }],
    ),
  )
  const [screenQuery, setScreenQuery] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const query = screenQuery.trim().toLowerCase()
  const visibleScreens = query
    ? props.screens.filter(
        (screen) =>
          screen.name.toLowerCase().includes(query) || (screen.branchName ?? '').toLowerCase().includes(query),
      )
    : props.screens

  const toggle = (scopeType: ScopeDraft['scopeType'], scopeId: string) => {
    setSelected((current) =>
      current.some((scope) => scope.scopeType === scopeType && scope.scopeId === scopeId)
        ? current.filter((scope) => !(scope.scopeType === scopeType && scope.scopeId === scopeId))
        : [...current, { scopeType, scopeId }],
    )
  }

  const isSelected = (scopeType: ScopeDraft['scopeType'], scopeId: string) =>
    selected.some((scope) => scope.scopeType === scopeType && scope.scopeId === scopeId)

  const submit = useCallback(async () => {
    if (restricted && selected.length === 0) {
      setError('Отметьте хотя бы один филиал, группу или экран — иначе сотрудник не увидит ничего.')
      return
    }

    setError(null)
    setBusy(true)

    try {
      const result = await saveMemberScopes(props.companyId, member.membershipId, restricted ? selected : [])

      if (!result.ok) {
        setError(result.message)
        return
      }

      props.onDone()
    } finally {
      setBusy(false)
    }
  }, [member.membershipId, props, restricted, selected])

  return (
    <Modal
      open
      onClose={props.onClose}
      title={`Доступ: ${member.name}`}
      description="Ограничьте сотрудника его филиалом или группой экранов. Без ограничений он видит всю компанию, включая новые экраны."
      size="lg"
      footer={
        <>
          <Button size="sm" onClick={props.onClose}>
            Отмена
          </Button>
          <Button size="sm" variant="primary" disabled={busy} onClick={() => void submit()}>
            Сохранить доступ
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {error ? <FormError onDismiss={() => setError(null)}>{error}</FormError> : null}

        <div className="flex flex-col gap-2">
          <label className="flex cursor-pointer items-start gap-2 border border-border px-3 py-2 text-[13px]">
            <input
              type="radio"
              name="scope-mode"
              className="mt-0.5"
              checked={!restricted}
              onChange={() => setRestricted(false)}
            />
            <span>
              <span className="font-medium">Вся компания</span>
              <span className="mt-0.5 block text-[12px] text-text-subtle">
                Все текущие и будущие филиалы, группы и экраны.
              </span>
            </span>
          </label>

          <label className="flex cursor-pointer items-start gap-2 border border-border px-3 py-2 text-[13px]">
            <input
              type="radio"
              name="scope-mode"
              className="mt-0.5"
              checked={restricted}
              onChange={() => setRestricted(true)}
            />
            <span>
              <span className="font-medium">Только выбранное</span>
              <span className="mt-0.5 block text-[12px] text-text-subtle">
                Сотрудник увидит выбранные филиалы, группы и отдельные экраны.
              </span>
            </span>
          </label>
        </div>

        {restricted ? (
          <div className="flex max-h-[46vh] flex-col gap-4 overflow-y-auto border border-border p-3">
            <ScopeChecklist
              title="Филиалы"
              empty="Филиалов пока нет"
              options={props.branches}
              isSelected={(id) => isSelected('branch', id)}
              onToggle={(id) => toggle('branch', id)}
            />

            <ScopeChecklist
              title="Группы экранов"
              empty="Групп пока нет"
              options={props.groups}
              isSelected={(id) => isSelected('group', id)}
              onToggle={(id) => toggle('group', id)}
            />

            <div className="flex flex-col gap-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-[12px] font-medium text-text-muted">Экраны</span>
                <input
                  value={screenQuery}
                  onChange={(event) => setScreenQuery(event.target.value)}
                  className="field h-8 w-52"
                  placeholder="Найти экран или филиал"
                />
              </div>

              <div className="flex max-h-56 flex-col overflow-y-auto border border-border">
                {visibleScreens.length === 0 ? (
                  <p className="px-3 py-2 text-[12.5px] text-text-subtle">
                    {query ? 'Ничего не найдено.' : 'Экранов пока нет.'}
                  </p>
                ) : (
                  visibleScreens.map((screen) => (
                    <label
                      key={screen.id}
                      className="flex cursor-pointer items-center gap-2 border-b border-border px-3 py-1.5 text-[13px] last:border-0 hover:bg-surface-2"
                    >
                      <input
                        type="checkbox"
                        checked={isSelected('screen', screen.id)}
                        onChange={() => toggle('screen', screen.id)}
                      />
                      <span className="min-w-0 flex-1 truncate">
                        {screen.name}
                        {screen.branchName ? (
                          <span className="ml-1.5 text-[11px] text-text-subtle">{screen.branchName}</span>
                        ) : null}
                      </span>
                    </label>
                  ))
                )}
              </div>
            </div>

            <p className="text-[12px] text-text-subtle">
              Выбрано площадок: <span className="tnum text-text">{selected.length}</span>
            </p>
          </div>
        ) : null}
      </div>
    </Modal>
  )
}
