'use client'

import { useEffect, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { Dither } from '@/components/visual/dither'
import { Mark } from '@/components/visual/mark'
import { PixelIcon } from '@/components/visual/pixel-icon'
import type { IconName } from '@/components/visual/bitmaps'
import type { PlayerPhase } from './config'

/**
 * Экраны состояний.
 *
 * Белый квадрат оператор видит как поломку устройства. Поэтому вместо
 * пустоты показываем понятный текст и дату — сразу видно, что экран жив.
 */
export function PlayerStateScreen({ phase, message }: { phase: PlayerPhase; message: string | null }) {
  const [now, setNow] = useState(() => new Date())

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(timer)
  }, [])

  const texts: Record<
    PlayerPhase,
    { title: string; hint?: string; status: string; pixel: IconName; live?: boolean }
  > = {
    authenticating: {
      title: 'Подключаемся к серверу',
      hint: 'Проверяем доступ экрана. Обычно это занимает несколько секунд.',
      status: 'Подключение',
      pixel: 'panel',
      live: true,
    },
    ready: {
      title: 'Готовим показ',
      hint: 'Материалы уже на экране — сейчас начнётся воспроизведение.',
      status: 'Показ',
      pixel: 'panel',
      live: true,
    },
    empty: {
      title: 'Экран ждёт контент',
      hint: 'Назначьте плейлист в панели. Экран подхватит его автоматически, без перезагрузки.',
      status: 'Ждёт назначения',
      pixel: 'stack',
    },
    offline: {
      title: 'Нет связи с сервером',
      hint: 'Показ продолжится, как только сеть вернётся. Перезагружать телевизор не нужно.',
      status: 'Нет сети',
      pixel: 'network',
    },
    error: {
      title: 'Не удалось показать материал',
      hint: 'Проверьте файлы плейлиста в панели. Экран продолжит проверять обновления сам.',
      status: 'Ошибка показа',
      pixel: 'flag',
    },
    unpaired: {
      title: 'Требуется привязка',
      hint: message ?? 'Откройте страницу привязки и введите код с телевизора.',
      status: 'Не привязан',
      pixel: 'lock',
    },
  }

  const content = texts[phase]
  const marker =
    phase === 'error' || phase === 'empty'
      ? 'bg-white'
      : content.live
        ? 'bg-primary'
        : 'border border-white/40'

  return (
    // Плеер живёт вне темы интерфейса: на телевизоре в магазине всегда
    // near-black, иначе светлая тема панели превратила бы экран в белое пятно.
    <main className="dark player-shell fixed inset-0 flex size-full flex-col overflow-hidden bg-[#0a0a0a] px-8 py-7 text-white sm:px-14 sm:py-10">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 bottom-0 h-[46%] opacity-30 [mask-image:linear-gradient(to_top,#000_15%,transparent_75%)]"
      >
        <Dither scene="crystals" focus={0.5} cell={2} />
      </div>

      <header className="relative z-10 flex items-center justify-between gap-6">
        <div className="flex items-center gap-3">
          <Mark size={28} className="shrink-0 text-primary sm:size-8" />

          <span className="flex flex-col gap-1.5 leading-none">
            <span
              translate="no"
              className="w-fit bg-primary px-1.5 py-0.5 font-sans text-[17px] leading-[1.2] font-medium tracking-[-0.01em] text-[#0a0a0a] uppercase sm:text-[19px]"
            >
              SHAWTY
            </span>
            <span className="font-mono text-[9px] tracking-[0.22em] text-white/40 uppercase sm:text-[10px]">
              Digital signage
            </span>
          </span>
        </div>

        <span className="flex items-center gap-2 border border-white/15 px-3 py-1.5 font-mono text-[10.5px] tracking-[0.1em] whitespace-nowrap text-white/60 uppercase sm:text-[12px]">
          <span className={`block size-1.5 shrink-0 ${marker}`} />
          {content.status}
        </span>
      </header>

      <section className="relative z-10 flex flex-1 flex-col items-center justify-center text-center">
        <div
          className={`flex size-[104px] items-center justify-center border sm:size-[132px] ${
            phase === 'error'
              ? 'border-white bg-white text-[#0a0a0a]'
              : 'border-white/15 bg-white/[0.03] text-primary'
          }`}
        >
          {phase === 'authenticating' ? (
            <Loader2 className="size-9 animate-spin sm:size-11" strokeWidth={1.4} />
          ) : (
            <PixelIcon name={content.pixel} size={60} />
          )}
        </div>

        <h1 className="mt-9 max-w-[18ch] text-[40px] leading-[1.04] font-medium tracking-[-0.035em] text-balance sm:text-[56px] lg:text-[68px]">
          {content.title}
        </h1>

        {content.hint ? (
          <p className="mt-5 max-w-[58ch] text-[17px] leading-relaxed text-white/45 sm:text-[20px]">
            {content.hint}
          </p>
        ) : null}

        {phase === 'unpaired' ? (
          <div className="mt-8 border border-white/15 px-4 py-2.5 font-mono text-[12px] tracking-[0.08em] text-white/60 uppercase sm:text-[13px]">
            Панель → Экраны → «Привязать экран»
          </div>
        ) : null}
      </section>

      <footer className="relative z-10 flex flex-wrap items-end justify-between gap-4 border-t border-white/10 pt-5">
        <div className="flex items-center gap-2.5 font-mono text-[10px] tracking-[0.1em] text-white/40 uppercase sm:text-[11px]">
          <span aria-hidden className="block size-1.5 shrink-0 bg-white/70" />
          Экран работает · обновления приходят автоматически
        </div>

        <div className="text-right">
          <div className="tnum font-mono text-[22px] leading-none text-white/80 sm:text-[26px]">
            {now.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}
          </div>
          <div className="mt-1.5 font-mono text-[10px] tracking-[0.1em] text-white/30 uppercase sm:text-[11px]">
            {now.toLocaleDateString('ru-RU', { weekday: 'short', day: 'numeric', month: 'long' })}
          </div>
        </div>
      </footer>
    </main>
  )
}
