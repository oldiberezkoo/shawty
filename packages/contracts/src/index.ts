/**
 * Общие контракты SHAWTY: формы запросов и ответов API, кадры WebSocket,
 * коды ошибок и константы, которые нужны обеим сторонам.
 *
 * Пакет — единственная точка, которую импортируют и `apps/api`, и `apps/web`.
 * Доменные правила и доступ к БД здесь не живут: только данные и схемы.
 */

export * from './cookies'
export * from './permissions'
export * from './types'

export const CONTRACTS_VERSION = '0.1.0'
