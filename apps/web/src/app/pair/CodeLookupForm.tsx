'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowRight, QrCode } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { FormError } from '@/components/ui/form'
import { readCsrfToken } from '@/shared/lib/csrf'
import { normalizeCode } from '@/lib/code-alphabet'

const CODE_LENGTH = 8

/**
 * Ввод кода с экрана телевизора.
 *
 * Восемь отдельных ячеек вместо одного поля — не украшение. Код на телевизоре
 * показан восемью символами, и человек переносит их глазами по одному. Одно
 * длинное поле просит ввести «TTNRTGV2», и промахнуться легко: непонятно,
 * где ошибка и где должен быть пробел.
 *
 * Алфавит без 0/1/I/L/O/U общий на весь продукт, поэтому ввод фильтруется по
 * нему же: человек, который набрал «О» вместо нуля, получит отказ сразу на
 * первом символе, а не после полного ввода.
 *
 * Разбивка на ячейки даёт и обратную связь: активная подсвечена, есть
 * автопереход, есть переход назад по пробелу.
 */
export function CodeLookupForm() {
  const router = useRouter()
  const [digits, setDigits] = useState<string[]>(() => Array.from({ length: CODE_LENGTH }, () => ''))
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
          headers: { 'content-type': 'application/json', 'x-csrf-token': readCsrfToken() },
          body: JSON.stringify({ code }),
        })

        if (!response.ok) {
          const payload = (await response.json().catch(() => null)) as { error?: { message?: string } } | null
          setError(payload?.error?.message ?? 'Код не подошёл')
          // Сбрасывается только после неудачи: введённый с телевизора код
          // стирать незачем — человек, скорее всего, промахнулся одним символом
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
    if (code.length === CODE_LENGTH && !busy && !error) void submit(code)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [digits])

  const setDigit = (index: number, value: string) => {
    const cleaned = normalizeCode(value)

    if (!cleaned) {
      setDigits((current) => current.map((digit, position) => (position === index ? '' : digit)))
      return
    }

    // Вставка нескольких символов в одну ячейку: мобильная клавиатура нередко
    // приносит их пачкой, и требовать по одной означало бы терять ввод.
    setDigits((current) => {
      const next = [...current]

      for (const char of cleaned) {
        if (index + next.slice(index).length < CODE_LENGTH) next[index + next.slice(index).length] = char
      }

      return next
    })

    const focusIndex = Math.min(index + cleaned.length, CODE_LENGTH - 1)
    inputs.current[focusIndex]?.focus()
  }

  return (
    <div className="flex flex-col gap-4">
      {error ? <FormError onDismiss={() => setError(null)}>{error}</FormError> : null}

      <div className="flex min-w-0 justify-center gap-1 sm:gap-2">
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

              if (event.key === 'ArrowRight' && index < CODE_LENGTH - 1) {
                event.preventDefault()
                inputs.current[index + 1]?.focus()
              }
            }}
            onPaste={(event) => {
              // Вставка кода целиком — обычное дело, если он открыт в другом
              // окне. Без этого обработчика вставится только один символ.
              event.preventDefault()
              const text = normalizeCode(event.clipboardData.getData('text')).slice(0, CODE_LENGTH)
              if (!text) return

              setDigits(Array.from({ length: CODE_LENGTH }, (_, position) => text[position] ?? ''))
              inputs.current[Math.min(text.length, CODE_LENGTH - 1)]?.focus()
            }}
            inputMode="numeric"
            autoComplete={index === 0 ? 'one-time-code' : 'off'}
            aria-label={`Символ ${index + 1} из ${CODE_LENGTH}`}
            disabled={busy}
            maxLength={CODE_LENGTH}
            className="tnum field h-12 min-w-0 max-w-[52px] px-0 text-center font-mono text-[20px] font-medium text-text"
          />
        ))}
      </div>

      <div className="flex flex-wrap items-center justify-center gap-2">
        <Button
          size="sm"
          variant="ghost"
          disabled={busy}
          onClick={() => setDigits(Array.from({ length: CODE_LENGTH }, () => ''))}
        >
          Очистить
        </Button>

        <Button
          size="sm"
          disabled={busy || digits.join('').length !== CODE_LENGTH}
          onClick={() => void submit(digits.join(''))}
        >
          {busy ? 'Проверяем…' : 'Подтвердить'}
          <ArrowRight className="size-3.5" strokeWidth={2} />
        </Button>
      </div>

      <p className="flex items-center justify-center gap-1.5 text-[12px] text-text-subtle">
        <QrCode className="size-3.5 shrink-0" strokeWidth={1.75} />
        Код написан на экране телевизора и меняется каждые несколько минут. Буквы и цифры, без 0 и O
      </p>
    </div>
  )
}
