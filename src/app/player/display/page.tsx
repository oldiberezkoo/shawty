import type { Metadata } from 'next'
import { PlayerDisplay } from './PlayerDisplay'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Экран',
  robots: { index: false, follow: false },
}

/**
 * Экран воспроизведения.
 *
 * Отдельная страница, а не вкладка в панели: телевизор открывают с пустого
 * рабочего стола, без сессии и кук. Страница сама определяет состояние
 * устройства и либо показывает контент, либо уводит на привязку.
 */
export default function PlayerDisplayPage() {
  return <PlayerDisplay />
}
