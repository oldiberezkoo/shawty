import type { Metadata } from 'next'
import { PairingScreen } from '@/features/pairing/ui/PairingScreen'

export const metadata: Metadata = {
  title: 'Подключение экрана',
  robots: { index: false, follow: false },
}

/**
 * Экран ожидания привязки на телевизоре. Отдельная страница, а не модальное
 * окно: телевизор открывают с пустого рабочего стола, без сессии и кук.
 */
export default function PlayerPairingPage() {
  return <PairingScreen />
}
