'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardBody, CardHeader } from '@/components/ui/card'
import { scopeName } from '../format'
import type { AssignmentView, ScopeOption } from '../model'

/** Назначение плейлиста области и публикация на сеть. */
export function AssignmentPanel(props: {
  versionOptions: { id: string; label: string }[]
  assignments: AssignmentView[]
  branches: ScopeOption[]
  groups: ScopeOption[]
  busy: boolean
  onAssign: (scopeType: 'company' | 'branch' | 'group', scopeId: string, versionId: string) => void
  onPublish: () => void
}) {
  const [scopeType, setScopeType] = useState<'company' | 'branch' | 'group'>('company')
  const [scopeId, setScopeId] = useState('')
  const [versionId, setVersionId] = useState('')

  return (
    <Card>
      <CardHeader
        title="Назначение и публикация"
        description="Сначала назначьте плейлист области экранов, затем опубликуйте: назначение само по себе экран не меняет."
      />
      <CardBody className="flex flex-col gap-4">
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1.5 text-[12.5px] font-medium text-text">
            Область
            <select
              value={scopeType}
              onChange={(event) => {
                setScopeType(event.target.value as 'company' | 'branch' | 'group')
                setScopeId('')
              }}
              className="field w-40"
            >
              <option value="company">Вся компания</option>
              <option value="branch">Филиал</option>
              <option value="group">Группа экранов</option>
            </select>
          </label>

          {scopeType !== 'company' ? (
            <label className="flex flex-col gap-1.5 text-[12.5px] font-medium text-text">
              {scopeType === 'branch' ? 'Филиал' : 'Группа'}
              <select
                value={scopeId}
                onChange={(event) => setScopeId(event.target.value)}
                className="field w-56"
              >
                <option value="">Выберите</option>
                {(scopeType === 'branch' ? props.branches : props.groups).map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.name}
                  </option>
                ))}
              </select>
            </label>
          ) : null}

          <label className="flex flex-col gap-1.5 text-[12.5px] font-medium text-text">
            Плейлист
            <select
              value={versionId}
              onChange={(event) => setVersionId(event.target.value)}
              className="field w-64"
            >
              <option value="">Выберите</option>
              {props.versionOptions.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <Button size="md" disabled={props.busy} onClick={() => props.onAssign(scopeType, scopeId, versionId)}>
            Назначить
          </Button>

          <Button size="md" variant="primary" disabled={props.busy} onClick={props.onPublish}>
            Опубликовать на сеть
          </Button>
        </div>

        {props.versionOptions.length === 0 ? (
          <p className="text-[12px] text-text-subtle">
            Нет плейлистов. Сначала соберите плейлист в разделе «Плейлисты».
          </p>
        ) : null}

        {props.assignments.length > 0 ? (
          <div className="flex flex-col gap-1 border-t border-border pt-3">
            <span className="text-[12px] text-text-subtle">Текущие назначения</span>
            {props.assignments.map((assignment) => (
              <div key={assignment.id} className="flex items-center gap-2 text-[12px] text-text-muted">
                <span className=" bg-surface-3 px-1.5 py-0.5">{assignment.scopeType}</span>
                <span>{scopeName(assignment, props)}</span>
              </div>
            ))}
          </div>
        ) : null}
      </CardBody>
    </Card>
  )
}
