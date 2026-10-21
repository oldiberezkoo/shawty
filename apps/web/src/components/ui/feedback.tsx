'use client'

import { useEffect, useState, type ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { Modal } from '@/components/ui/modal'

/**
 * Короткие сообщения поверх интерфейса.
 *
 * Не библиотека: нужен один тон сообщений на весь продукт, а не четыре
 * библиотечных вида, которые в разных углах выглядят по-разному.
 *
 * Сообщение само исчезает — но только если оно не требует действия. Про
 * ошибку, которая требует решения, «уведомление, которое ушло» — хуже, чем
 * его отсутствие.
 */
export type ToastTone = 'neutral' | 'success' | 'warn' | 'danger'

export type ToastItem = {
  id: string
  text: string
  tone: ToastTone
  /** Действие: «Отменить», «Повторить». Ошибки без действия не исчезают. */
  action?: { label: string; onClick: () => void }
  /** Тон, при котором сообщение живёт, пока его не закроют. */
  sticky?: boolean
}

let pushToast: ((toast: Omit<ToastItem, 'id'>) => void) | null = null

/** Сообщение из любого места, включая серверные обработчики-действия. */
export function toast(text: string, options: { tone?: ToastTone; action?: ToastItem['action'] } = {}): void {
  const tone = options.tone ?? 'neutral'

  pushToast?.({
    text,
    tone,
    action: options.action,
    // Ошибка без действия требует внимания: исчезнувшее сообщение об отказе
    // читается как «операция прошла».
    sticky: tone === 'danger' && !options.action,
  })
}

/**
 * Тон тоста.
 *
 * Ошибка — инверсная плашка: белая на тёмном. Это громче любого оттенка и не
 * тратит акцент на состояние.
 */
const TONE_CLASS: Record<ToastTone, string> = {
  neutral: 'border-border-strong border-l-border-strong bg-surface text-text',
  success: 'border-border-strong border-l-text bg-surface-2 text-text',
  warn: 'border-border-strong border-l-text-muted bg-surface-2 text-text',
  danger: 'border-text border-l-bg bg-text text-bg',
}

const AUTO_HIDE_MS = 4500

export function Toaster() {
  const [items, setItems] = useState<ToastItem[]>([])

  useEffect(() => {
    pushToast = (item) => {
      const id = crypto.randomUUID()
      setItems((current) => [...current, { ...item, id }])

      if (item.sticky) return

      setTimeout(() => {
        setItems((current) => current.filter((entry) => entry.id !== id))
      }, AUTO_HIDE_MS)
    }

    return () => {
      pushToast = null
    }
  }, [])

  const dismiss = (id: string) => setItems((current) => current.filter((entry) => entry.id !== id))

  if (items.length === 0) return null

  return (
    // aria-live: сообщение читается вслух, не дожидаясь, пока пользователь
    // посмотрит в угол экрана.
    <div
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 bottom-0 z-[60] flex flex-col items-center gap-2 p-4"
    >
      {items.map((item) => (
        <div
          key={item.id}
          role={item.tone === 'danger' ? 'alert' : 'status'}
          className={`pointer-events-auto flex w-full max-w-md items-center gap-3 border border-l-[3px] px-4 py-3 fade-in ${TONE_CLASS[item.tone]}`}
        >
          <span className="flex-1 text-[12.5px] leading-relaxed">{item.text}</span>

          {item.action ? (
            <button
              type="button"
              onClick={() => {
                item.action?.onClick()
                dismiss(item.id)
              }}
              className="shrink-0 font-mono text-[10px] tracking-[0.08em] uppercase underline underline-offset-4"
            >
              {item.action.label}
            </button>
          ) : null}

          <button
            type="button"
            onClick={() => dismiss(item.id)}
            aria-label="Скрыть"
            className="shrink-0 px-1 text-[16px] leading-none opacity-60 transition-opacity hover:opacity-100"
          >
            ×
          </button>
        </div>
      ))}
    </div>
  )
}

/**
 * Подтверждение опасного действия.
 *
 * Текст говорит, что произойдёт и что нельзя отменить. «Вы уверены?» — худшая
 * формулировка на свете: она не говорит ни о чём.
 */
export function ConfirmButton({
  onConfirm,
  title,
  confirmLabel = 'Удалить',
  description,
  children,
  variant = 'danger',
  disabled,
}: {
  onConfirm: () => void
  title: string
  confirmLabel?: string
  description?: ReactNode
  children: ReactNode
  variant?: 'danger' | 'secondary'
  disabled?: boolean
}) {
  const [open, setOpen] = useState(false)

  return (
    <>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen(true)}
        className={`inline-flex h-8 shrink-0 items-center border px-2.5 font-mono text-[10px] tracking-[0.06em] uppercase transition-colors disabled:pointer-events-none disabled:opacity-40 ${
          variant === 'danger'
            ? 'border-border-strong text-text hover:border-text hover:bg-text hover:text-bg'
            : 'border-border text-text-muted hover:border-border-strong hover:text-text'
        }`}
      >
        {children}
      </button>

      {open ? (
        <ConfirmDialog
          title={title}
          description={description}
          confirmLabel={confirmLabel}
          onCancel={() => setOpen(false)}
          onConfirm={() => {
            onConfirm()
            setOpen(false)
          }}
        />
      ) : null}
    </>
  )
}

function ConfirmDialog({
  title,
  description,
  confirmLabel,
  onCancel,
  onConfirm,
}: {
  title: string
  description?: ReactNode
  confirmLabel: string
  onCancel: () => void
  onConfirm: () => void
}) {
  return (
    <Modal
      open
      onClose={onCancel}
      title={title}
      description={description}
      size="sm"
      footer={
        <>
          <Button size="sm" onClick={onCancel}>
            Отмена
          </Button>
          <Button size="sm" variant="danger" onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </>
      }
    />
  )
}
