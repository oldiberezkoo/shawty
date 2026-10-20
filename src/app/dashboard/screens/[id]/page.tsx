import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft, MonitorPlay } from 'lucide-react'
import { requireSession } from '@/server/auth/require-session'
import { createAccess, PERMISSIONS } from '@/domain/authz/permissions'
import { describePlatform, getBranchOptions, getGroupOptions, getScreenDetail, listScreens } from '@/server/services/screen-service'
import { listPublishedVersions, versionItems } from '@/server/services/playlist-service'
import { Card, CardBody, CardHeader, EmptyState } from '@/components/ui/card'
import { StatusBadge } from '@/components/ui/status-badge'
import { Badge } from '@/components/ui/status-badge'
import { Button } from '@/components/ui/button'
import { formatDuration } from '@/domain/playlist/rules'
import { formatDeviceId } from '@/lib/ids'
import { ScreenActions } from './ScreenActions'
import { Sparkline } from './Sparkline'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = { title: 'Экран' }

function plural(value: number, one: string, few: string, many: string): string {
  const mod10 = value % 10
  const mod100 = value % 100
  if (mod10 === 1 && mod100 !== 11) return one
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few
  return many
}

function formatMoment(value: Date | string | null): string {
  if (!value) return '—'
  return new Date(value).toLocaleString('ru-RU', { dateStyle: 'short', timeStyle: 'short' })
}

function relativeTime(seconds: number | null): string {
  if (seconds === null) return 'ни разу'
  if (seconds < 60) return `${seconds} сек назад`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes} мин назад`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} ч назад`
  return `${Math.floor(hours / 24)} дн назад`
}

function number(value: number | null, suffix = ''): string {
  return value === null || value === undefined ? '—' : `${value}${suffix}`
}

/**
 * Карточка одного экрана.
 *
 * Здесь собрано всё, что нужно при разборе «что с этим телевизором»: что он
 * показывает сейчас, что должен показывать по расписанию, как у него со связью
 * и железом, и на что он жаловался. Раньше эти сведения были разложены по
 * четырём разделам, и связать их можно было только в голове.
 */
