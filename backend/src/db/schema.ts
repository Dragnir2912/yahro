import {
  boolean,
  bigint,
  foreignKey,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

const auditColumns = {
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
};

const money = (name: string) => numeric(name, { precision: 19, scale: 4, mode: "string" });

export const userStatusEnum = pgEnum("user_status", ["PENDING", "ACTIVE", "LOCKED", "DELETED"]);
export const membershipRoleEnum = pgEnum("membership_role", ["OWNER", "ADMIN", "MEMBER", "VIEWER"]);
export const accountTypeEnum = pgEnum("account_type", [
  "CHECKING",
  "SAVINGS",
  "CASH",
  "MOBILE_MONEY",
  "CREDIT_CARD",
  "INVESTMENT",
  "DEBT",
  "OTHER",
]);
export const categoryTypeEnum = pgEnum("category_type", ["INCOME", "EXPENSE"]);
export const transactionTypeEnum = pgEnum("transaction_type", ["INCOME", "EXPENSE", "TRANSFER"]);
export const paymentMethodEnum = pgEnum("payment_method", ["CASH", "BANK_TRANSFER", "BANK_CARD", "MOBILE_MONEY", "DIGITAL_WALLET", "DIRECT_DEBIT", "CHECK", "OTHER"]);
export const budgetFrequencyEnum = pgEnum("budget_frequency", ["ONE_TIME", "WEEKLY", "BIWEEKLY", "MONTHLY", "QUARTERLY", "SEMIANNUAL", "ANNUAL"]);
export const projectKindEnum = pgEnum("project_kind", ["PROJECT", "ACTIVITY"]);
export const projectStatusEnum = pgEnum("project_status", ["PLANNED", "ACTIVE", "PAUSED", "COMPLETED", "CANCELLED"]);
export const importStatusEnum = pgEnum("import_status", ["PREVIEW", "COMMITTED", "FAILED", "REVERTED"]);
export const notificationTypeEnum = pgEnum("notification_type", [
  "BUDGET_WARNING",
  "BUDGET_EXCEEDED",
  "LOW_BALANCE",
  "UNUSUAL_TRANSACTION",
  "GOAL_REACHED",
  "SECURITY",
  "SYSTEM",
]);

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    email: varchar("email", { length: 320 }).notNull(),
    passwordHash: text("password_hash").notNull(),
    firstName: varchar("first_name", { length: 80 }).notNull(),
    lastName: varchar("last_name", { length: 80 }).notNull(),
    nickname: varchar("nickname", { length: 120 }).notNull(),
    avatarKey: varchar("avatar_key", { length: 32 }),
    profilePhotoData: text("profile_photo_data"),
    countryCode: varchar("country_code", { length: 2 }),
    status: userStatusEnum("status").notNull().default("PENDING"),
    emailVerifiedAt: timestamp("email_verified_at", { withTimezone: true }),
    locale: varchar("locale", { length: 10 }).notNull().default("fr"),
    timezone: varchar("timezone", { length: 64 }).notNull().default("Africa/Abidjan"),
    defaultCurrency: varchar("default_currency", { length: 3 }).notNull().default("XOF"),
    sessionVersion: integer("session_version").notNull().default(1),
    failedLoginCount: integer("failed_login_count").notNull().default(0),
    lockedUntil: timestamp("locked_until", { withTimezone: true }),
    mfaEnabled: boolean("mfa_enabled").notNull().default(false),
    totpSecretEncrypted: text("totp_secret_encrypted"),
    totpLastUsedStep: bigint("totp_last_used_step", { mode: "number" }),
    mfaEnabledAt: timestamp("mfa_enabled_at", { withTimezone: true }),
    termsAcceptedAt: timestamp("terms_accepted_at", { withTimezone: true }),
    privacyAcceptedAt: timestamp("privacy_accepted_at", { withTimezone: true }),
    termsVersion: varchar("terms_version", { length: 32 }),
    privacyVersion: varchar("privacy_version", { length: 32 }),
    onboardingCompletedAt: timestamp("onboarding_completed_at", { withTimezone: true }),
    lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    ...auditColumns,
  },
  (table) => [uniqueIndex("users_email_lower_unique").on(table.email), index("users_status_idx").on(table.status)],
);

export const tenants = pgTable(
  "tenants",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: varchar("name", { length: 120 }).notNull(),
    slug: varchar("slug", { length: 80 }).notNull(),
    baseCurrency: varchar("base_currency", { length: 3 }).notNull().default("XOF"),
    locale: varchar("locale", { length: 10 }).notNull().default("fr"),
    timezone: varchar("timezone", { length: 64 }).notNull().default("Africa/Abidjan"),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    ...auditColumns,
  },
  (table) => [uniqueIndex("tenants_slug_unique").on(table.slug)],
);

