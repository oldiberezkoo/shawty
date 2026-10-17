import Link from 'next/link'
import type { Metadata } from 'next'
import { requireSession } from '@/server/auth/require-session'
import { serverConfig } from '@/config/server'
import { Card, CardBody, CardHeader } from '@/components/ui/card'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = { title: 'Подключение экрана' }

/**
 * Страница-подсказка перед сканированием QR.
 *
 * Отдельный экран нужен потому, что телевизор открывают с пустого рабочего
 * стола: сотрудник должен знать адрес, который вводится в браузер телевизора,
 * и понимать, что делать дальше.
 */
export default async function PairStartPage() {
  await requireSession()

  const playerUrl = `${serverConfig.publicUrl}/player/pairing`

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-[640px] flex-col justify-center gap-6 px-6 py-12">
      <div>
        <Link href="/dashboard" className="text-[13px] text-text-muted hover:text-text transition-colors">
          ← Вернуться в панель
        </Link>
        <h1 className="mt-6 text-[22px] font-semibold tracking-[-0.02em]">Подключение экрана</h1>
      </div>

      <Card>
        <CardHeader title="Порядок действий" />
        <CardBody>
          <ol className="flex list-decimal flex-col gap-3 pl-4 text-[13px] text-text-muted">
            <li>
              Откройте на телевизоре в браузере адрес{' '}
              <code className="rounded bg-surface-2 px-1.5 py-0.5 font-mono text-[12px] text-text">
                {playerUrl}
              </code>
            </li>
            <li>На телевизоре появится QR-код и восьмизначный код.</li>
            <li>
              Отсканируйте QR камерой телефона. Код вводится на странице подтверждения
              вручную — так его невозможно перехватить, просто сфотографировав экран.
            </li>
            <li>Выберите компанию, филиал и название экрана, затем нажмите «Подключить».</li>
            <li>Телевизор сам получит учётные данные и начнёт работу.</li>
          </ol>
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title="Если что-то пошло не так"
          description="Типичные причины, которые чаще всего закрываются без потери данных."
        />
        <CardBody>
          <ul className="flex list-disc flex-col gap-2 pl-4 text-[13px] text-text-muted">
            <li>
              Код истёк — экран покажет обратный отсчёт. Дайте телевизору получить новый.
            </li>
            <li>
              «Исчерпан лимит тарифа» — подключение не создаётся, но подтверждение можно
              повторить после увеличения тарифа, заново на телевизере ничего делать не нужно.
            </li>
            <li>
              Данные браузера на телевизоре очищены — экран вернётся в состояние ожидания.
              Это ожидаемо: для повторного подключения нужен новый QR.
            </li>
          </ul>
        </CardBody>
      </Card>
    </main>
  )
}
