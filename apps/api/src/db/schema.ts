import { sql } from 'drizzle-orm'
import {
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core'

const createdAt = () => integer('created_at', { mode: 'timestamp_ms' }).notNull().$defaultFn(() => new Date())
const updatedAt = () => integer('updated_at', { mode: 'timestamp_ms' }).notNull().$defaultFn(() => new Date())

/** Кто выполнял действие: пользователь дашборда или устройство. */
export const ROLE_VALUES = ['owner', 'admin', 'editor', 'analyst', 'viewer'] as const
export type Role = (typeof ROLE_VALUES)[number]

/** Область видимости для ограничения доступа сотрудника. */
export const SCOPE_TYPE_VALUES = ['screen', 'group', 'branch', 'company'] as const
export type ScopeType = (typeof SCOPE_TYPE_VALUES)[number]

export const users = sqliteTable(
  'users',
  {
    id: text('id').primaryKey(),
    email: text('email').notNull(),
    passwordHash: text('password_hash').notNull(),
    name: text('name').notNull(),
    locale: text('locale').notNull().default('ru'),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex('users_email_idx').on(t.email)],
)

export const sessions = sqliteTable(
  'sessions',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    tokenHash: text('token_hash').notNull(),
    csrfSecret: text('csrf_secret').notNull(),
    createdAt: createdAt(),
    expiresAt: integer('expires_at', { mode: 'timestamp_ms' }).notNull(),
    lastSeenAt: integer('last_seen_at', { mode: 'timestamp_ms' }).notNull(),
    revokedAt: integer('revoked_at', { mode: 'timestamp_ms' }),
    ip: text('ip'),
    userAgent: text('user_agent'),
  },
  (t) => [
    uniqueIndex('sessions_token_idx').on(t.tokenHash),
    index('sessions_user_idx').on(t.userId),
    index('sessions_expiry_idx').on(t.expiresAt),
  ],
)

export const companies = sqliteTable(
  'companies',
  {
    id: text('id').primaryKey(),
    slug: text('slug').notNull(),
    name: text('name').notNull(),
    logoAssetId: text('logo_asset_id'),
    /** IANA-зона. Филиал может переопределить её для себя. */
    timezone: text('timezone').notNull().default('Asia/Tashkent'),
    locale: text('locale').notNull().default('ru'),
    status: text('status', { enum: ['active', 'suspended'] }).notNull().default('active'),
    /**
     * Когда владелец выбрал тариф на первом входе.
     *
     * `null` — сеть только что создана, и панель обязана показать выбор
     * тарифа. Отдельный флаг нужен вместо «подписки нет»: подписка на Start
     * создаётся сразу, иначе панель открывается с ошибкой «тариф не настроен».
     */
    onboardingCompletedAt: integer('onboarding_completed_at', { mode: 'timestamp_ms' }),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex('companies_slug_idx').on(t.slug)],
)

export const memberships = sqliteTable(
  'memberships',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    companyId: text('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    role: text('role', { enum: ROLE_VALUES }).notNull(),
    status: text('status', { enum: ['active', 'invited', 'suspended'] }).notNull().default('active'),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex('memberships_user_company_idx').on(t.userId, t.companyId),
    index('memberships_company_idx').on(t.companyId),
  ],
)

export const membershipScopes = sqliteTable(
  'membership_scopes',
  {
    id: text('id').primaryKey(),
    membershipId: text('membership_id')
      .notNull()
      .references(() => memberships.id, { onDelete: 'cascade' }),
    scopeType: text('scope_type', { enum: ['screen', 'group', 'branch'] }).notNull(),
    scopeId: text('scope_id').notNull(),
  },
  (t) => [
    uniqueIndex('membership_scopes_idx').on(t.membershipId, t.scopeType, t.scopeId),
    index('membership_scopes_lookup_idx').on(t.scopeType, t.scopeId),
  ],
)

