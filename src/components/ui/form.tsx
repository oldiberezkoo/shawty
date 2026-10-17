'use client'

import { Field } from '@base-ui/react/field'
import { Input } from '@base-ui/react/input'
import { Select } from '@base-ui/react/select'
import type { ReactNode } from 'react'

/**
 * Тонкая обёртка над Base UI.
 *
 * Голые примитивы дают доступность и поведение (фокус, клавиатура, ARIA),
 * а вид полностью наш. Слой существует, чтобы замена или обновление Base UI
 * затрагивала только этот каталог.
 */

export function FormField({
  label,
  name,
  type = 'text',
  defaultValue,
  placeholder,
  required,
  autoComplete,
  autoFocus,
  description,
  inputMode,
  maxLength,
  readOnly,
}: {
  label: string
  name: string
  type?: string
  defaultValue?: string
  placeholder?: string
  required?: boolean
  autoComplete?: string
  autoFocus?: boolean
  description?: string
  inputMode?: 'text' | 'numeric'
  maxLength?: number
  readOnly?: boolean
}) {
  return (
    <Field.Root className="flex flex-col gap-1.5">
      <Field.Label className="text-[13px] font-medium text-text">{label}</Field.Label>
      <Input
        name={name}
        type={type}
        defaultValue={defaultValue}
        placeholder={placeholder}
        required={required}
        autoComplete={autoComplete}
        autoFocus={autoFocus}
        inputMode={inputMode}
        maxLength={maxLength}
        readOnly={readOnly}
        className="h-10 w-full rounded-[var(--radius-md)] border border-border bg-surface px-3 text-sm text-text placeholder:text-text-subtle focus:border-border-strong focus:outline-none focus:ring-2 focus:ring-[var(--ring)]/30"
      />
      {description ? <Field.Description className="text-[12px] text-text-subtle">{description}</Field.Description> : null}
    </Field.Root>
  )
}

export type SelectOption = { value: string; label: string; disabled?: boolean }

/**
 * Выпадающий список. Base UI даёт корректную клавиатурную навигацию и
 * позиционирование в портале, стилизация — наша.
 */
export function SelectField({
  label,
  name,
  options,
  defaultValue,
  placeholder = 'Выберите значение',
  required,
}: {
  label: string
  name: string
  options: SelectOption[]
  defaultValue?: string
  placeholder?: string
  required?: boolean
}) {
  return (
    <Field.Root className="flex flex-col gap-1.5">
      <Field.Label className="text-[13px] font-medium text-text">{label}</Field.Label>
      <Select.Root
        name={name}
        defaultValue={defaultValue ?? null}
        items={options}
        required={required}
      >
        <Select.Trigger className="flex h-10 w-full items-center justify-between gap-2 rounded-[var(--radius-md)] border border-border bg-surface px-3 text-sm text-text data-[placeholder]:text-text-subtle focus:border-border-strong focus:outline-none focus:ring-2 focus:ring-[var(--ring)]/30">
          <Select.Value placeholder={placeholder} />
          <Select.Icon className="text-text-subtle">
            <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
              <path d="M2.5 4.5 6 8l3.5-3.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </Select.Icon>
        </Select.Trigger>

        <Select.Portal>
          <Select.Positioner className="z-50 mt-1 w-[var(--anchor-width)]">
            <Select.Popup className="max-h-72 overflow-auto rounded-[var(--radius-md)] border border-border bg-surface p-1 shadow-[var(--shadow-md)]">
              <Select.List>
                {options.map((option) => (
                  <Select.Item
                    key={option.value}
                    value={option.value}
                    disabled={option.disabled}
                    className="flex cursor-default items-center justify-between gap-2 rounded-[var(--radius-sm)] px-2.5 py-1.5 text-sm text-text outline-none data-[highlighted]:bg-surface-2 data-[selected]:font-medium data-[disabled]:opacity-50"
                  >
                    <Select.ItemText>{option.label}</Select.ItemText>
                    <Select.ItemIndicator className="text-text-muted">
                      <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
                        <path d="m2.5 6.2 2.2 2.3 4.8-4.8" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                      </svg>
                    </Select.ItemIndicator>
                  </Select.Item>
                ))}
              </Select.List>
            </Select.Popup>
          </Select.Positioner>
        </Select.Portal>
      </Select.Root>
    </Field.Root>
  )
}

export function FormError({ children }: { children: ReactNode }) {
  return (
    <div
      role="alert"
      className="rounded-[var(--radius-md)] border border-danger/30 bg-danger-bg px-3 py-2 text-[13px] text-danger"
    >
      {children}
    </div>
  )
}
