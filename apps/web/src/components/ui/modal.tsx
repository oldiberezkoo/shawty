'use client'

import type { ReactNode } from 'react'
import { Dialog } from '@base-ui/react/dialog'
import { X } from 'lucide-react'

/**
 * Модальный диалог.
 *
 * Base UI даёт ловушку фокуса, возврат по Escape и блокировку прокрутки — то
 * есть всё, что в самодельном диалоге обычно забывают. Вид наш: диалог — это
 * окно, а не всплывающая карточка. Титульная строка с акцентной биркой
 * отделяет его от страницы и объясняет, откуда он взялся.
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
            className={`w-full ${width} max-h-[calc(100dvh-2rem)] overflow-auto border border-border-strong bg-bg transition-opacity duration-150 data-[starting-style]:opacity-0 data-[ending-style]:opacity-0`}
          >
            <div className="flex items-center gap-3 border-b border-border px-4 py-2.5">
              <span className="shrink-0 bg-primary px-1 py-px font-sans text-[10px] leading-[1.35] font-medium text-primary-text uppercase">
                SHAWTY
              </span>

              <Dialog.Title className="min-w-0 flex-1 truncate font-mono text-[11px] tracking-[0.02em] text-text-subtle">
                {title}
              </Dialog.Title>

              <Dialog.Close
                aria-label="Закрыть"
                className="-mr-1 flex size-7 shrink-0 items-center justify-center text-text-subtle transition-colors hover:bg-surface-2 hover:text-text"
              >
                <X className="size-4" strokeWidth={1.7} />
              </Dialog.Close>
            </div>

            {description ? (
              <Dialog.Description className="border-b border-border px-5 py-3 text-[12.5px] leading-relaxed text-text-muted">
                {description}
              </Dialog.Description>
            ) : null}

            {children ? <div className="px-5 py-5">{children}</div> : null}

            {footer ? (
              <div className="flex justify-end gap-2 border-t border-border px-5 py-4">{footer}</div>
            ) : null}
          </Dialog.Popup>
        </Dialog.Viewport>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