export const invitations = sqliteTable(
  'invitations',
  {
    id: text('id').primaryKey(),
    companyId: text('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    email: text('email').notNull(),
    role: text('role', { enum: ROLE_VALUES }).notNull(),
    tokenHash: text('token_hash').notNull(),
    invitedByUserId: text('invited_by_user_id')
      .notNull()
      .references(() => users.id),
    expiresAt: integer('expires_at', { mode: 'timestamp_ms' }).notNull(),
    acceptedAt: integer('accepted_at', { mode: 'timestamp_ms' }),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex('invitations_token_idx').on(t.tokenHash)],
)

export const plans = sqliteTable('plans', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  screensLimit: integer('screens_limit').notNull(),
  branchesLimit: integer('branches_limit').notNull(),
  storageBytesLimit: integer('storage_bytes_limit').notNull(),
  seatsLimit: integer('seats_limit').notNull(),
  eventRetentionDays: integer('event_retention_days').notNull().default(30),
  monthlyPriceCents: integer('monthly_price_cents').notNull().default(0),
  currency: text('currency').notNull().default('UZS'),
  isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true),
})

export const subscriptions = sqliteTable(
  'subscriptions',
  {
    id: text('id').primaryKey(),
    companyId: text('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    planId: text('plan_id')
      .notNull()
      .references(() => plans.id),
    status: text('status', {
      enum: ['trial', 'active', 'past_due', 'suspended', 'cancelled'],
    })
      .notNull()
      .default('trial'),
    currentPeriodStart: integer('current_period_start', { mode: 'timestamp_ms' }).notNull(),
    currentPeriodEnd: integer('current_period_end', { mode: 'timestamp_ms' }).notNull(),
    trialEndsAt: integer('trial_ends_at', { mode: 'timestamp_ms' }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex('subscriptions_company_idx').on(t.companyId)],
)

export const branches = sqliteTable(
  'branches',
  {
    id: text('id').primaryKey(),
    companyId: text('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    code: text('code'),
    timezone: text('timezone'),
    createdAt: createdAt(),
  },
  (t) => [index('branches_company_idx').on(t.companyId)],
)

export const screenGroups = sqliteTable(
  'screen_groups',
  {
    id: text('id').primaryKey(),
    companyId: text('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    branchId: text('branch_id').references(() => branches.id, { onDelete: 'set null' }),
    name: text('name').notNull(),
    createdAt: createdAt(),
  },
  (t) => [index('screen_groups_company_idx').on(t.companyId)],
)

/**
 * Состояния экрана.
 * unpaired — устройство потеряло локальные учётные данные (очистка браузера) и ждёт привязки.
 * disabled — временно выключен администратором, учётные данные живы.
 * revoked — доверие отозвано, устройство обязано стереть секрет.
 */
export const SCREEN_STATUS_VALUES = ['paired', 'disabled', 'revoked', 'unpaired'] as const
export type ScreenStatus = (typeof SCREEN_STATUS_VALUES)[number]

export const screens = sqliteTable(
  'screens',
  {
    id: text('id').primaryKey(),
    companyId: text('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    branchId: text('branch_id').references(() => branches.id, { onDelete: 'set null' }),
    groupId: text('group_id').references(() => screenGroups.id, { onDelete: 'set null' }),
    name: text('name').notNull(),
    status: text('status', { enum: SCREEN_STATUS_VALUES }).notNull().default('paired'),
    lastSeenAt: integer('last_seen_at', { mode: 'timestamp_ms' }),
    playerVersion: text('player_version'),
    /** Подтверждённые и неизвестные возможности устройства — см. Device Capability Profile. */
    capabilitiesJson: text('capabilities_json'),
    heartbeatIntervalSec: integer('heartbeat_interval_sec').notNull().default(30),
    /** Ниже 60 секунд даёт ложные алерты: сеть магазина часто мигает. */
    offlineAfterSec: integer('offline_after_sec').notNull().default(90),
    timezoneOverride: text('timezone_override'),
    pairedAt: integer('paired_at', { mode: 'timestamp_ms' }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index('screens_company_status_idx').on(t.companyId, t.status),
    index('screens_last_seen_idx').on(t.lastSeenAt),
    index('screens_branch_idx').on(t.branchId),
  ],
)

export const deviceCredentials = sqliteTable(
  'device_credentials',
  {
    id: text('id').primaryKey(),
    screenId: text('screen_id')
      .notNull()
      .references(() => screens.id, { onDelete: 'cascade' }),
    /** Публичная часть. Секрет хранится только в виде HMAC. */
    deviceId: text('device_id').notNull(),
    secretHash: text('secret_hash').notNull(),
    /** Рост версии мгновенно обесценивает все выданные access-токены. */
    version: integer('version').notNull().default(1),
    issuedAt: integer('issued_at', { mode: 'timestamp_ms' }).notNull(),
    lastUsedAt: integer('last_used_at', { mode: 'timestamp_ms' }),
    expiresAt: integer('expires_at', { mode: 'timestamp_ms' }),
    revokedAt: integer('revoked_at', { mode: 'timestamp_ms' }),
    replacedBy: text('replaced_by'),
    rotationPending: integer('rotation_pending', { mode: 'boolean' }).notNull().default(false),
  },
  (t) => [
    uniqueIndex('device_credentials_device_idx').on(t.deviceId),
    index('device_credentials_screen_idx').on(t.screenId),
  ],
)

/**
 * Сессия привязки. Код в БД не хранится — только HMAC.
 * Одноразовость обеспечивает переход status: pending -> confirmed/rejected/expired
 * условным UPDATE в транзакции (см. domain/pairing).
 */
export const pairingSessions = sqliteTable(
  'pairing_sessions',
  {
    id: text('id').primaryKey(),
    codeHash: text('code_hash').notNull(),
    /**
     * HMAC того же кода, но без `sessionId`.
     *
     * Нужен для поиска сессии по коду: `codeHash` привязан к паре «сессия +
     * код», поэтому по одному коду найти сессию нельзя, а без этого человек,
     * который не сканировал QR, вообще не мог добраться до формы — путь
     * обрывался на подсказке «сходи на телевизор и вернись».
     *
     * Подбор по коду остаётся защищённым: окно жизни кода — несколько минут,
     * а на запрос добавлено ограничение частоты. Значение хеша, как и сам
     * код, в базе не лежит.
     */
    codeLookupHash: text('code_lookup_hash'),
    /**
     * HMAC локального nonce телевизора.
     *
     * QR в безопасном режиме несёт только sessionId, и тот же sessionId виден
     * всем, кто посмотрел экран. Поэтому одного sessionId недостаточно, чтобы
     * забрать учётные данные: обмен дополнительно требует доказать владение
     * nonce, который телевизор сгенерировал у себя и никогда не показывал.
     */
    deviceNonceHash: text('device_nonce_hash').notNull(),
    status: text('status', { enum: ['pending', 'confirmed', 'rejected', 'expired'] })
      .notNull()
      .default('pending'),
    attempts: integer('attempts').notNull().default(0),
    maxAttempts: integer('max_attempts').notNull().default(8),
    createdAt: createdAt(),
    expiresAt: integer('expires_at', { mode: 'timestamp_ms' }).notNull(),
    confirmedAt: integer('confirmed_at', { mode: 'timestamp_ms' }),
    confirmedByUserId: text('confirmed_by_user_id').references(() => users.id),
    /** Заполняется при подтверждении: экран может быть создан в другом филиале. */
    companyId: text('company_id').references(() => companies.id),
    branchId: text('branch_id').references(() => branches.id),
    screenId: text('screen_id').references(() => screens.id),
    /**
     * Публичная часть учётных данных, выдаётся при подтверждении.
     * Секрет создаётся только в момент обмена: до этого момента его
     * не существует, поэтому хранить его не нужно даже временно.
     */
    provisionalDeviceId: text('provisional_device_id'),
    /**
     * Момент выдачи постоянных учётных данных.
     *
     * Одноразовость обмена держится на этом поле. Сам секрет устройства
     * создаётся в момент обмена и нигде не хранится, кроме HMAC.
     */
    credentialsIssuedAt: integer('credentials_issued_at', { mode: 'timestamp_ms' }),
    rejectReason: text('reject_reason'),
    createdIp: text('created_ip'),
    lastAttemptAt: integer('last_attempt_at', { mode: 'timestamp_ms' }),
  },
  (t) => [
    index('pairing_sessions_status_idx').on(t.status),
    index('pairing_sessions_expiry_idx').on(t.expiresAt),
    index('pairing_sessions_created_idx').on(t.createdAt),
    index('pairing_sessions_code_lookup_idx').on(t.codeLookupHash),
  ],
)

/** Персистентные счётчики ограничения частоты: переживают перезапуск процесса. */
export const rateLimitBuckets = sqliteTable(
  'rate_limit_buckets',
  {
    key: text('key').primaryKey(),
    windowStart: integer('window_start', { mode: 'timestamp_ms' }).notNull(),
    count: integer('count').notNull().default(0),
    updatedAt: updatedAt(),
  },
  (t) => [index('rate_limit_buckets_window_idx').on(t.windowStart)],
)

export const mediaFolders = sqliteTable(
  'media_folders',
  {
    id: text('id').primaryKey(),
    companyId: text('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    parentId: text('parent_id'),
    name: text('name').notNull(),
    createdAt: createdAt(),
  },
  (t) => [index('media_folders_company_idx').on(t.companyId)],
)

export const mediaAssets = sqliteTable(
  'media_assets',
  {
    id: text('id').primaryKey(),
    companyId: text('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    /** sha256 содержимого — основа дедупликации внутри компании. */
    sha256: text('sha256').notNull(),
    kind: text('kind', { enum: ['image', 'video', 'template'] }).notNull(),
    state: text('state', { enum: ['processing', 'ready', 'failed', 'archived'] })
      .notNull()
      .default('processing'),
    mime: text('mime').notNull(),
    bytes: integer('bytes').notNull().default(0),
    width: integer('width'),
    height: integer('height'),
    durationMs: integer('duration_ms'),
    /**
     * Превью хранится как производный артефакт рядом с ассетом, а не
     * отдельной записью: иначе в медиатеке появлялись бы фантомные картинки,
     * которые пользователь никогда не загружал.
     */
    posterSha256: text('poster_sha256'),
    posterBytes: integer('poster_bytes'),
    /** Результат ffprobe: кодеки, fps, битрейт, аудиодорожки. */
    probeJson: text('probe_json'),
    /**
     * Хеш проигрываемого файла. Отличается от `sha256` только после
     * транскодирования: оригинал хранится для повторной обработки,
     * а телевизорам отдаётся приведённый к профилю MP4.
     */
    playbackSha256: text('playback_sha256'),
    transcoded: integer('transcoded', { mode: 'boolean' }).notNull().default(false),
    error: text('error'),
    /**
     * Имя файла, как его прислал оператор.
     *
     * Без него в медиатеке две карточки выглядят одинаково — отличаются только
     * размером и разрешением, — и выбрать нужный файл невозможно. Хранится
     * ровно то, что прислали: путь и имя файла на диске у пользователя не
     * имеют отношения к тому, что он видит в библиотеке.
     */
    fileName: text('file_name'),
    folderId: text('folder_id').references(() => mediaFolders.id, { onDelete: 'set null' }),
    createdByUserId: text('created_by_user_id').references(() => users.id),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    archivedAt: integer('archived_at', { mode: 'timestamp_ms' }),
  },
  (t) => [
    uniqueIndex('media_assets_company_sha_idx').on(t.companyId, t.sha256),
    index('media_assets_company_state_idx').on(t.companyId, t.state),
    index('media_assets_folder_idx').on(t.folderId),
  ],
)

export const mediaTags = sqliteTable(
  'media_tags',
  {
    id: text('id').primaryKey(),
    companyId: text('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
  },
  (t) => [uniqueIndex('media_tags_company_name_idx').on(t.companyId, t.name)],
)

export const mediaTagLinks = sqliteTable(
  'media_tag_links',
  {
    assetId: text('asset_id')
      .notNull()
      .references(() => mediaAssets.id, { onDelete: 'cascade' }),
    tagId: text('tag_id')
      .notNull()
      .references(() => mediaTags.id, { onDelete: 'cascade' }),
  },
  (t) => [primaryKey({ columns: [t.assetId, t.tagId] })],
)

export const playlists = sqliteTable(
  'playlists',
  {
    id: text('id').primaryKey(),
    companyId: text('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    state: text('state', { enum: ['draft', 'published'] }).notNull().default('draft'),
    currentVersionId: text('current_version_id'),
    createdByUserId: text('created_by_user_id').references(() => users.id),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index('playlists_company_idx').on(t.companyId)],
)

export const playlistItems = sqliteTable(
  'playlist_items',
  {
    id: text('id').primaryKey(),
    playlistId: text('playlist_id')
      .notNull()
      .references(() => playlists.id, { onDelete: 'cascade' }),
    mediaAssetId: text('media_asset_id')
      .notNull()
      .references(() => mediaAssets.id),
    position: integer('position').notNull(),
    /** null — берём длительность из ассета (видео) или дефолт для картинки. */
    durationMs: integer('duration_ms'),
    playPolicy: text('play_policy', { enum: ['loop_once', 'to_end'] }).notNull().default('loop_once'),
    transition: text('transition', { enum: ['none', 'fade'] }).notNull().default('none'),
    audio: text('audio', { enum: ['keep', 'mute'] }).notNull().default('mute'),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex('playlist_items_position_idx').on(t.playlistId, t.position),
    index('playlist_items_asset_idx').on(t.mediaAssetId),
  ],
)

/** Неизменяемый снимок состава плейлиста: даёт откат и аудит публикации. */
export const playlistVersions = sqliteTable(
  'playlist_versions',
  {
    id: text('id').primaryKey(),
    playlistId: text('playlist_id')
      .notNull()
      .references(() => playlists.id, { onDelete: 'cascade' }),
    version: integer('version').notNull(),
    totalDurationMs: integer('total_duration_ms').notNull().default(0),
    note: text('note'),
    createdByUserId: text('created_by_user_id').references(() => users.id),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex('playlist_versions_idx').on(t.playlistId, t.version)],
)

export const playlistVersionItems = sqliteTable(
  'playlist_version_items',
  {
    id: text('id').primaryKey(),
    versionId: text('version_id')
      .notNull()
      .references(() => playlistVersions.id, { onDelete: 'cascade' }),
    position: integer('position').notNull(),
    mediaAssetId: text('media_asset_id').notNull(),
    durationMs: integer('duration_ms').notNull(),
    playPolicy: text('play_policy', { enum: ['loop_once', 'to_end'] }).notNull(),
    transition: text('transition', { enum: ['none', 'fade'] }).notNull(),
    audio: text('audio', { enum: ['keep', 'mute'] }).notNull(),
  },
  (t) => [index('playlist_version_items_idx').on(t.versionId, t.position)],
)

export const campaigns = sqliteTable(
  'campaigns',
  {
    id: text('id').primaryKey(),
    companyId: text('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    kind: text('kind', { enum: ['internal', 'commercial'] }).notNull().default('internal'),
    priority: integer('priority').notNull().default(0),
    status: text('status', {
      enum: ['draft', 'in_review', 'approved', 'scheduled', 'active', 'ended', 'archived'],
    })
      .notNull()
      .default('draft'),
    /** Даты кампании в локальном времени филиала, формат YYYY-MM-DD. */
    startsOn: text('starts_on').notNull(),
    endsOn: text('ends_on'),
    /**
     * Точные границы, если оператор задал не только дату, но и время.
     *
     * Хранятся как абсолютные моменты: часовой пояс уже учтён при вводе.
     * `null` — граница считается по дате (начало/конец суток в зоне экрана).
     */
    startsAt: integer('starts_at', { mode: 'timestamp_ms' }),
    endsAt: integer('ends_at', { mode: 'timestamp_ms' }),
    approvalRequired: integer('approval_required', { mode: 'boolean' }).notNull().default(false),
    /**
     * Версия плейлиста, которую кампания выводит на экран.
     *
     * Ссылка на неизменяемую версию, а не на плейлист: правка состава после
     * запуска кампании не должна молча менять то, что уже показывается в
     * магазине. Смена материала — новая кампания или явная перепубликация.
     */
    playlistVersionId: text('playlist_version_id').references(() => playlistVersions.id),
    /** Что показывать, когда файлы основной версии недоступны. */
    fallbackPlaylistVersionId: text('fallback_playlist_version_id').references(() => playlistVersions.id),
    /**
     * Явная зона кампании. `null` — окна считаются в зоне филиала экрана,
     * и смена часового пояса филиала сдвигает окно вместе с ним.
     */
    timezoneOverride: text('timezone_override'),
    createdByUserId: text('created_by_user_id').references(() => users.id),
    approvedByUserId: text('approved_by_user_id').references(() => users.id),
    approvedAt: integer('approved_at', { mode: 'timestamp_ms' }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index('campaigns_company_status_idx').on(t.companyId, t.status)],
)

export const campaignTargets = sqliteTable(
  'campaign_targets',
  {
    id: text('id').primaryKey(),
    campaignId: text('campaign_id')
      .notNull()
      .references(() => campaigns.id, { onDelete: 'cascade' }),
    scopeType: text('scope_type', { enum: SCOPE_TYPE_VALUES }).notNull(),
    scopeId: text('scope_id').notNull(),
  },
  (t) => [
    uniqueIndex('campaign_targets_idx').on(t.campaignId, t.scopeType, t.scopeId),
    index('campaign_targets_lookup_idx').on(t.scopeType, t.scopeId),
  ],
)

export const scheduleWindows = sqliteTable(
  'schedule_windows',
  {
    id: text('id').primaryKey(),
    campaignId: text('campaign_id')
      .notNull()
      .references(() => campaigns.id, { onDelete: 'cascade' }),
    /** Битовая маска дней недели: бит 0 — понедельник. 127 — ежедневно. */
    daysOfWeek: integer('days_of_week').notNull().default(127),
    /** Минуты от полуночи в часовом поясе источника. */
    startMinute: integer('start_minute').notNull().default(0),
    endMinute: integer('end_minute').notNull().default(1439),
    timezoneSource: text('timezone_source', { enum: ['branch', 'company', 'campaign'] })
      .notNull()
      .default('branch'),
    timezoneOverride: text('timezone_override'),
  },
  (t) => [index('schedule_windows_campaign_idx').on(t.campaignId)],
)

/** Назначение контента области экранов. Резолвится в конкретные релизы. */
export const releaseAssignments = sqliteTable(
  'release_assignments',
  {
    id: text('id').primaryKey(),
    companyId: text('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    scopeType: text('scope_type', { enum: SCOPE_TYPE_VALUES }).notNull(),
    scopeId: text('scope_id').notNull(),
    playlistVersionId: text('playlist_version_id')
      .notNull()
      .references(() => playlistVersions.id),
    fallbackPlaylistVersionId: text('fallback_playlist_version_id').references(
      () => playlistVersions.id,
    ),
    priority: integer('priority').notNull().default(0),
    isDefault: integer('is_default', { mode: 'boolean' }).notNull().default(false),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index('release_assignments_lookup_idx').on(t.companyId, t.scopeType, t.scopeId),
  ],
)

/** Опубликованный манифест: что именно должен показывать экран. Иммутабелен. */
export const releases = sqliteTable(
  'releases',
  {
    id: text('id').primaryKey(),
    companyId: text('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    campaignId: text('campaign_id').references(() => campaigns.id),
    manifestVersion: integer('manifest_version').notNull(),
    manifestJson: text('manifest_json').notNull(),
    manifestHash: text('manifest_hash').notNull(),
    itemCount: integer('item_count').notNull().default(0),
    reason: text('reason'),
    createdByUserId: text('created_by_user_id').references(() => users.id),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex('releases_company_version_idx').on(t.companyId, t.manifestVersion),
    index('releases_campaign_idx').on(t.campaignId),
  ],
)

export const releaseTargets = sqliteTable(
  'release_targets',
  {
    id: text('id').primaryKey(),
    releaseId: text('release_id')
      .notNull()
      .references(() => releases.id, { onDelete: 'cascade' }),
    screenId: text('screen_id')
      .notNull()
      .references(() => screens.id, { onDelete: 'cascade' }),
    /**
     * Кампания, чей плейлист фактически выложен на этот экран.
     *
     * Живёт здесь, а не только в `releases.campaign_id`: одна публикация может
     * нести разные программы разным экранам (у одного идёт акция, у другого
     * фоновая), а колонка у публикации описывает лишь повод. С этой связкой
     * отчёт по кампании точен, а не восстановлен по времени.
     */
    campaignId: text('campaign_id').references(() => campaigns.id, { onDelete: 'set null' }),
  },
  (t) => [
    uniqueIndex('release_targets_idx').on(t.releaseId, t.screenId),
    index('release_targets_screen_idx').on(t.screenId),
    index('release_targets_campaign_idx').on(t.campaignId),
  ],
)

/**
 * Состояние доставки релиза на конкретный экран.
 * Именно отсюда берутся четыре числа: отправлено / применили / грузят / нет связи.
 */
export const DELIVERY_STATE_VALUES = [
  'queued',
  'sent',
  'downloading',
  'applied',
  'failed',
  'stale',
] as const
export type DeliveryState = (typeof DELIVERY_STATE_VALUES)[number]

export const deliveryReceipts = sqliteTable(
  'delivery_receipts',
  {
    id: text('id').primaryKey(),
    releaseId: text('release_id')
      .notNull()
      .references(() => releases.id, { onDelete: 'cascade' }),
    screenId: text('screen_id')
      .notNull()
      .references(() => screens.id, { onDelete: 'cascade' }),
    state: text('state', { enum: DELIVERY_STATE_VALUES }).notNull().default('queued'),
    attempts: integer('attempts').notNull().default(0),
    sentAt: integer('sent_at', { mode: 'timestamp_ms' }),
    ackedAt: integer('acked_at', { mode: 'timestamp_ms' }),
    errorCode: text('error_code'),
    errorMessage: text('error_message'),
    playerVersion: text('player_version'),
    latencyMs: integer('latency_ms'),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex('delivery_receipts_idx').on(t.releaseId, t.screenId),
    index('delivery_receipts_screen_state_idx').on(t.screenId, t.state),
    // Насос доставки спрашивает очередь по состоянию и порогу времени раз в
    // две секунды. Без этого индекса каждый такой запрос — полное сканирование
    // таблицы, и сеть из сотни экранов со временем офлайна начала бы упираться
    // в саму себя. Порядок полей совпадает с запросом: state, затем время.
    index('delivery_receipts_state_updated_idx').on(t.state, t.updatedAt),
  ],
)

/**
 * Желаемое и фактически применённое состояние публикации для экрана.
 * Расхождение desired/applied — это ровно то, что показывает экран доставки.
 */
export const screenPublications = sqliteTable(
  'screen_publications',
  {
    screenId: text('screen_id')
      .primaryKey()
      .references(() => screens.id, { onDelete: 'cascade' }),
    companyId: text('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    desiredReleaseId: text('desired_release_id').references(() => releases.id),
    appliedReleaseId: text('applied_release_id').references(() => releases.id),
    desiredVersion: integer('desired_version'),
    appliedVersion: integer('applied_version'),
    appliedAt: integer('applied_at', { mode: 'timestamp_ms' }),
    /** Когда расписание требует следующей публикации: плеер готовит её заранее. */
    nextChangeAt: integer('next_change_at', { mode: 'timestamp_ms' }),
    /**
     * Версия плейлиста, из которой собрано желаемое состояние.
     *
     * По ней насос расписания узнаёт, что программа экрана должна смениться:
     * иначе пришлось бы заново разбирать манифест, а сравнение версий
     * достаточно — показывать пересобранный манифест с тем же плейлистом
     * незачем.
     */
    playlistVersionId: text('playlist_version_id').references(() => playlistVersions.id, { onDelete: 'set null' }),
    updatedAt: updatedAt(),
  },
  (t) => [index('screen_publications_company_idx').on(t.companyId)],
)

/**
 * Событие воспроизведения. Доказывает, что плеер начал показ, но не то,
 * что человек увидел рекламу. Уровень достоверности третий из трёх.
 */
export const playbackEvents = sqliteTable(
  'playback_events',
  {
    id: text('id').primaryKey(),
    screenId: text('screen_id')
      .notNull()
      .references(() => screens.id, { onDelete: 'cascade' }),
    companyId: text('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    releaseId: text('release_id').references(() => releases.id),
    itemId: text('item_id'),
    event: text('event', { enum: ['started', 'ended', 'error', 'skipped'] }).notNull(),
    at: integer('at', { mode: 'timestamp_ms' }).notNull(),
    positionMs: integer('position_ms'),
    errorCode: text('error_code'),
  },
  (t) => [
    index('playback_events_screen_at_idx').on(t.screenId, t.at),
    index('playback_events_company_at_idx').on(t.companyId, t.at),
  ],
)

export const playerErrors = sqliteTable(
  'player_errors',
  {
    id: text('id').primaryKey(),
    screenId: text('screen_id')
      .notNull()
      .references(() => screens.id, { onDelete: 'cascade' }),
    companyId: text('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    releaseId: text('release_id').references(() => releases.id),
    code: text('code').notNull(),
    message: text('message').notNull(),
    context: text('context'),
    at: integer('at', { mode: 'timestamp_ms' }).notNull(),
  },
  (t) => [index('player_errors_screen_at_idx').on(t.screenId, t.at)],
)

/**
 * Замер устройства: то, что телевизор сообщил о себе и о качестве связи.
 *
 * Отдельная таблица, а не поле в `screens`: одна строка «сейчас» не даёт
 * графика, а вопрос «почему вечером лагает» решается именно историей. Замеры
 * редкие (раз в несколько минут) и подчищаются по сроку хранения, поэтому
 * таблица не растёт бесконечно.
 */
export const deviceTelemetrySamples = sqliteTable(
  'device_telemetry_samples',
  {
    id: text('id').primaryKey(),
    screenId: text('screen_id')
      .notNull()
      .references(() => screens.id, { onDelete: 'cascade' }),
    companyId: text('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    at: integer('at', { mode: 'timestamp_ms' }).notNull(),
    /** Оценка задержки канала от устройства до сервера (ping), мс. */
    pingMs: integer('ping_ms'),
    /** Замер из Network Information API: оценка скорости, кбит/с. */
    downlinkKbps: integer('downlink_kbps'),
    /** Замер из Network Information API: оценка круговой задержки, мс. */
    networkRttMs: integer('network_rtt_ms'),
    /** Сколько занял последний запрос состояния: показывает реальную связь. */
    stateLatencyMs: integer('state_latency_ms'),
    effectiveType: text('effective_type'),
  },
  (t) => [
    index('device_telemetry_screen_at_idx').on(t.screenId, t.at),
    index('device_telemetry_at_idx').on(t.at),
  ],
)

export const deviceIncidents = sqliteTable(
  'device_incidents',
  {
    id: text('id').primaryKey(),
    screenId: text('screen_id')
      .notNull()
      .references(() => screens.id, { onDelete: 'cascade' }),
    companyId: text('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    type: text('type', {
      enum: ['offline', 'reconnected', 'version_mismatch', 'storage_low', 'unpaired', 'revoked'],
    }).notNull(),
    openedAt: integer('opened_at', { mode: 'timestamp_ms' }).notNull(),
    closedAt: integer('closed_at', { mode: 'timestamp_ms' }),
    detail: text('detail'),
  },
  (t) => [
    index('device_incidents_screen_idx').on(t.screenId, t.openedAt),
    index('device_incidents_open_idx').on(t.companyId, t.closedAt),
  ],
)

/** Append-only журнал действий сотрудников. */
export const auditLog = sqliteTable(
  'audit_log',
  {
    id: text('id').primaryKey(),
    companyId: text('company_id').references(() => companies.id, { onDelete: 'cascade' }),
    actorUserId: text('actor_user_id').references(() => users.id),
    action: text('action').notNull(),
    targetType: text('target_type'),
    targetId: text('target_id'),
    metaJson: text('meta_json'),
    ip: text('ip'),
    at: integer('at', { mode: 'timestamp_ms' }).notNull().$defaultFn(() => new Date()),
  },
  (t) => [
    index('audit_log_company_at_idx').on(t.companyId, t.at),
    index('audit_log_actor_idx').on(t.actorUserId, t.at),
  ],
)

export const usageCounters = sqliteTable(
  'usage_counters',
  {
    companyId: text('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    key: text('key').notNull(),
    value: integer('value').notNull().default(0),
    updatedAt: updatedAt(),
  },
  (t) => [primaryKey({ columns: [t.companyId, t.key] })],
)

export const invoices = sqliteTable(
  'invoices',
  {
    id: text('id').primaryKey(),
    companyId: text('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    amountCents: integer('amount_cents').notNull(),
    currency: text('currency').notNull().default('UZS'),
    status: text('status', { enum: ['draft', 'issued', 'paid', 'failed', 'refunded'] })
      .notNull()
      .default('draft'),
    periodStart: integer('period_start', { mode: 'timestamp_ms' }).notNull(),
    periodEnd: integer('period_end', { mode: 'timestamp_ms' }).notNull(),
    paidAt: integer('paid_at', { mode: 'timestamp_ms' }),
    externalId: text('external_id'),
    createdAt: createdAt(),
  },
  (t) => [index('invoices_company_idx').on(t.companyId, t.createdAt)],
)

export const apiTokens = sqliteTable(
  'api_tokens',
  {
    id: text('id').primaryKey(),
    companyId: text('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    tokenHash: text('token_hash').notNull(),
    scopesJson: text('scopes_json'),
    createdByUserId: text('created_by_user_id').references(() => users.id),
    lastUsedAt: integer('last_used_at', { mode: 'timestamp_ms' }),
    expiresAt: integer('expires_at', { mode: 'timestamp_ms' }),
    revokedAt: integer('revoked_at', { mode: 'timestamp_ms' }),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex('api_tokens_hash_idx').on(t.tokenHash)],
)

/** Справка для диагностики: активные фильтры считаются из этих индексов. */
export const SCHEMA_STATEMENTS = [
  sql`CREATE INDEX IF NOT EXISTS audit_log_recent_idx ON audit_log (company_id, at DESC)`,
]
