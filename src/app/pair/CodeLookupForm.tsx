'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowRight, QrCode } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { FormError } from '@/components/ui/form'
import { CSRF_COOKIE } from '@/lib/cookie-names'

/**
 * Ввод кода с экрана телевизора.
 *
 * Восемь отдельных ячеек вместо одного поля — не украшение. Код на телевизоре
 * показан восемью цифрами, и человек переносит их глазами по одной. Одно
 * длинное поле просит ввести «1234 5678», и промахнуться легко: непонятно,
 * где ошибка и где должен быть пробел.
 *
 * Разбивка на ячейки даёт и обратную связь: активная подсвечена, есть
 * автопереход, есть переход назад по пробелу.
 */
export function CodeLookupForm() {
  const router = useRouter()
  const [digits, setDigits] = useState<string[]>(() => Array.from({ length: 8 }, () => ''))
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const inputs = useRef<(HTMLInputElement | null)[]>([])

  const submit = useCallback(
    async (code: string) => {
      setError(null)
      setBusy(true)

      try {
        const response = await fetch('/api/dashboard/pairing/lookup', {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'x-csrf-token': readCsrf() },
          body: JSON.stringify({ code }),
        })

        if (!response.ok) {
          const payload = (await response.json().catch(() => null)) as { error?: { message?: string } } | null
          setError(payload?.error?.message ?? 'Код не подошёл')
          // Сбрасывается только после неудачи: введённый с телевизора код
          // стирать незачем — человек, скорее всего, промахнулся одной цифрой
          // и поправит её, а не начнёт заново.
          return
        }

        const data = (await response.json()) as { sessionId: string }
        router.push(`/pair/${data.sessionId}?c=${code}`)
      } finally {
        setBusy(false)
      }
    },
    [router],
  )

  // Отправка срабатывает на заполненной последней ячейке: жать отдельную
  // кнопку после ввода кода — лишний шаг, который человек забудет.
  useEffect(() => {
    const code = digits.join('')
    if (code.length === 8 && !busy && !error) void submit(code)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [digits])

  const setDigit = (index: number, value: string) => {
    const cleaned = value.replace(/\D/g, '')

    if (!cleaned) {
      setDigits((current) => current.map((digit, position) => (position === index ? '' : digit)))
      return
    }

    // Вставка нескольких цифр в одну ячейку: мобильная клавиатура нередко
    // приносит их пачкой, и требовать по одной означало бы терять ввод.
    setDigits((current) => {
      const next = [...current]

      for (const char of cleaned) {
        if (index + next.slice(index).length < 8) next[index + next.slice(index).length] = char
      }

      return next
    })

    const focusIndex = Math.min(index + cleaned.length, 7)
    inputs.current[focusIndex]?.focus()
  }

  return (
    <div className="flex flex-col gap-4">
      {error ? <FormError onDismiss={() => setError(null)}>{error}</FormError> : null}

      <div className="flex justify-center gap-1.5 sm:gap-2">
        {digits.map((digit, index) => (
          <input
            key={index}
            ref={(element) => {
              inputs.current[index] = element
            }}
            value={digit}
            onChange={(event) => setDigit(index, event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Backspace' && !digit && index > 0) {
                event.preventDefault()
                inputs.current[index - 1]?.focus()
              }

              // стрелки ведут себя как в строке ввода, а не как в документе:
              // без этого стрелка влево из первой ячейки уводит фокус из формы
              if (event.key === 'ArrowLeft' && index > 0) {
                event.preventDefault()
                inputs.current[index - 1]?.focus()
              }

              if (event.key === 'ArrowRight' && index < 7) {
                event.preventDefault()
                inputs.current[index + 1]?.focus()
              }
            }}
            onPaste={(event) => {
              // Вставка кода целиком — обычное дело, если он открыт в другом
              // окне. Без этого обработчика вставится только одна цифра.
              event.preventDefault()
              const text = event.clipboardData.getData('text').replace(/\D/g, '').slice(0, 8)
              if (!text) return

              setDigits(Array.from({ length: 8 }, (_, position) => text[position] ?? ''))
              inputs.current[Math.min(text.length, 7)]?.focus()
            }}
            inputMode="numeric"
            autoComplete={index === 0 ? 'one-time-code' : 'off'}
            aria-label={`Цифра ${index + 1} из 8`}
            disabled={busy}
            maxLength={8}
            className="tnum h-12 w-full max-w-[52px] rounded-[var(--radius-md)] border border-border bg-surface text-center text-[20px] font-medium text-text transition-colors focus:border-border-strong focus:ring-2 focus:ring-[var(--ring)]/25 focus:outline-none disabled:opacity-50"
          />
        ))}
      </div>

      <div className="flex flex-wrap items-center justify-center gap-2">
        <Button
          size="sm"
          variant="ghost"
          disabled={busy}
          onClick={() => setDigits(Array.from({ length: 8 }, () => ''))}
        >
          Очистить
        </Button>

        <Button
          size="sm"
          disabled={busy || digits.join('').length !== 8}
          onClick={() => void submit(digits.join(''))}
        >
          {busy ? 'Проверяем…' : 'Подтвердить'}
          <ArrowRight className="size-3.5" strokeWidth={2} />
        </Button>
      </div>

      <p className="flex items-center justify-center gap-1.5 text-[12px] text-text-subtle">
        <QrCode className="size-3.5 shrink-0" strokeWidth={1.75} />
        Код написан на экране телевизора и меняется каждые несколько минут
      </p>
    </div>
  )
}

function readCsrf(): string {
  const match = document.cookie.match(new RegExp(`(?:^|; )${CSRF_COOKIE}=([^;]+)`))
  return match?.[1] ? decodeURIComponent(match[1]) : ''
}