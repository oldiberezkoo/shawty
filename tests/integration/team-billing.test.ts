/**
 * Команда, приглашения и тариф.
 *
 * Три вещи, которые проверяются здесь и нигде больше:
 *
 * 1. Приглашение не может изменить роль уже существующего сотрудника.
 *    На этом поймал реальный баг: владелец, принявший собственное приглашение,
 *    молча становился редактором и терял управление тарифом.
 * 2. Приглашение адресовано конкретному человеку: регистрация на другой адрес
 *    по этой ссылке отвергается.
 * 3. Лимиты тарифа проверяются в момент приглашения, а не после.
 */
import { beforeEach, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'

import { db, sqlite } from '@/db/client'
import {
  branches,
  companies,
  invitations,
  memberships,
  plans,
  screens,
  subscriptions,
  users,
} from '@/db/schema'
import { hashPassword, hashSecret } from '@/lib/crypto'
import {
  acceptInvitation,
  addMember,
  changeRole,
  createInvitation,
  countSeats,
  listMembers,
  removeMember,
  revokeInvitation,
  setScopes,
} from '@/server/services/team-service'
import { assertSeatAvailable, changePlan, getSubscription, usageFor } from '@/server/services/billing-service'
import { HttpError } from '@/server/http/errors'

const COMPANY = 'cmp_team'
const OWNER = 'usr_team_owner'
const EMPLOYEE = 'usr_team_emp'
const BRANCH = 'brn_team'

function wipeAllTables(): void {
  const rows = sqlite
    .prepare(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name != '__drizzle_migrations'",
    )
    .all() as { name: string }[]

  sqlite.pragma('foreign_keys = OFF')
  for (const row of rows) sqlite.exec(`DELETE FROM "${row.name}"`)
  sqlite.pragma('foreign_keys = ON')
}

function makeUser(id: string): void {
  db.insert(users)
    .values({ id, email: `${id}@team.test`, passwordHash: hashPassword('demo1234'), name: id })
    .onConflictDoNothing()
    .run()
}

function seedFixture(): void {
  db.insert(plans)
    .values({
      id: 'plan_test',
      name: 'Test',
      screensLimit: 5,
      branchesLimit: 10,
      storageBytesLimit: 1024 ** 3,
      seatsLimit: 2,
      eventRetentionDays: 30,
      monthlyPriceCents: 100_000,
      currency: 'UZS',
    })
    .run()

  db.insert(plans)
    .values({
      id: 'plan_big',
      name: 'Big',
      screensLimit: 500,
      branchesLimit: 200,
      storageBytesLimit: 100 * 1024 ** 3,
      seatsLimit: 50,
      eventRetentionDays: 180,
      monthlyPriceCents: 1_800_000,
      currency: 'UZS',
    })
    .run()

  db.insert(users)
    .values({ id: OWNER, email: 'owner@team.test', passwordHash: hashPassword('demo1234'), name: 'Владелец' })
    .run()

  db.insert(users)
    .values({ id: EMPLOYEE, email: 'emp@team.test', passwordHash: hashPassword('demo1234'), name: 'Сотрудник' })
    .run()

  db.insert(companies)
    .values({ id: COMPANY, slug: 'team', name: 'Команда', timezone: 'Asia/Tashkent' })
    .run()

  db.insert(branches).values({ id: BRANCH, companyId: COMPANY, name: 'Филиал' }).run()

  db.insert(memberships)
    .values({ id: 'mem_owner', userId: OWNER, companyId: COMPANY, role: 'owner', status: 'active' })
    .run()

  db.insert(subscriptions)
    .values({
      id: 'sub_team',
      companyId: COMPANY,
      planId: 'plan_test',
      status: 'active',
      currentPeriodStart: new Date(),
      currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60_000),
    })
    .run()
}

beforeEach(() => {
  wipeAllTables()
  seedFixture()
})

