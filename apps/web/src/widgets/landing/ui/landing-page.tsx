import { LandingFooter, LandingNav } from './landing-chrome'
import { HowItWorksSection, LandingHero } from './sections-intro'
import { ChainSection, SyncSection } from './sections-sync'
import {
  DeliverySection,
  MechanismsSection,
  PlayerSection,
  ProductSection,
} from './sections-product'
import {
  FaqSection,
  LandingFinale,
  NetworkSection,
  PricingSection,
  ScenariosSection,
} from './sections-close'

/**
 * Публичный лендинг.
 *
 * Страница только собирает секции: каждая отвечает за свой смысловой блок, а
 * общие элементы (шапка, подвал, заголовок секции, список фактов, бегущая
 * строка) живут отдельно и не дублируются.
 */
export function LandingPage() {
  return (
    <>
      <a href="#content" className="landing-skip">
        К содержимому
      </a>

      <LandingNav />

      <main id="content" className="landing-frame">
        <LandingHero />
        <HowItWorksSection />
        <SyncSection />
        <ChainSection />
        <ProductSection />
        <DeliverySection />
        <PlayerSection />
        <MechanismsSection />
        <ScenariosSection />
        <NetworkSection />
        <PricingSection />
        <FaqSection />
        <LandingFinale />
      </main>

      <LandingFooter />
    </>
  )
}