export const memberships = pgTable(
  "memberships",
  {
    tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    role: membershipRoleEnum("role").notNull().default("MEMBER"),
    invitedById: uuid("invited_by_id").references(() => users.id, { onDelete: "set null" }),
    joinedAt: timestamp("joined_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.tenantId, table.userId], name: "memberships_pk" }),
    index("memberships_user_idx").on(table.userId),
  ],
);

export const refreshSessions = pgTable(
  "refresh_sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    familyId: uuid("family_id").notNull(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
    tokenHash: varchar("token_hash", { length: 128 }).notNull(),
    userAgentHash: varchar("user_agent_hash", { length: 128 }),
    ipHash: varchar("ip_hash", { length: 128 }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    sessionVersion: integer("session_version").notNull(),
    authenticatedAt: timestamp("authenticated_at", { withTimezone: true }).notNull().defaultNow(),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    revokeReason: varchar("revoke_reason", { length: 80 }),
    replacedById: uuid("replaced_by_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("refresh_sessions_token_hash_unique").on(table.tokenHash),
    index("refresh_sessions_user_idx").on(table.userId),
    index("refresh_sessions_family_idx").on(table.familyId),
  ],
);

export const oneTimeTokens = pgTable(
  "one_time_tokens",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    purpose: varchar("purpose", { length: 40 }).notNull(),
    tokenHash: varchar("token_hash", { length: 128 }).notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    consumedAt: timestamp("consumed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("one_time_tokens_hash_unique").on(table.tokenHash), index("one_time_tokens_user_idx").on(table.userId)],
);

export const mfaChallenges = pgTable(
  "mfa_challenges",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
    tokenHash: varchar("token_hash", { length: 128 }).notNull(),
    attempts: integer("attempts").notNull().default(0),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    consumedAt: timestamp("consumed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("mfa_challenges_token_hash_unique").on(table.tokenHash),
    index("mfa_challenges_user_created_idx").on(table.userId, table.createdAt),
  ],
);

export const mfaRecoveryCodes = pgTable(
  "mfa_recovery_codes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    codeHash: varchar("code_hash", { length: 128 }).notNull(),
    usedAt: timestamp("used_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("mfa_recovery_codes_hash_unique").on(table.codeHash),
    index("mfa_recovery_codes_user_idx").on(table.userId),
  ],
);

export const accounts = pgTable(
  "accounts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 120 }).notNull(),
    type: accountTypeEnum("type").notNull(),
    currency: varchar("currency", { length: 3 }).notNull(),
    openingBalance: money("opening_balance").notNull().default("0"),
    openingBalanceDate: timestamp("opening_balance_date", { withTimezone: true }).notNull(),
    color: varchar("color", { length: 16 }),
    icon: varchar("icon", { length: 40 }),
    includeInNetWorth: boolean("include_in_net_worth").notNull().default(true),
    version: integer("version").notNull().default(1),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    ...auditColumns,
  },
  (table) => [index("accounts_tenant_idx").on(table.tenantId), index("accounts_tenant_archived_idx").on(table.tenantId, table.archivedAt)],
);

export const categories = pgTable(
  "categories",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
    ownerUserId: uuid("owner_user_id").references(() => users.id, { onDelete: "cascade" }),
    parentId: uuid("parent_id"),
    name: varchar("name", { length: 80 }).notNull(),
    type: categoryTypeEnum("type").notNull(),
    level: integer("level").notNull().default(1),
    systemKey: varchar("system_key", { length: 100 }),
    sortOrder: integer("sort_order").notNull().default(0),
    color: varchar("color", { length: 16 }),
    icon: varchar("icon", { length: 40 }),
    isSystem: boolean("is_system").notNull().default(false),
    version: integer("version").notNull().default(1),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    ...auditColumns,
  },
  (table) => [
    index("categories_tenant_idx").on(table.tenantId),
    index("categories_parent_idx").on(table.parentId),
    index("categories_owner_idx").on(table.ownerUserId),
    uniqueIndex("categories_tenant_system_key_unique").on(table.tenantId, table.systemKey),
  ],
);

export const personalCategoryDetails = pgTable(
  "personal_category_details",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
    ownerUserId: uuid("owner_user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    categoryId: uuid("category_id").notNull().references(() => categories.id, { onDelete: "restrict" }),
    name: varchar("name", { length: 100 }).notNull(),
    version: integer("version").notNull().default(1),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    ...auditColumns,
  },
  (table) => [
    index("personal_category_details_owner_category_idx").on(table.ownerUserId, table.categoryId),
    index("personal_category_details_tenant_idx").on(table.tenantId),
  ],
);

export const transactions = pgTable(
  "transactions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
    accountId: uuid("account_id").notNull().references(() => accounts.id, { onDelete: "restrict" }),
    categoryId: uuid("category_id").references(() => categories.id, { onDelete: "set null" }),
    personalDetailId: uuid("personal_detail_id").references(() => personalCategoryDetails.id, { onDelete: "restrict" }),
    createdById: uuid("created_by_id").notNull().references(() => users.id, { onDelete: "restrict" }),
    type: transactionTypeEnum("type").notNull(),
    paymentMethod: paymentMethodEnum("payment_method").notNull().default("BANK_TRANSFER"),
    amount: money("amount").notNull(),
    currency: varchar("currency", { length: 3 }).notNull(),
    transactionDate: timestamp("transaction_date", { withTimezone: true }).notNull(),
    merchant: varchar("merchant", { length: 160 }),
    description: varchar("description", { length: 240 }).notNull(),
    notes: text("notes"),
    tags: jsonb("tags").$type<string[]>().notNull().default([]),
    transferGroupId: uuid("transfer_group_id"),
    importJobId: uuid("import_job_id").references(() => importJobs.id, { onDelete: "set null" }),
    importFingerprint: varchar("import_fingerprint", { length: 128 }),
    isVerified: boolean("is_verified").notNull().default(false),
    version: integer("version").notNull().default(1),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    ...auditColumns,
  },
  (table) => [
    index("transactions_tenant_date_idx").on(table.tenantId, table.transactionDate),
    index("transactions_account_date_idx").on(table.accountId, table.transactionDate),
    index("transactions_category_date_idx").on(table.categoryId, table.transactionDate),
    uniqueIndex("transactions_import_fingerprint_unique").on(table.tenantId, table.importFingerprint),
  ],
);

