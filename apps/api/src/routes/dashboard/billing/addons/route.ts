import { z } from 'zod'
import { route, jsonResponse, readJsonBody } from '@/server/http/request'
import { PERMISSIONS } from '@/domain/authz/permissions'
import { requireDashboardMutation, requirePermission } from '@/server/http/dashboard-request'
import { setAddonQuantity } from '@/server/services/billing-service'
import { HttpError } from '@/server/http/errors'

/**
 * Докупаемые экраны и гигабайты.
 *
 * Количество приходит абсолютным: `{ kind: 'storage', quantity: 5 }` означает
 * «пять ГБ сверх тарифа», а не «добавь пять». Так повторный запрос из двух
 * вкладок не удваивает покупку. Оплата, как и у тарифа, вносится вручную —
 * провайдер появится отдельным решением, а лимит и журнал уже живут здесь.
 */
export const PATCH = route(async (request: Request) => {
  const { companyId, access, session } = await requireDashboardMutation(request)
  requirePermission(access, PERMISSIONS.billingWrite, 'Докупать опции может только владелец')

  const body = z
    .object({
      kind: z.enum(['screens', 'storage']),
      quantity: z.number().int().min(0).max(10_240),
    })
    .safeParse(await readJsonBody(request))

  if (!body.success) {
    throw HttpError.badRequest('invalid_input', 'Не указано количество и тип опции')
  }

  const result = setAddonQuantity({
    companyId,
    kind: body.data.kind,
    quantity: body.data.quantity,
    actorUserId: session.userId,
  })

  return jsonResponse({
    ok: true,
    addons: result.addons,
    usage: result.usage,
    monthlyDeltaCents: result.monthlyDeltaCents,
  })
})
