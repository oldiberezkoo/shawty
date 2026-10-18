'use client'

import type { ReactNode } from 'react'
import { Dialog } from '@base-ui/react/dialog'

/**
 * Модальный диалог.
 *
 * Base UI даёт ловушку фокуса, возврат по Escape и блокировку прокрутки —
 * то есть всё, что в самодельном диалоге обычно забывают. Вид наш.
 *
 * Диалог применяется только там, где решение необратимо или требует
 * подтверждения. Обычные формы живут на странице: лишний слой поверх формы
 * означает лишний шаг и потерю видимого контекста.
 */
export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = 'md',
}: {
  open: boolean
  onClose: () => void
  title: string
  description?: ReactNode
  children?: ReactNode
  footer?: ReactNode
  size?: 'sm' | 'md' | 'lg'
}) {
  const width = { sm: 'max-w-sm', md: 'max-w-lg', lg: 'max-w-2xl' }[size]

  return (
    <Dialog.Root open={open} onOpenChange={(next) => (next ? null : onClose())}>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-50 bg-overlay backdrop-blur-[2px] transition-opacity duration-150 data-[starting-style]:opacity-0 data-[ending-style]:opacity-0" />

        {/* Viewport центрирует окно и держит его в границах экрана.
            Без него длинный диалог на телефоне вылезал бы за края. */}
        <Dialog.Viewport className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto p-4">
          <Dialog.Popup
            className={`w-full ${width} max-h-[calc(100dvh-2rem)] overflow-auto rounded-[var(--radius-xl)] border border-border bg-surface shadow-[var(--shadow-lg)] transition-transform duration-150 data-[starting-style]:scale-[0.98] data-[starting-style]:opacity-0 data-[ending-style]:scale-[0.98] data-[ending-style]:opacity-0`}
          >
            <div className="flex items-start justify-between gap-4 border-b border-border px-5 py-4">
              <div className="min-w-0">
                <Dialog.Title className="text-[15px] font-semibold">{title}</Dialog.Title>
                {description ? (
                  <Dialog.Description className="mt-1 text-[13px] leading-relaxed text-text-muted">
                    {description}
                  </Dialog.Description>
                ) : null}
              </div>

              {/* Кнопка закрытия: у людей с подписью вместо иконки читаемость
                  важнее компактности. */}
              <Dialog.Close
                aria-label="Закрыть"
                className="-mt-0.5 -mr-1 shrink-0 rounded-[var(--radius-sm)] px-1.5 text-[18px] leading-none text-text-subtle transition-colors hover:bg-surface-2 hover:text-text"
              >
                ×
              </Dialog.Close>
            </div>

            {children ? <div className="px-5 py-4">{children}</div> : null}

            {footer ? (
              <div className="flex justify-end gap-2 border-t border-border px-5 py-3.5">{footer}</div>
            ) : null}
          </Dialog.Popup>
        </Dialog.Viewport>
      </Dialog.Portal>
    </Dialog.Root>
  )
}