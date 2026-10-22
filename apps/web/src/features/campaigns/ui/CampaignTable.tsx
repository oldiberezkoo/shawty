'use client'

import { Card, CardBody, CardHeader } from '@/components/ui/card'
import { describeScope } from '@/shared/lib/scope-label'
import { periodLabel, STATUS_LABEL, STATUS_TONE, windowLabel } from '../format'
import type { CampaignView, ScopeOption } from '../model'

/** Таблица кампаний: выбор строки открывает карточку условий. */
export function CampaignTable(props: {
  campaigns: CampaignView[]
  selectedId: string | null
  onSelect: (id: string) => void
  branches: ScopeOption[]
  groups: ScopeOption[]
  screens: ScopeOption[]
}) {
  return (
    <Card>
      <CardHeader
        title="Кампании"
        description="Кампания задаёт, что и когда идёт на экранах. При пересечении расписаний побеждает приоритет, затем более узкая область, а при равенстве — более свежая кампания."
      />
      <CardBody className="p-0">
        <div className="@container w-full overflow-x-auto">
          <table className="stack-table w-full border-collapse text-[13px]">
            <thead>
              <tr className="border-b border-border text-left text-[12px] text-text-subtle">
                <th className="px-5 py-2 font-normal">Кампания</th>
                <th className="px-5 py-2 font-normal">Что показывает</th>
                <th className="px-5 py-2 font-normal">Состояние</th>
                <th className="px-5 py-2 font-normal">Сроки</th>
                <th className="px-5 py-2 font-normal">Расписание</th>
                <th className="px-5 py-2 text-right font-normal">Приоритет</th>
              </tr>
            </thead>
            <tbody>
              {props.campaigns.map((campaign) => (
                <tr
                  key={campaign.id}
                  onClick={() => props.onSelect(campaign.id)}
                  className={`cursor-pointer border-b border-border last:border-0 ${
                    campaign.id === props.selectedId ? 'bg-surface-2' : ''
                  }`}
                >
                  <td data-primary className="px-5 py-2">
                    <span className="font-medium">{campaign.name}</span>
                    {campaign.kind === 'commercial' ? (
                      <span className="ml-2  bg-surface-3 px-1.5 py-0.5 text-[11px] text-text-muted">реклама</span>
                    ) : null}
                    <span className="mt-0.5 block text-[12px] text-text-subtle">
                      {campaign.targets.length === 0
                        ? 'площадки не выбраны'
                        : campaign.targets
                            .map((target) =>
                              describeScope(target, {
                                branches: props.branches,
                                groups: props.groups,
                                screens: props.screens,
                              }),
                            )
                            .join(', ')}
                    </span>
                  </td>
                  <td data-label="Что показывает" className="px-5 py-2 text-text-muted">
                    {campaign.playlistName ? (
                      <>{campaign.playlistName}</>
                    ) : (
                      <span className="text-text-subtle">плейлист не выбран</span>
                    )}
                  </td>
                  <td data-label="Состояние" className={`px-5 py-2 ${STATUS_TONE[campaign.status] ?? 'text-text-muted'}`}>
                    {STATUS_LABEL[campaign.status] ?? campaign.status}
                    {!campaign.withinDates && campaign.status !== 'ended' ? (
                      <span className="ml-2 text-[12px] text-text-subtle">вне сроков</span>
                    ) : null}
                  </td>
                  <td data-label="Сроки" className="px-5 py-2 text-text-muted">
                    {periodLabel(campaign.startsOn, campaign.startsAt)} —{' '}
                    {campaign.endsOn ? periodLabel(campaign.endsOn, campaign.endsAt) : 'бессрочно'}
                  </td>
                  <td data-label="Расписание" className="px-5 py-2 text-text-muted">
                    {campaign.windows.length === 0 ? (
                      'круглосуточно'
                    ) : (
                      campaign.windows.map((window, index) => (
                        <div key={index}>{windowLabel(window)}</div>
                      ))
                    )}
                  </td>
                  <td data-label="Приоритет" className="tnum px-5 py-2 text-right text-text-muted">{campaign.priority}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {props.campaigns.length === 0 ? (
          <p className="px-5 py-4 text-[13px] text-text-subtle">
            Кампаний пока нет. Без них экраны показывают назначенный плейлист постоянно.
          </p>
        ) : null}
      </CardBody>
    </Card>
  )
}