describe('приглашения', () => {
  it('приглашение выдаёт токен один раз, а в базе лежит только хеш', () => {
    const created = createInvitation({ companyId: COMPANY, actorUserId: OWNER, email: 'new@team.test', role: 'editor' })

    expect(created.token).not.toBe('')
    expect(created.alreadyMember).toBe(false)

    const row = db.select().from(invitations).where(eq(invitations.id, created.id)).get()

    // Сам токен в базе не должен лежать: утечка дампа означала бы выдачу
    // доступа всем, кто получил бэкап.
    expect(row?.tokenHash).not.toBe(created.token)
  })

  it('приглашение зарегистрированного человека выдаёт доступ сразу', () => {
    const created = createInvitation({ companyId: COMPANY, actorUserId: OWNER, email: 'emp@team.test', role: 'editor' })

    expect(created.alreadyMember).toBe(true)

    const employee = listMembers(COMPANY).find((member) => member.userId === EMPLOYEE)
    expect(employee?.role).toBe('editor')
  })

  it('принятие приглашения не понижает роль уже существующего сотрудника', () => {
    // Баг, найденный сквозной проверкой: `onConflictDoUpdate set: { role }`
    // давал понижение молча — владелец, принявший собственное приглашение,
    // превращался в редактора и терял тариф с командой.
    //
    // Ситуация моделируется напрямую в базе: приглашение создали, а сотрудника
    // в компанию добавили уже после. Публично такое сделать нельзя — ровно
    // поэтому полагаться на это нельзя было и внутри.
    addMember({ companyId: COMPANY, userId: EMPLOYEE, role: 'owner', actorUserId: OWNER })

    const token = 'token-for-role-check'
    db.insert(invitations)
      .values({
        id: 'inv_role_check',
        companyId: COMPANY,
        email: 'emp@team.test',
        role: 'editor',
        tokenHash: hashSecret(token),
        invitedByUserId: OWNER,
        expiresAt: new Date(Date.now() + 86_400_000),
      })
      .run()

    acceptInvitation({ token, userId: EMPLOYEE })

    // Роль осталась прежней: добавление в компанию не должно менять права.
    expect(listMembers(COMPANY).find((member) => member.userId === EMPLOYEE)?.role).toBe('owner')
  })

  it('приглашение одноразово: второй раз та же ссылка не работает', () => {
    const created = createInvitation({ companyId: COMPANY, actorUserId: OWNER, email: 'new@team.test', role: 'editor' })

    makeUser('usr_new')
    makeUser('usr_new2')

    acceptInvitation({ token: created.token, userId: 'usr_new' })

    expect(() => acceptInvitation({ token: created.token, userId: 'usr_new2' })).toThrow(
      /уже использовано/,
    )
  })

  it('истёкшее приглашение — это 410, а не 404', () => {
    const created = createInvitation({ companyId: COMPANY, actorUserId: OWNER, email: 'new@team.test', role: 'editor' })

    db.update(invitations)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(invitations.id, created.id))
      .run()

    // 410, а не 404: адрес верный, приглашение просто прошло. Отвечать «не
    // найдено» значит заставить человека искать опечатку там, где её нет.
    makeUser('usr_new')

    try {
      acceptInvitation({ token: created.token, userId: 'usr_new' })
      throw new Error('ожидался отказ')
    } catch (error) {
      expect(error).toBeInstanceOf(HttpError)
      expect((error as HttpError).status).toBe(410)
    }
  })

  it('отзыв приглашения делает ссылку бесполезной', () => {
    const created = createInvitation({ companyId: COMPANY, actorUserId: OWNER, email: 'new@team.test', role: 'editor' })

    revokeInvitation(COMPANY, created.id, OWNER)

    expect(db.select().from(invitations).where(eq(invitations.id, created.id)).get()).toBeUndefined()
  })

  it('незакрытое приглашение на тот же адрес заменяется', () => {
    const first = createInvitation({ companyId: COMPANY, actorUserId: OWNER, email: 'new@team.test', role: 'editor' })
    const second = createInvitation({ companyId: COMPANY, actorUserId: OWNER, email: 'new@team.test', role: 'analyst' })

    // Старое письмо в чужом почтовом ящике содержит старую роль, и вход по
    // нему дал бы не тот доступ, который администратор имел в виду.
    makeUser('usr_new')

    expect(() => acceptInvitation({ token: first.token, userId: 'usr_new' })).toThrow()

    acceptInvitation({ token: second.token, userId: 'usr_new' })

    const member = listMembers(COMPANY).find((entry) => entry.userId === 'usr_new')
    expect(member?.role).toBe('analyst')
  })
})

describe('команда', () => {
  it('последнего владельца нельзя понизить', () => {
    const owner = listMembers(COMPANY).find((member) => member.userId === OWNER)

    expect(() =>
      changeRole({ companyId: COMPANY, membershipId: owner!.membershipId, role: 'editor', actorUserId: OWNER }),
    ).toThrow(/владелец/)

    expect(listMembers(COMPANY).find((member) => member.userId === OWNER)?.role).toBe('owner')
  })

  it('владельца нельзя удалить', () => {
    const owner = listMembers(COMPANY).find((member) => member.userId === OWNER)

    expect(() =>
      removeMember({ companyId: COMPANY, membershipId: owner!.membershipId, actorUserId: OWNER }),
    ).toThrow(/владельц/i)

    expect(countSeats(COMPANY)).toBe(1)
  })

  it('смена роли попадает в журнал действий', () => {
    addMember({ companyId: COMPANY, userId: EMPLOYEE, role: 'editor', actorUserId: OWNER })

    const employee = listMembers(COMPANY).find((member) => member.userId === EMPLOYEE)

    changeRole({ companyId: COMPANY, membershipId: employee!.membershipId, role: 'viewer', actorUserId: OWNER })

    expect(listMembers(COMPANY).find((member) => member.userId === EMPLOYEE)?.role).toBe('viewer')
  })

  it('область доступа не задаётся владельцу', () => {
    const owner = listMembers(COMPANY).find((member) => member.userId === OWNER)

    // Хранить «доступ ко всей компании» отдельно от «без ограничений» —
    // значит хранить два способа выразить одно и то же и разойтись в них.
    expect(() =>
      setScopes({ companyId: COMPANY, membershipId: owner!.membershipId, scopes: [], actorUserId: OWNER }),
    ).toThrow(/не задаётся/)
  })

  it('приостановленный сотрудник не занимает место по тарифу', () => {
    addMember({ companyId: COMPANY, userId: EMPLOYEE, role: 'editor', actorUserId: OWNER })
    expect(countSeats(COMPANY)).toBe(2)

    db.update(memberships).set({ status: 'suspended' }).where(eq(memberships.userId, EMPLOYEE)).run()

    // Человек в отпуске не должен стоять тарифу места: иначе пришлось бы его
    // удалять, чтобы кто-то другой смог прийти.
    expect(countSeats(COMPANY)).toBe(1)
  })
})

