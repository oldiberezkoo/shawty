import { dashboardRequest } from '@/shared/api/dashboard-client'
import type { CampaignDraft } from './model'

export type CampaignSaveResult = { ok: true } | { ok: false; message: string }

/**
 * Создание или правка кампании.
 *
 * `campaignId === null` — создание. Остальные поля приходят из формы уже
 * проверенными: локальная валидация остаётся в форме, здесь только транспорт.
 */
export async function saveCampaign(
  companyId: string,
  campaignId: string | null,
  draft: CampaignDraft,
): Promise<CampaignSaveResult> {
  const result = await dashboardRequest(
    campaignId ? `/api/dashboard/campaigns/${campaignId}` : '/api/dashboard/campaigns',
    { method: campaignId ? 'PATCH' : 'POST', body: JSON.stringify(draft) },
    companyId,
    campaignId ? 'Не удалось сохранить кампанию' : 'Не удалось создать кампанию',
  )

  return result.ok ? { ok: true } : { ok: false, message: result.message }
}
