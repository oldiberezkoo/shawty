'use client'

import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Card, CardBody, CardHeader } from '@/components/ui/card'
import { plural } from '@/shared/lib/plural'
import type { GroupView, ScreenRef } from '../model'

/** Группы экранов внутри филиала. */
export function GroupList(props: {
  groups: GroupView[]
  screens: ScreenRef[]
  canWrite: boolean
  busy: boolean
  onCreate: () => void
  onEdit: (group: GroupView) => void
  onDelete: (group: GroupView) => void
}) {
  return (
    <Card>
      <CardHeader
        title="Группы экранов"
        description="Подбор внутри филиала: «витрина», «касса», «вход». Группе можно назначить плейлист и запустить на ней кампанию, не перечисляя экраны по одному."
        action={
          props.canWrite ? (
            <Button size="md" variant="primary" onClick={props.onCreate}>
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

                  {props.canWrite ? (
                    <div className="flex gap-1">
                      <Button size="sm" variant="ghost" onClick={() => props.onEdit(group)}>
                        Изменить
                      </Button>
                      <Button size="sm" variant="ghost" disabled={props.busy} onClick={() => props.onDelete(group)}>
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
  )
}