export default async function ScreenDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession()
  const membership = session.companies[0]
  if (!membership) return null

  const { id } = await params
  const screens = listScreens(membership.companyId)

  if (!screens.some((screen) => screen.id === id)) notFound()

  const access = createAccess(membership.role, membership.scopes)
  const detail = getScreenDetail(membership.companyId, id)
  const branches = getBranchOptions(membership.companyId)
  const groups = getGroupOptions(membership.companyId)
  const versions = listPublishedVersions(membership.companyId)

  const items = detail.planned ? versionItems(detail.planned.id) : []
  const history = [...detail.telemetryHistory].reverse()
  const capabilities = detail.capabilities ?? {}
  const userAgent = typeof capabilities.userAgent === 'string' ? capabilities.userAgent : null
  const platform =
    typeof capabilities.platform === 'string' ? capabilities.platform : describePlatform(userAgent)
  const deviceMemoryGb = typeof capabilities.deviceMemoryGb === 'number' ? capabilities.deviceMemoryGb : null
  const hardwareConcurrency =
    typeof capabilities.hardwareConcurrency === 'number' ? capabilities.hardwareConcurrency : null

  const screen = capabilities.screen as { width?: number; height?: number } | undefined

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <Link href="/dashboard/screens" className="inline-flex items-center gap-1.5 text-[12.5px] text-text-muted hover:text-text">
          <ArrowLeft className="size-3.5" strokeWidth={1.9} />
          Все экраны
        </Link>

        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="page-title">{detail.name}</h1>
            <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-text-muted">
              <StatusBadge state={detail.onlineState} />
              <span>{detail.branchName ?? 'Без филиала'}</span>
              <span>·</span>
              <span>{detail.groupName ?? 'Без группы'}</span>
              <span>·</span>
              <span>связь: {relativeTime(detail.lastSeenSecondsAgo)}</span>
              {detail.deviceId ? <span className="font-mono text-[12px]">· {formatDeviceId(detail.deviceId)}</span> : null}
            </p>
          </div>
        </div>
      </div>

      <ScreenActions
        companyId={membership.companyId}
        screen={{
          id: detail.id,
          name: detail.name,
          branchId: detail.branchId,
          groupId: detail.groupId,
          offlineAfterSec: detail.offlineAfterSec,
        }}
        branches={branches.map((branch) => ({ id: branch.id, name: branch.name }))}
        groups={groups.map((group) => ({ id: group.id, name: group.name, branchId: group.branchId }))}
        versions={versions.map((version) => ({
          id: version.id,
          playlistName: version.playlistName,
          version: version.version,
          itemCount: version.itemCount,
          totalDurationMs: version.totalDurationMs,
          isCurrent: version.isCurrent,
        }))}
        canWrite={access.can(PERMISSIONS.screensWrite)}
        canAssign={access.can(PERMISSIONS.releasesPublish)}
        canPublish={access.can(PERMISSIONS.releasesPublish)}
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader
            title="Что показывается"
            description="«Сейчас» — выбор расписания и кампаний. «Выложено» — версия, которую экран подтвердил."
          />
          <CardBody className="flex flex-col gap-3">
            <div className="flex flex-col gap-1">
              <span className="text-[12px] text-text-subtle">Сейчас</span>
              <span className="text-[14px] font-medium">
                {detail.planned ? `${detail.planned.name} · версия ${detail.planned.version}` : 'Ничего не назначено'}
              </span>
              {detail.nextChangeAt ? (
                <span className="text-[12.5px] text-text-muted">Смена программы: {formatMoment(detail.nextChangeAt)}</span>
              ) : (
                <span className="text-[12.5px] text-text-subtle">В пределах недели смен нет</span>
              )}
            </div>

            <div className="flex flex-col gap-1 border-t border-border pt-3">
              <span className="text-[12px] text-text-subtle">Выложено на экран</span>
              <span className="text-[14px] font-medium">
                {detail.published ? `${detail.published.name} · версия ${detail.published.version}` : 'Публикаций не было'}
              </span>
              <span className="text-[12.5px] text-text-muted">
                {detail.appliedVersion === null
                  ? 'Экран ещё не подтверждал применение'
                  : `Подтверждена версия публикации ${detail.appliedVersion}`}
                {detail.desiredVersion !== null && detail.desiredVersion !== detail.appliedVersion
                  ? ` · ждёт версию ${detail.desiredVersion}`
                  : ''}
              </span>
            </div>

            <div className="border-t border-border pt-3 text-[12.5px] text-text-muted">
              Показано материалов за сутки: <span className="tnum font-medium text-text">{detail.playedLast24h}</span>
            </div>

            {detail.planned ? (
              <Link href="/dashboard/playlists" className="text-[12.5px] text-primary hover:underline">
                Открыть плейлисты, чтобы изменить состав →
              </Link>
            ) : (
              <p className="text-[12.5px] text-text-subtle">
                Назначьте плейлист кнопкой выше — экран начнёт показывать программу сразу после публикации.
              </p>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title="Связь и устройство"
            description="Замеры приходят вместе с heartbeat: раз в четыре минуты. Пропуск означает, что браузер не смог измерить, а не ноль."
          />
          <CardBody className="flex flex-col gap-4">
            <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-[13px]">
              <div>
                <dt className="text-[12px] text-text-subtle">Отклик (ping)</dt>
                <dd className="tnum font-medium">{number(detail.telemetry?.pingMs ?? null, ' мс')}</dd>
              </div>
              <div>
                <dt className="text-[12px] text-text-subtle">Скорость канала</dt>
                <dd className="tnum font-medium">
                  {detail.telemetry?.downlinkKbps !== null && detail.telemetry?.downlinkKbps !== undefined
                    ? `${(detail.telemetry.downlinkKbps / 1000).toFixed(1)} Мбит/с`
                    : '—'}
                </dd>
              </div>
              <div>
                <dt className="text-[12px] text-text-subtle">Оценка сети браузером</dt>
                <dd className="tnum font-medium">{number(detail.telemetry?.networkRttMs ?? null, ' мс')}</dd>
              </div>
              <div>
                <dt className="text-[12px] text-text-subtle">Загрузка состояния</dt>
                <dd className="tnum font-medium">{number(detail.telemetry?.stateLatencyMs ?? null, ' мс')}</dd>
              </div>
              <div>
                <dt className="text-[12px] text-text-subtle">Тип сети</dt>
                <dd className="font-medium">{detail.telemetry?.effectiveType ?? '—'}</dd>
              </div>
              <div>
                <dt className="text-[12px] text-text-subtle">Последний замер</dt>
                <dd className="font-medium">{formatMoment(detail.telemetry?.at ?? null)}</dd>
              </div>
              <div>
                <dt className="text-[12px] text-text-subtle">Платформа</dt>
                <dd className="font-medium">{platform ?? '—'}</dd>
              </div>
              <div>
                <dt className="text-[12px] text-text-subtle">Экран устройства</dt>
                <dd className="tnum font-medium">
                  {screen?.width && screen?.height ? `${screen.width}×${screen.height}` : '—'}
                </dd>
              </div>
              <div>
                <dt className="text-[12px] text-text-subtle">Память устройства</dt>
                <dd className="tnum font-medium">{deviceMemoryGb !== null ? `${deviceMemoryGb} ГБ` : '—'}</dd>
              </div>
              <div>
                <dt className="text-[12px] text-text-subtle">Ядра процессора</dt>
                <dd className="tnum font-medium">{hardwareConcurrency !== null ? hardwareConcurrency : '—'}</dd>
              </div>
            </dl>

            <div className="flex flex-col gap-2 border-t border-border pt-3">
              <span className="text-[12px] text-text-subtle">Ping, мс — последние замеры</span>
              <Sparkline values={history.map((sample) => sample.pingMs)} label="Ping по последним замерам" />
            </div>

            <div className="flex flex-col gap-2">
              <span className="text-[12px] text-text-subtle">Скорость канала, Кбит/с</span>
              <Sparkline
                values={history.map((sample) => sample.downlinkKbps)}
                label="Скорость канала по последним замерам"
                tone="warn"
              />
            </div>

            {userAgent ? (
              <p className="truncate border-t border-border pt-3 text-[11.5px] text-text-subtle" title={userAgent}>
                {userAgent}
              </p>
            ) : null}
          </CardBody>
        </Card>
      </div>

      <Card>
        <CardHeader
          title="Состав программы"
          description="Материалы той версии, которая показывается на этом экране. Порядок — как у телевизора."
        />
        <CardBody className="p-0">
          {items.length === 0 ? (
            <EmptyState
              title="Показывать нечего"
              hint="У этого экрана нет программы: ни постоянного назначения, ни активной кампании. Назначьте плейлист — карточка сразу покажет состав."
              icon={<MonitorPlay className="size-5" strokeWidth={1.75} />}
            />
          ) : (
            <ul>
              {items.map((item) => (
                <li key={item.id} className="flex items-center gap-3 border-b border-border px-6 py-2.5 last:border-0">
                  <span className="tnum w-6 shrink-0 text-[12px] text-text-subtle">{item.position + 1}</span>

                  {item.hasPoster ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={`/api/dashboard/media/file?companyId=${membership.companyId}&assetId=${item.assetId}&variant=poster`}
                      alt=""
                      className="h-9 w-16 shrink-0 rounded-[var(--radius-sm)] bg-surface-2 object-cover"
                      loading="lazy"
                    />
                  ) : (
                    <span className="flex h-9 w-16 shrink-0 items-center justify-center rounded-[var(--radius-sm)] bg-surface-2 text-[10px] text-text-subtle">
                      {item.kind === 'video' ? '▶ видео' : 'изображение'}
                    </span>
                  )}

                  <span className="min-w-0 flex-1 truncate text-[13px]">{item.fileName ?? item.mime}</span>
                  <Badge tone="neutral">{item.kind === 'video' ? 'Видео' : 'Изображение'}</Badge>
                  <span className="tnum w-20 shrink-0 text-right text-[12px] text-text-subtle">
                    {formatDuration(item.durationMs)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="Инциденты" description="Открытые и закрытые случаи потери связи и ошибок плеера." />
          <CardBody className="p-0">
            {detail.incidents.length === 0 ? (
              <p className="px-6 py-6 text-[13px] text-text-muted">За всё время инцидентов не было.</p>
            ) : (
              <ul>
                {detail.incidents.map((incident) => (
                  <li key={incident.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-border px-6 py-3 last:border-0">
                    <span className="text-[13px] font-medium">{incident.type}</span>
                    {incident.closedAt ? <Badge tone="success">закрыт</Badge> : <Badge tone="warn">открыт</Badge>}
                    <span className="text-[12px] text-text-muted">с {formatMoment(incident.openedAt)}</span>
                    {incident.closedAt ? (
                      <span className="text-[12px] text-text-muted">по {formatMoment(incident.closedAt)}</span>
                    ) : null}
                    {incident.detail ? <span className="text-[12px] text-text-subtle">{incident.detail}</span> : null}
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Ошибки плеера" description="Последние сообщения самого телевизора: что именно он не смог." />
          <CardBody className="p-0">
            {detail.errors.length === 0 ? (
              <p className="px-6 py-6 text-[13px] text-text-muted">Экран не сообщал об ошибках.</p>
            ) : (
              <ul>
                {detail.errors.map((error) => (
                  <li key={`${error.code}-${error.at.toISOString()}`} className="border-b border-border px-6 py-3 last:border-0">
                    <div className="flex items-center justify-between gap-3">
                      <span className="font-mono text-[12px] text-danger">{error.code}</span>
                      <span className="text-[12px] text-text-subtle">{formatMoment(error.at)}</span>
                    </div>
                    <p className="mt-1 text-[12.5px] text-text-muted">{error.message}</p>
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>
      </div>

      <Card>
        <CardHeader
          title="Как включить показ на телевизоре"
          description="Экран уже привязан. Дальше нужен только браузер в режиме киоска — тогда показ переживёт перезагрузку."
        />
        <CardBody className="flex flex-col gap-3 text-[13px] text-text-muted">
          <p>
            Откройте на телевизоре адрес{' '}
            <span className="rounded-[var(--radius-xs)] bg-surface-2 px-1.5 py-0.5 font-mono text-[12.5px] text-text">
              /player/display
            </span>{' '}
            — страница сама найдёт сохранённые учётные данные и начнёт показ. Код привязки вводить повторно не нужно.
          </p>

          <ul className="flex list-disc flex-col gap-1.5 pl-5">
            <li>Киоск-режим браузера убирает адресную строку и запрещает случайные выходы.</li>
            <li>Отключите заставку и спящий режим телевизора: система считает, что показ идёт.</li>
            <li>
              Если экран напишет «{plural(1, 'Нужна', 'Нужна', 'Нужна')} повторная привязка», значит браузер очистил
              локальные данные — понадобится новый код на <Link href="/pair" className="text-primary hover:underline">странице подключения</Link>.
            </li>
            <li>Связь с этим экраном: {relativeTime(detail.lastSeenSecondsAgo)}. Плеер {detail.playerVersion ?? 'не сообщил версию'}.</li>
          </ul>

          <div className="flex flex-wrap gap-2 pt-1">
            <Link href="/dashboard/monitoring">
              <Button size="sm">Открыть мониторинг</Button>
            </Link>
            <Link href="/dashboard/scheduling">
              <Button size="sm">Расписание</Button>
            </Link>
            <Link href="/dashboard/releases">
              <Button size="sm">Публикации</Button>
            </Link>
          </div>
        </CardBody>
      </Card>
    </div>
  )
}