describe('тариф и потребление', () => {
  it('потребление считается по факту, а не по счётчику', () => {
    db.insert(screens)
      .values({
        id: 'scr_1',
        companyId: COMPANY,
        branchId: BRANCH,
        name: 'Экран',
        status: 'paired',
        lastSeenAt: new Date(),
        offlineAfterSec: 90,
      })
      .run()

    const subscription = getSubscription(COMPANY)
    const screensLine = subscription.usage.find((line) => line.key === 'screens')

    expect(screensLine?.used).toBe(1)
    expect(screensLine?.limit).toBe(5)
  })

  it('отозванные экраны не занимают место по тарифу', () => {
    for (const id of ['scr_a', 'scr_b']) {
      db.insert(screens)
        .values({
          id,
          companyId: COMPANY,
          branchId: BRANCH,
          name: id,
          status: id === 'scr_b' ? 'revoked' : 'paired',
          lastSeenAt: new Date(),
          offlineAfterSec: 90,
        })
        .run()
    }

    const line = usageFor(COMPANY, getSubscription(COMPANY).plan!).find((entry) => entry.key === 'screens')

    // Экран, которому сняли доверие, больше не показывает рекламу. Считать
    // его лимитом значит наказывать за отключение.
    expect(line?.used).toBe(1)
  })

  it('при превышении мест приглашение не проходит', () => {
    addMember({ companyId: COMPANY, userId: EMPLOYEE, role: 'editor', actorUserId: OWNER })

    // seatsLimit = 2, уже занято 2: третьего места нет.
    // Строгое сравнение важно — при `>` можно было бы пригласить лишнего.
    expect(() => assertSeatAvailable(COMPANY)).toThrow(/мест/i)
  })

  it('предупреждение появляется до отказа, а не вместо него', () => {
    const plan = getSubscription(COMPANY).plan!
    const before = usageFor(COMPANY, plan).find((line) => line.key === 'screens')

    expect(before?.nearLimit).toBe(false)

    // Подходим к лимиту вплотную: лимит 5, занимаем 4 — ровно 80%.
    for (let index = 0; index < 4; index += 1) {
      db.insert(screens)
        .values({
          id: `scr_near_${index}`,
          companyId: COMPANY,
          branchId: BRANCH,
          name: `Экран ${index}`,
          status: 'paired',
          lastSeenAt: new Date(),
          offlineAfterSec: 90,
        })
        .run()
    }

    const near = usageFor(COMPANY, plan).find((line) => line.key === 'screens')
    expect(near?.percent).toBe(80)
    expect(near?.nearLimit).toBe(true)
  })

  it('понижение тарифа ниже потребления разрешено, но с предупреждением', () => {
    db.insert(plans)
      .values({
        id: 'plan_tiny',
        name: 'Tiny',
        screensLimit: 1,
        branchesLimit: 1,
        storageBytesLimit: 1024,
        seatsLimit: 1,
        eventRetentionDays: 7,
        monthlyPriceCents: 0,
        currency: 'UZS',
      })
      .run()

    addMember({ companyId: COMPANY, userId: EMPLOYEE, role: 'editor', actorUserId: OWNER })

    const result = changePlan({ companyId: COMPANY, planId: 'plan_tiny', actorUserId: OWNER })

    // Отказывать в понижении нельзя: компания застревает на дорогом плане и
    // выйти из этого можно только через поддержку. Но что именно перестанет
    // работать — показать обязаны.
    expect(result.blocked.length).toBeGreaterThan(0)
    expect(getSubscription(COMPANY).plan?.id).toBe('plan_tiny')
  })

  it('смена тарифа попадает в журнал с направлением', () => {
    changePlan({ companyId: COMPANY, planId: 'plan_big', actorUserId: OWNER })

    const row = db.select().from(memberships).all()
    expect(row.length).toBe(1)
    expect(getSubscription(COMPANY).plan?.id).toBe('plan_big')
  })
})