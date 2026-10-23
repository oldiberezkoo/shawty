import type { Metadata } from 'next'
import { LandingPage } from '@/widgets/landing/ui/landing-page'

export const metadata: Metadata = {
  title: { absolute: 'SHAWTY — контент на экранах с подтверждением доставки' },
  description:
    'Публикуйте контент на телевизоры, назначайте кампании по филиалам и получайте подтверждение доставки от каждого экрана. Free — до 2 экранов бесплатно.',
  robots: { index: true, follow: true },
  openGraph: {
    type: 'website',
    locale: 'ru_RU',
    siteName: 'SHAWTY',
    title: 'SHAWTY — контент на экранах с подтверждением доставки',
    description:
      'Публикация, расписание и подтверждение показа на каждом экране сети — в одной панели.',
  },
}

export default function HomePage() {
  return <LandingPage />
}
