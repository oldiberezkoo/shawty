'use client'

import { useState } from 'react'
import { describeScope } from '@/shared/lib/scope-label'
import type { ScopeOption, TargetDraft } from '../model'

/**
 * Выбор площадок кампании.
 *
 * Вкладки не смешивают филиалы, группы и экраны: у них разные правила
 * вложенности, и общий список заставлял бы оператора угадывать, что именно
 * он отметил.
 */
export function CampaignTargetPicker(props: {
  branches: ScopeOption[]
  groups: ScopeOption[]
  screens: ScopeOption[]
  allCompany: boolean
  onAllCompanyChange: (value: boolean) => void
  targets: TargetDraft[]
  onToggle: (scopeType: TargetDraft['scopeType'], scopeId: string) => void
}) {
  const [targetTab, setTargetTab] = useState<TargetDraft['scopeType']>('screen')
  const [screenFilter, setScreenFilter] = useState('')

  const targetOptions =
    targetTab === 'branch' ? props.branches : targetTab === 'group' ? props.groups : props.screens
  const query = screenFilter.trim().toLowerCase()
  const visibleTargetOptions =
    targetTab === 'screen' && query
      ? targetOptions.filter((option) => option.name.toLowerCase().includes(query))
      : targetOptions

  return (
    <div className="flex flex-col gap-2 border-t border-border pt-3">
      <span className="text-[12px] font-medium text-text">Где показывать</span>
      <label className="flex items-center gap-2 text-[13px] text-text">
        <input
          type="checkbox"
          checked={props.allCompany}
          onChange={(event) => props.onAllCompanyChange(event.target.checked)}
        />
        Вся компания
        <span className="text-[12px] text-text-subtle">включая экраны, которые добавят позже</span>
      </label>

      {props.allCompany ? null : (
        <>
          <div className="flex flex-wrap gap-2">
            {(
              [
                ['branch', 'Филиалы', props.branches],
                ['group', 'Группы', props.groups],
                ['screen', 'Экраны', props.screens],
              ] as const
            ).map(([value, label, options]) => {
              const selectedCount = props.targets.filter((target) => target.scopeType === value).length

              return (
                <button
                  key={value}
                  type="button"
                  onClick={() => setTargetTab(value)}
                  className={`h-8 border px-3 text-[12.5px] transition-colors ${
                    targetTab === value
                      ? 'border-primary bg-primary text-primary-text'
                      : 'border-border text-text-muted hover:bg-surface-2'
                  }`}
                >
                  {label}
                  <span className="ml-1.5 opacity-70">
                    {selectedCount > 0 ? `${selectedCount}/${options.length}` : options.length}
                  </span>
                </button>
              )
            })}
          </div>

          {targetTab === 'screen' ? (
            <input
              value={screenFilter}
              onChange={(event) => setScreenFilter(event.target.value)}
              className="field w-full max-w-xs"
              placeholder="Найти экран по названию"
            />
          ) : null}

          <div className="max-h-52 overflow-y-auto border border-border">
            {visibleTargetOptions.length === 0 ? (
              <p className="px-3 py-2 text-[12.5px] text-text-subtle">
                {query ? 'Ничего не найдено.' : 'Здесь пока пусто — добавьте филиалы, группы или экраны в разделе «Структура».'}
              </p>
            ) : (
              visibleTargetOptions.map((option) => {
                const checked = props.targets.some(
                  (target) => target.scopeType === targetTab && target.scopeId === option.id,
                )

                return (
                  <label
                    key={option.id}
                    className="flex cursor-pointer items-center gap-2 border-b border-border px-3 py-1.5 text-[13px] last:border-0 hover:bg-surface-2"
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => props.onToggle(targetTab, option.id)}
                    />
                    {option.name}
                  </label>
                )
              })
            )}
          </div>

          {props.targets.length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {props.targets.map((target) => (
                <button
                  key={`${target.scopeType}:${target.scopeId}`}
                  type="button"
                  onClick={() => props.onToggle(target.scopeType, target.scopeId)}
                  className="flex items-center gap-1.5 bg-surface-3 px-2.5 py-1 text-[12px] text-text-muted hover:text-text"
                  title="Убрать площадку"
                >
                  {describeScope(
                    { scopeType: target.scopeType, scopeId: target.scopeId },
                    {
                      branches: props.branches,
                      groups: props.groups,
                      screens: props.screens,
                    },
                  )}
                  <span aria-hidden>×</span>
                </button>
              ))}
            </div>
          ) : (
            <p className="text-[12px] text-warn">Отметьте хотя бы одну площадку.</p>
          )}
        </>
      )}
    </div>
  )
}