export const budgets = pgTable(
  "budgets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
    categoryId: uuid("category_id").notNull().references(() => categories.id, { onDelete: "restrict" }),
    periodStart: timestamp("period_start", { withTimezone: true }).notNull(),
    periodEnd: timestamp("period_end", { withTimezone: true }).notNull(),
    amount: money("amount").notNull(),
    currency: varchar("currency", { length: 3 }).notNull(),
    frequency: budgetFrequencyEnum("frequency").notNull().default("MONTHLY"),
    warningThreshold: integer("warning_threshold").notNull().default(80),
    rolloverEnabled: boolean("rollover_enabled").notNull().default(false),
    notes: text("notes"),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    version: integer("version").notNull().default(1),
    ...auditColumns,
  },
  (table) => [
    uniqueIndex("budgets_tenant_category_period_unique").on(table.tenantId, table.categoryId, table.periodStart).where(sql`${table.archivedAt} is null`),
    index("budgets_tenant_active_period_idx").on(table.tenantId, table.periodStart).where(sql`${table.archivedAt} is null`),
  ],
);

export const projects = pgTable(
  "projects",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
    ownerUserId: uuid("owner_user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    kind: projectKindEnum("kind").notNull(),
    name: varchar("name", { length: 120 }).notNull(),
    description: text("description"),
    status: projectStatusEnum("status").notNull().default("PLANNED"),
    totalBudget: money("total_budget").notNull(),
    currency: varchar("currency", { length: 3 }).notNull(),
    budgetFrequency: budgetFrequencyEnum("budget_frequency").notNull().default("ONE_TIME"),
    startDate: timestamp("start_date", { withTimezone: true }).notNull(),
    endDate: timestamp("end_date", { withTimezone: true }),
    warningThreshold: integer("warning_threshold").notNull().default(80),
    color: varchar("color", { length: 16 }).notNull().default("#769450"),
    version: integer("version").notNull().default(1),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    ...auditColumns,
  },
  (table) => [
    index("projects_owner_status_idx").on(table.ownerUserId, table.status),
    index("projects_tenant_archived_idx").on(table.tenantId, table.archivedAt),
    uniqueIndex("projects_tenant_id_owner_unique").on(table.tenantId, table.id, table.ownerUserId),
  ],
);

