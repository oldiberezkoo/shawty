'use client'

import { Button } from '@/components/ui/button'
import { Dither } from '@/components/visual/dither'
import { Lockup } from '@/components/visual/lockup'
import { usePairing } from '../usePairing'

/**
 * Экран привязки на телевизоре.
 *
 * Часть телевизора, а не панели: он всегда тёмный, независимо от темы
 * интерфейса. Иначе на светлой теме телевизор в магазине показывал бы белое
 * поле вместо кода.
 */
export function PairingScreen() {
  const pair = usePairing()

  return (
    <main className="dark relative flex min-h-dvh flex-col overflow-hidden bg-[#0a0a0a] px-6 py-6 text-white sm:px-10">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 bottom-0 h-[70%] opacity-25 [mask-image:linear-gradient(to_top,#000_10%,transparent_78%)]"
      >
        <Dither scene="flow" focus={0.45} cell={3} />
      </div>

      <header className="relative z-10 flex items-center justify-between gap-4 border-b border-white/10 pb-4">
        <Lockup size={20} chip={null} />
        <span className="font-mono text-[10.5px] tracking-[0.16em] text-white/40 uppercase sm:text-[11.5px]">
          Pairing · привязка
        </span>
      </header>

      <div className="relative z-10 flex flex-1 flex-col items-center justify-center gap-8 py-8 text-center">
        <div className="max-w-[620px]">
          <p className="mb-4 font-mono text-[11px] tracking-[0.12em] text-white/35 uppercase">
            [01] Подключение
          </p>

          <h1 className="text-[30px] leading-[1.06] font-medium tracking-[-0.035em] text-balance sm:text-[40px]">
            {pair.phase === 'waiting' ? (
              pair.session?.codeInQr ? (
                <>
                  Отсканируйте{' '}
                  <em className="text-primary not-italic">QR-код</em>
                </>
              ) : (
                <>
                  Введите <em className="text-primary not-italic">код</em> в панели
                </>
              )
            ) : pair.phase === 'exchanging' ? (
              'Подключение подтверждено'
            ) : pair.phase === 'paired' ? (
              'Экран подключён'
            ) : pair.phase === 'expired' ? (
              'Код истёк'
            ) : pair.phase === 'error' ? (
              'Не удалось привязать экран'
            ) : (
              'Экран ожидает подключения'
            )}
          </h1>

          <p className="mx-auto mt-4 max-w-[56ch] text-[14px] leading-relaxed text-white/45 sm:text-[15.5px]">
            {pair.phase === 'waiting' && pair.session?.codeInQr
              ? 'Наведите камеру телефона. Код сам обновится, когда истечёт.'
              : pair.phase === 'waiting'
                ? 'Панель → «Подключить экран». .'
                : pair.phase === 'exchanging'
                  ? 'Получаем учётные данные экрана.'
                  : pair.phase === 'paired'
                    ? 'Открываем показ.'
                    : pair.phase === 'expired'
                      ? 'Экран обновится автоматически через пару секунд.'
                      : pair.phase === 'error'
                        ? 'Проверьте подключение к сети и повторите попытку.'
                        : 'Готовим код привязки.'}
          </p>
        </div>

        {pair.phase === 'starting' ? (
          <div className="flex items-center gap-2.5 font-mono text-[12px] tracking-[0.1em] text-white/45 uppercase">
            <span className="block size-2 animate-pulse bg-primary" />
            Подготовка…
          </div>
        ) : null}

        {pair.phase === 'waiting' && pair.session ? (
          <>
            <div className="border border-white/20 bg-white p-4 sm:p-5">
              {pair.qrDataUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={pair.qrDataUrl}
                  alt="QR-код для подключения экрана"
                  className="size-[min(66vw,300px)] sm:size-[320px]"
                />
              ) : (
                <div className="size-[min(66vw,300px)] animate-pulse bg-[#e8e8e5] sm:size-[320px]" />
              )}
            </div>

            {pair.session.codeInQr ? null : (
              <div className="flex flex-col items-center gap-4">
                <div className="tnum font-mono text-[46px] leading-none font-normal tracking-[0.18em] text-white sm:text-[58px]">
                  {pair.session.code}
                </div>

                <div className="flex flex-col items-center gap-2">
                  <div className="flex h-1.5 w-[min(72vw,360px)] justify-center overflow-hidden bg-white/25">
                    <div
                      className="h-full bg-primary transition-[width] duration-1000 ease-linear"
                      style={{ width: `${pair.codeProgressPercent}%` }}
                    />
                  </div>
                  <div className="tnum font-mono text-[11.5px] tracking-[0.1em] text-white/40 uppercase">
                    Код действует {pair.minutes}:{pair.paddedSeconds}
                  </div>
                </div>
              </div>
            )}
          </>
        ) : null}

        {pair.phase === 'exchanging' ? (
          <div className="flex items-center gap-2.5 font-mono text-[12px] tracking-[0.1em] text-primary uppercase">
            <span className="block size-2 animate-pulse bg-primary" />
            Подключение подтверждено…
          </div>
        ) : null}

        {pair.phase === 'paired' ? (
          <div className="flex items-center gap-2.5 border border-white/15 px-4 py-2.5 font-mono text-[12px] tracking-[0.1em] text-white uppercase">
            <span className="block size-2 bg-white" />
            Экран подключён
          </div>
        ) : null}

        {pair.phase === 'expired' ? (
          <div className="flex items-center gap-2.5 font-mono text-[12px] tracking-[0.1em] text-white/45 uppercase">
            <span className="block size-2 border border-white/40" />
            Готовим новый код…
          </div>
        ) : null}

        {pair.phase === 'error' ? (
          <div className="w-full max-w-[560px] border border-white/15 border-l-[3px] border-l-primary bg-white/[0.04] px-5 py-4 text-left motion-safe:animate-rise">
            <div className="mb-2 flex items-center gap-2.5 font-mono text-[10.5px] tracking-[0.12em] text-white/45 uppercase">
              <span className="block size-2 bg-primary motion-safe:animate-pulse" />
              Ошибка
            </div>
            <p className="text-[14.5px] leading-relaxed text-white/80">{pair.error}</p>
          </div>
        ) : null}

        {pair.phase === 'error' ? (
          <Button
            variant="primary"
            size="lg"
            className="motion-safe:animate-rise [animation-delay:150ms]"
            disabled={pair.retryLeftMs > 0}
            onClick={pair.retry}
          >
            {pair.retryLeftMs > 0 ? `Повторить через ${pair.retryLabel}` : 'Повторить'}
          </Button>
        ) : null}

        {pair.storageWarning ? (
          <p className="max-w-[560px] border-l-[3px] border-l-white/40 bg-white/[0.04] px-4 py-3 text-left text-[12px] leading-relaxed text-white/55">
            Устройство не поддерживает надёжное долговременное хранение. Очистка данных браузера потребует
            повторной привязки.
          </p>
        ) : null}
      </div>

      <footer className="relative z-10 flex flex-wrap items-center justify-between gap-3 border-t border-white/10 pt-4 font-mono text-[10.5px] tracking-[0.1em] text-white/40 uppercase sm:text-[11px]">
        <span>Экран не требует нажатий · код обновляется сам</span>

        <button
          type="button"
          onClick={() => void pair.reset()}
          className="tracking-[0.1em] underline underline-offset-4 transition-colors hover:text-white/70"
        >
          Сбросить привязку
        </button>
      </footer>
    </main>
  )
}
