import type { ReactNode } from 'react'

/**
 * Плитка метрики.
 *
 * Число крупное, подпись сверху, пояснение снизу. Раньше плитки собирались
 * прямо на страницах и различались размером числа (2xl, 3xl), из-за чего ряд
 * из четырёх чисел выглядел как четыре разных виджета.
 */
export function MetricTile({
  label,
  value,
  hint,
  tone = 'default',
  trend,
}: {
  label: string
  value: string | number
  hint?: ReactNode
  tone?: 'default' | 'success' | 'warn' | 'danger' | 'info'
  trend?: { value: string; tone: 'good' | 'bad' | 'flat' }
}) {
  const toneClass: Record<string, string> = {
    default: 'text-text',
    success: 'text-success',
    warn: 'text-warn',
    danger: 'text-danger',
    info: 'text-info',
  }

  const trendClass: Record<string, string> = {
    good: 'text-success',
    bad: 'text-danger',
    flat: 'text-text-subtle',
  }

  return (
    <div className="card flex flex-col gap-1.5 px-4 py-3.5">
      <span className="text-[12px] leading-tight text-text-muted">{label}</span>

      <div className="flex items-baseline gap-2">
        <span className={`tnum text-[26px] leading-none font-semibold tracking-[-0.02em] ${toneClass[tone]}`}>{value}</span>
        {trend ? (
          <span className={`text-[12px] font-medium ${trendClass[trend.tone]}`}>{trend.value}</span>
        ) : null}
      </div>

      {hint ? <span className="text-[12px] leading-snug text-text-subtle">{hint}</span> : null}
    </div>
  )
}

/**
 * Шкала потребления.
 *
 * Полоса с заливкой по доле лимита и порогом в 80%. Заливка меняет цвет при
 * приближении к пределу: жёлтый до 80%, красный после. Прибавление новых
 * экранов проверяется по этой же шкале, и цвет обязан совпадать с отказом.
 *
 * Подписи приходят готовыми строками, а не функцией форматирования. Так
 * компонент остаётся пригодным для клиентских экранов: функцию с сервера
 * передать через границу нельзя, а строку можно. Побочный плюс — чтение
 * чисел остаётся на сервере, где оно и было задумано.
 */
export function UsageBar({
  used,
  limit,
  label,
  usedText,
  limitText,
}: {
  used: number
  limit: number
  label: string
  usedText: string
  limitText: string
}) {
  const percent = limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 0
  const tone = percent >= 100 ? 'bg-danger' : percent >= 80 ? 'bg-warn' : 'bg-info'

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 text-[13px]">
        <span className="text-text">{label}</span>
        <span className="tnum text-text-muted">
          {usedText} <span className="text-text-subtle">из {limitText}</span>
        </span>
      </div>

      <div
        className="h-1.5 w-full overflow-hidden rounded-full bg-surface-3"
        role="progressbar"
        aria-valuenow={percent}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`${label}: ${usedText} из ${limitText}`}
      >
        <div className={`h-full rounded-full transition-[width] duration-300 ${tone}`} style={{ width: `${percent}%` }} />
      </div>
    </div>
  )
}

/**
 * Разделитель подзаголовков внутри карточки.
 *
 * Своя линия вместо отступа: без неё «подписи» сливались с содержимым и не
 * читались как разделы.
 */
export function Subhead({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 pt-1">
      <span className="section-title">{children}</span>
      {action}
    </div>
  )
}

/**
 * Ключ-значение для списков настроек.
 *
 * Подпись слева, значение справа: глаз ищет значение в правом конце строки, а
 * не ищет его среди строки текста.
 */
export function SettingRow({
  label,
  hint,
  children,
}: {
  label: string
  hint?: string
  children?: ReactNode
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3 py-2.5">
      <div className="min-w-0">
        <div className="text-[13px] text-text">{label}</div>
        {hint ? <div className="mt-0.5 text-[12px] leading-relaxed text-text-subtle">{hint}</div> : null}
      </div>
      {children ? <div className="shrink-0">{children}</div> : null}
    </div>
  )
}