export const projectBudgetLines = pgTable(
  "project_budget_lines",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
    projectId: uuid("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
    ownerUserId: uuid("owner_user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 160 }).notNull(),
    plannedAmount: money("planned_amount").notNull(),
    notes: text("notes"),
    sortOrder: integer("sort_order").notNull().default(0),
    version: integer("version").notNull().default(1),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    ...auditColumns,
  },
  (table) => [
    index("project_budget_lines_project_sort_idx").on(table.projectId, table.sortOrder),
    index("project_budget_lines_tenant_active_idx").on(table.tenantId, table.archivedAt),
    uniqueIndex("project_budget_lines_scope_id_unique").on(table.tenantId, table.projectId, table.ownerUserId, table.id),
  ],
);

export const projectExpenses = pgTable(
  "project_expenses",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
    projectId: uuid("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
    budgetLineId: uuid("budget_line_id"),
    ownerUserId: uuid("owner_user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    description: varchar("description", { length: 160 }).notNull(),
    amount: money("amount").notNull(),
    paymentMethod: paymentMethodEnum("payment_method").notNull().default("BANK_TRANSFER"),
    spentAt: timestamp("spent_at", { withTimezone: true }).notNull(),
    notes: text("notes"),
    version: integer("version").notNull().default(1),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    ...auditColumns,
  },
  (table) => [
    index("project_expenses_project_date_idx").on(table.projectId, table.spentAt),
    index("project_expenses_budget_line_idx").on(table.budgetLineId),
    index("project_expenses_owner_idx").on(table.ownerUserId),
    foreignKey({
      columns: [table.tenantId, table.projectId, table.ownerUserId, table.budgetLineId],
      foreignColumns: [projectBudgetLines.tenantId, projectBudgetLines.projectId, projectBudgetLines.ownerUserId, projectBudgetLines.id],
      name: "project_expenses_budget_line_scope_fk",
    }).onDelete("cascade"),
  ],
);

export const officialExchangeRates = pgTable(
  "official_exchange_rates",
  {
    baseCurrency: varchar("base_currency", { length: 3 }).notNull(),
    quoteCurrency: varchar("quote_currency", { length: 3 }).notNull(),
    rate: numeric("rate", { precision: 24, scale: 10, mode: "string" }).notNull(),
    rateDate: timestamp("rate_date", { withTimezone: true }).notNull(),
    source: varchar("source", { length: 40 }).notNull(),
    fetchedAt: timestamp("fetched_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.baseCurrency, table.quoteCurrency, table.rateDate, table.source], name: "official_exchange_rates_pk" }),
    index("official_exchange_rates_latest_idx").on(table.quoteCurrency, table.rateDate),
  ],
);

export const customExchangeRates = pgTable(
  "custom_exchange_rates",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
    ownerUserId: uuid("owner_user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    baseCurrency: varchar("base_currency", { length: 3 }).notNull(),
    quoteCurrency: varchar("quote_currency", { length: 3 }).notNull(),
    rate: numeric("rate", { precision: 24, scale: 10, mode: "string" }).notNull(),
    label: varchar("label", { length: 120 }),
    validFrom: timestamp("valid_from", { withTimezone: true }).notNull().defaultNow(),
    validUntil: timestamp("valid_until", { withTimezone: true }),
    active: boolean("active").notNull().default(true),
    version: integer("version").notNull().default(1),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    ...auditColumns,
  },
  (table) => [
    index("custom_exchange_rates_owner_pair_idx").on(table.ownerUserId, table.baseCurrency, table.quoteCurrency),
    index("custom_exchange_rates_tenant_idx").on(table.tenantId),
  ],
);

export const importJobs = pgTable(
  "import_jobs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
    accountId: uuid("account_id").notNull().references(() => accounts.id, { onDelete: "restrict" }),
    createdById: uuid("created_by_id").notNull().references(() => users.id, { onDelete: "restrict" }),
    status: importStatusEnum("status").notNull().default("PREVIEW"),
    originalFilename: varchar("original_filename", { length: 255 }).notNull(),
    fileHash: varchar("file_hash", { length: 128 }).notNull(),
    rowCount: integer("row_count").notNull().default(0),
    acceptedCount: integer("accepted_count").notNull().default(0),
    rejectedCount: integer("rejected_count").notNull().default(0),
    mapping: jsonb("mapping").$type<Record<string, string>>().notNull().default({}),
    errorReport: jsonb("error_report").$type<Array<{ row: number; code: string }>>().notNull().default([]),
    committedAt: timestamp("committed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("import_jobs_tenant_idx").on(table.tenantId), uniqueIndex("import_jobs_tenant_hash_unique").on(table.tenantId, table.fileHash)],
);

export const notifications = pgTable(
  "notifications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    type: notificationTypeEnum("type").notNull(),
    titleKey: varchar("title_key", { length: 100 }).notNull(),
    bodyKey: varchar("body_key", { length: 100 }).notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull().default({}),
    readAt: timestamp("read_at", { withTimezone: true }),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("notifications_user_created_idx").on(table.userId, table.createdAt), index("notifications_tenant_idx").on(table.tenantId)],
);

export const auditLogs = pgTable(
  "audit_logs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").references(() => tenants.id, { onDelete: "set null" }),
    actorUserId: uuid("actor_user_id").references(() => users.id, { onDelete: "set null" }),
    action: varchar("action", { length: 100 }).notNull(),
    entityType: varchar("entity_type", { length: 80 }),
    entityId: uuid("entity_id"),
    requestId: varchar("request_id", { length: 40 }).notNull(),
    ipHash: varchar("ip_hash", { length: 128 }),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("audit_logs_tenant_created_idx").on(table.tenantId, table.createdAt), index("audit_logs_actor_idx").on(table.actorUserId)],
);
