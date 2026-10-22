'use client'

import { Button } from '@/components/ui/button'
import { Card, CardBody, CardHeader } from '@/components/ui/card'
import { describeScope } from '@/shared/lib/scope-label'
import { periodLabel, STATUS_LABEL, windowLabel } from '../format'
import type { CampaignView, ScopeOption } from '../model'

/** Карточка выбранной кампании: условия и действия по её состоянию. */
export function CampaignDetails(props: {
  campaign: CampaignView
  canWrite: boolean
  canApprove: boolean
  canPublish: boolean
  busy: boolean
  branches: ScopeOption[]
  groups: ScopeOption[]
  screens: ScopeOption[]
  onEdit: () => void
  onAct: (action: string) => void
  onRemove: () => void
}) {
  const { campaign } = props
  const scopes = { branches: props.branches, groups: props.groups, screens: props.screens }

  return (
    <Card>
      <CardHeader
        title={campaign.name}
        description={`${STATUS_LABEL[campaign.status] ?? campaign.status} · ${
          campaign.approvalRequired ? 'требуется согласование' : 'без согласования'
        }`}
      />
      <CardBody className="flex flex-col gap-3">
        <div className="flex flex-col gap-1.5 text-[13px] text-text-muted">
          <p>
            Показывает{' '}
            <span className="font-medium text-text">
              {campaign.playlistName ? campaign.playlistName : 'плейлист не выбран'}
            </span>{' '}
            {campaign.targets.length > 0 ? 'на ' : ''}
            {campaign.targets.map((target) => describeScope(target, scopes)).join(', ')}
            {campaign.windows.length === 0
              ? ' круглосуточно'
              : `: ${campaign.windows.map(windowLabel).join('; ')}`}
            .
          </p>

          <p>
            Срок: {periodLabel(campaign.startsOn, campaign.startsAt)} —{' '}
            {campaign.endsOn ? periodLabel(campaign.endsOn, campaign.endsAt) : 'бессрочно'}
            {campaign.withinDates ? ' (идёт по датам)' : ' (вне текущих дат)'}. Приоритет {campaign.priority}.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3 border-t border-border pt-3">
          {props.canWrite ? (
            <Button size="sm" onClick={props.onEdit}>
              Изменить условия
            </Button>
          ) : null}

          {campaign.status === 'in_review' || campaign.status === 'draft' ? (
            <Button
              size="sm"
              variant="primary"
              disabled={props.busy || !props.canApprove}
              title={props.canApprove ? undefined : 'Согласование доступно не этой роли'}
              onClick={() => props.onAct('approve')}
            >
              Согласовать
            </Button>
          ) : null}

          {campaign.status === 'approved' || campaign.status === 'scheduled' ? (
            <Button size="sm" disabled={props.busy || !props.canWrite} onClick={() => props.onAct('activate')}>
              Перевести в «идёт»
            </Button>
          ) : null}

          {campaign.status === 'approved' || campaign.status === 'scheduled' || campaign.status === 'active' ? (
            <Button size="sm" disabled={props.busy || !props.canWrite} onClick={() => props.onAct('end')}>
              Завершить
            </Button>
          ) : null}

          <Button
            size="sm"
            variant="primary"
            disabled={props.busy || !props.canPublish || campaign.status === 'in_review' || campaign.status === 'draft'}
            title={
              campaign.status === 'in_review' || campaign.status === 'draft'
                ? 'Сначала согласуйте кампанию'
                : undefined
            }
            onClick={() => props.onAct('publish_now')}
          >
            Опубликовать сейчас
          </Button>

          <Button
            size="sm"
            variant="danger"
            disabled={props.busy || !props.canWrite || campaign.status === 'active'}
            onClick={props.onRemove}
          >
            Удалить
          </Button>
        </div>
      </CardBody>
    </Card>
  )
}
