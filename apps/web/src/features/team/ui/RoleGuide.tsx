'use client'

import { Card, CardBody, CardHeader } from '@/components/ui/card'
import { areaHint, roleAreas } from '../roles'
import type { RoleOption } from '../model'

/** Справка по ролям: области работы вместо перечня прав. */
export function RoleGuide(props: { roles: RoleOption[] }) {
  return (
    <Card>
      <CardHeader
        title="Что может каждая роль"
        description="Области показывают, что роль меняет. Читать экраны, плейлисты и отчёты может любая роль; доступ к части филиалов ограничивается кнопкой «Доступ» у сотрудника."
      />
      <CardBody>
        <ul className="flex flex-col gap-3">
          {props.roles.map((role) => (
            <li key={role.role} className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
              <span className="w-32 shrink-0 text-[13px] font-medium">{role.label}</span>
              <span className="flex flex-wrap gap-1.5">
                {roleAreas(role.permissions).map((area) => (
                  <span
                    key={area}
                    title={areaHint(area)}
                    className=" border border-border px-2 py-0.5 text-[12px] text-text-muted"
                  >
                    {area}
                  </span>
                ))}
              </span>
            </li>
          ))}
        </ul>
      </CardBody>
    </Card>
  )
}
