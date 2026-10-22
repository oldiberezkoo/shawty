'use client'

import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Card, CardBody, CardHeader } from '@/components/ui/card'
import { plural } from '@/shared/lib/plural'
import type { BranchView, ScreenRef } from '../model'

/** Филиалы: площадка, часовой пояс и привязанные экраны. */
export function BranchList(props: {
  branches: BranchView[]
  screens: ScreenRef[]
  canWrite: boolean
  busy: boolean
  onCreate: () => void
  onEdit: (branch: BranchView) => void
  onDelete: (branch: BranchView) => void
}) {
  return (
    <Card>
      <CardHeader
        title="Филиалы"
        description="Площадка с собственным часовым поясом. Расписание «с 09:00» считается в зоне филиала, поэтому магазин в другом городе не начинает день по чужому времени."
        action={
          props.canWrite ? (
            <Button size="md" variant="primary" onClick={props.onCreate}>
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

                  {props.canWrite ? (
                    <div className="flex gap-1">
                      <Button size="sm" variant="ghost" onClick={() => props.onEdit(branch)}>
                        Изменить
                      </Button>
                      <Button size="sm" variant="ghost" disabled={props.busy} onClick={() => props.onDelete(branch)}>
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
