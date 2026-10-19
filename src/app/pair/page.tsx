import Link from 'next/link'
import type { Metadata } from 'next'
import { ArrowLeft, Tv } from 'lucide-react'
import { requireSession } from '@/server/auth/require-session'
import { serverConfig } from '@/config/server'
import { Card, CardBody, CardHeader } from '@/components/ui/card'
import { CodeLookupForm } from './CodeLookupForm'
import { steps } from './steps'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = { title: 'Подключение экрана' }

/**
 * Подключение экрана.
 *
 * Раньше страница была сплошной инструкцией «сходи на телевизор, отсканируй,
 * вернись» — и поля, куда вернуться, на ней не было. Человеку, который открыл
 * панель на компьютере и не достал телефон, путь обрывался здесь: код,
 * который он видит на экране телевизора, было некуда вводить.
 *
 * Теперь код вводится здесь же, а инструкция осталась как объяснение того, что
 * происходит, — но не как единственный способ что-то сделать.
 *
 * Порядок изложен так, чтобы человек понимал, зачем он что-то делает, до того,
 * как сделает: код без понимания, откуда он взялся, выглядит как требование
 * без причины.
 */
export default async function PairStartPage() {
  await requireSession()

  const playerUrl = `${serverConfig.publicUrl}/player/pairing`

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-[560px] flex-col justify-center gap-6 px-4 py-12 md:px-6">
      <div>
        <Link
          href="/dashboard"
          className="inline-flex items-center gap-1.5 text-[13px] text-text-muted transition-colors hover:text-text"
        >
          <ArrowLeft className="size-3.5" strokeWidth={1.75} />
          Назад в панель
        </Link>

        <h1 className="mt-6 page-title">Подключение экрана</h1>
        <p className="mt-1.5 max-w-[56ch] text-[13px] leading-relaxed text-text-muted">
          Телевизор показывает код. Введите его здесь — экран привяжется к выбранному филиалу и сам получит
          ключи доступа.
        </p>
      </div>

      <Card>
        <CardHeader
          title="Код с телевизора"
          description="Восемь цифр под надписью на экране. Обновляются каждые несколько минут — берите те, что видны сейчас."
        />
        <CardBody>
          <CodeLookupForm />
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Если код не подходит" />
        <CardBody className="flex flex-col gap-3 text-[13px] leading-relaxed text-text-muted">
          <p>
            Код на телевизоре обновляется каждые несколько минут. Если введённый не подошёл, посмотрите на
            экран ещё раз — скорее всего, он уже сменился.
          </p>
          <p>
            Телевизор должен открыть страницу <code className="rounded bg-surface-2 px-1.5 py-0.5 font-mono text-[12px] text-text">{playerUrl}</code>{' '}
            и получить ключ доступа. Если страница не открывается — проверьте, что телевизор в сети с тем же
            интернетом, что и панель.
          </p>
          <p className="flex items-start gap-1.5 text-text-subtle">
            <Tv className="mt-0.5 size-3.5 shrink-0" strokeWidth={1.75} />
            Если код показан, а телевизор не знает, куда идти, — проще отсканировать QR с другого устройства.
            Это тот же экран, только код подставится сам.
          </p>
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title="Что произойдёт дальше"
          description="Чтобы было видно, куда ведёт этот шаг, а не только что нажать."
        />
        <CardBody>
          <ol className="flex flex-col gap-2.5 text-[13px] leading-relaxed text-text-muted">
            {steps.map((step, index) => (
              <li key={step} className="flex gap-2.5">
                <span className="tnum mt-px flex size-4 shrink-0 items-center justify-center rounded-full bg-surface-3 text-[10px] font-medium text-text-muted">
                  {index + 1}
                </span>
                <span>{step}</span>
              </li>
            ))}
          </ol>
        </CardBody>
      </Card>
    </main>
  )
}