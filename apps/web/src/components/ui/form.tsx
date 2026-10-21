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
 *
 * Общий стиль поля вынесен в константу: раньше он был повторён в семи местах
 * и разъехался по высоте от компонента к компоненту.
 */

const FIELD_CLASS = 'field'

const INPUT_CLASS = FIELD_CLASS

const LABEL_CLASS = 'text-[12.5px] font-medium text-text'
const DESCRIPTION_CLASS = 'text-[12px] leading-relaxed text-text-subtle'

export function FormField({
  label,
  name,
  type = 'text',
  defaultValue,
  value,
  onValueChange,
  placeholder,
  required,
  autoComplete,
  autoFocus,
  description,
  error,
  inputMode,
  min,
  max,
  step,
  maxLength,
  minLength,
  readOnly,
  className = '',
  list,
}: {
  label: string
  name: string
  type?: string
  defaultValue?: string | number
  /**
   * Управляемое значение.
   *
   * Нужно там, где поле живёт в диалоге и отправляется по кнопке, а не формой.
   * Оба режима оставлены: неуправляемое поле внутри диалога не обновится после
   * серверной ошибки, а управляемое внутри обычной формы мешает нативной валидации.
   */
  value?: string
  onValueChange?: (value: string) => void
  placeholder?: string
  required?: boolean
  autoComplete?: string
  autoFocus?: boolean
  description?: string
  /** Ошибка поля: подсказка под полем, а не только красная рамка. */
  error?: string | null
  inputMode?: 'text' | 'numeric' | 'decimal' | 'email'
  min?: number
  max?: number
  step?: number
  maxLength?: number
  minLength?: number
  readOnly?: boolean
  className?: string
  list?: string
}) {
  return (
    <Field.Root className={`flex flex-col gap-1.5 ${className}`}>
      <Field.Label className={LABEL_CLASS}>{label}</Field.Label>

      <Input
        name={name}
        type={type}
        defaultValue={value === undefined ? defaultValue : undefined}
        value={value}
        onValueChange={onValueChange}
        placeholder={placeholder}
        required={required}
        autoComplete={autoComplete}
        autoFocus={autoFocus}
        inputMode={inputMode}
        min={min}
        max={max}
        step={step}
        maxLength={maxLength}
        minLength={minLength}
        readOnly={readOnly}
        list={list}
        aria-invalid={error ? true : undefined}
        className={INPUT_CLASS}
      />

      {error ? (
        <Field.Error className="text-[12px] text-danger">{error}</Field.Error>
      ) : description ? (
        <Field.Description className={DESCRIPTION_CLASS}>{description}</Field.Description>
      ) : null}
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
  value,
  placeholder = 'Выберите значение',
  required,
  error,
  onValueChange,
  className = '',
}: {
  label: string
  name: string
  options: SelectOption[]
  defaultValue?: string
  /** Управляемое значение — для диалогов, где список меняется по ходу. */
  value?: string
  placeholder?: string
  required?: boolean
  error?: string | null
  /** Обработчик выбора: нужен там, где список не отправляется формой. */
  onValueChange?: (value: string | null) => void
  className?: string
}) {
  return (
    <Field.Root className={`flex flex-col gap-1.5 ${className}`}>
      <Field.Label className={LABEL_CLASS}>{label}</Field.Label>

      <Select.Root
        name={name}
        defaultValue={value === undefined ? (defaultValue ?? null) : null}
        items={options}
        value={value === undefined ? null : value}
        onValueChange={onValueChange}
        required={required}
      >
        <Select.Trigger
          aria-invalid={error ? true : undefined}
          className={`${FIELD_CLASS} flex items-center justify-between gap-2 text-left data-[placeholder]:text-text-subtle`}
        >
          <Select.Value placeholder={placeholder} />
          <Select.Icon className="shrink-0 text-text-subtle">
            <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
              <path d="M2.5 4.5 6 8l3.5-3.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </Select.Icon>
        </Select.Trigger>

        <Select.Portal>
          <Select.Positioner className="z-50 mt-1 w-[var(--anchor-width)]">
            <Select.Popup className="max-h-72 overflow-auto rounded-[var(--radius-lg)] border border-border bg-surface-raised p-1.5 shadow-[var(--shadow-md)]">
              <Select.List>
                {options.map((option) => (
                  <Select.Item
                    key={option.value}
                    value={option.value}
                    disabled={option.disabled}
                    className="flex cursor-default items-center justify-between gap-2 rounded-[var(--radius-sm)] px-2.5 py-2 text-[13.5px] text-text outline-none data-[highlighted]:bg-surface-2 data-[selected]:font-medium data-[disabled]:opacity-50"
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

      {error ? <Field.Error className="text-[12px] text-danger">{error}</Field.Error> : null}
    </Field.Root>
  )
}

/**
 * Переключатель «да/нет».
 *
 * Отдельный компонент, а не две радиокнопки: у бинарного вопроса всегда два
 * состояния, и переключатель помещается в одну строку вместо двух.
 */
export function ToggleField({
  name,
  label,
  description,
  defaultChecked = false,
  disabled,
  onChange,
}: {
  name: string
  label: string
  description?: string
  defaultChecked?: boolean
  disabled?: boolean
  onChange?: (checked: boolean) => void
}) {
  return (
    <label className="flex cursor-pointer items-start gap-2.5 py-1">
      <input
        type="checkbox"
        name={name}
        defaultChecked={defaultChecked}
        disabled={disabled}
        onChange={(event) => onChange?.(event.target.checked)}
        className="mt-0.5 size-4 shrink-0 cursor-pointer accent-[var(--primary)]"
      />
      <span className="flex flex-col gap-0.5">
        <span className="text-[13px] leading-tight text-text">{label}</span>
        {description ? <span className={DESCRIPTION_CLASS}>{description}</span> : null}
      </span>
    </label>
  )
}

/**
 * Ошибка формы целиком.
 *
 * Без неё пользователь видит на экране «что-то пошло не так» и ищет, где именно.
 * Текст ошибки обязан говорить, что делать, а не что сломалось.
 */
export function FormError({ children, onDismiss }: { children: ReactNode; onDismiss?: () => void }) {
  return (
    <div
      role="alert"
      className="flex items-start justify-between gap-3 rounded-[var(--radius-lg)] border border-danger-border bg-danger-bg px-3.5 py-3 text-[13px] text-danger"
    >
      <span className="leading-relaxed">{children}</span>
      {onDismiss ? (
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Скрыть сообщение"
          className="-my-0.5 -mr-1 shrink-0 rounded px-1 opacity-70 transition-opacity hover:opacity-100"
        >
          ×
        </button>
      ) : null}
    </div>
  )
}

/** Успешное сообщение: подтверждает, что действие прошло. */
export function FormSuccess({ children, onDismiss }: { children: ReactNode; onDismiss?: () => void }) {
  return (
    <div
      role="status"
      className="flex items-start justify-between gap-3 rounded-[var(--radius-lg)] border border-success-border bg-success-bg px-3.5 py-3 text-[13px] text-success"
    >
      <span className="leading-relaxed">{children}</span>
      {onDismiss ? (
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Скрыть сообщение"
          className="-my-0.5 -mr-1 shrink-0 rounded px-1 opacity-70 transition-opacity hover:opacity-100"
        >
          ×
        </button>
      ) : null}
    </div>
  )
}