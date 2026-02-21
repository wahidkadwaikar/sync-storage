import {
  index,
  integer,
  pgTable,
  primaryKey as pgPrimaryKey,
  text as pgText,
  timestamp,
  varchar,
} from 'drizzle-orm/pg-core'
import {
  index as sqliteIndex,
  integer as sqliteInteger,
  primaryKey as sqlitePrimaryKey,
  sqliteTable,
  text as sqliteText,
} from 'drizzle-orm/sqlite-core'

export const pgItems = pgTable(
  'items',
  {
    tenantId: varchar('tenant_id', { length: 128 }).notNull(),
    namespace: varchar('namespace', { length: 255 }).notNull(),
    userId: varchar('user_id', { length: 255 }).notNull(),
    key: varchar('key', { length: 255 }).notNull(),
    valueJson: pgText('value_json').notNull(),
    version: integer('version').notNull().default(1),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    pk: pgPrimaryKey({ columns: [table.tenantId, table.namespace, table.userId, table.key] }),
    lookupIdx: index('idx_items_lookup').on(
      table.tenantId,
      table.namespace,
      table.userId,
      table.key
    ),
    expiryIdx: index('idx_items_expiry').on(table.expiresAt),
  })
)

export const sqliteItems = sqliteTable(
  'items',
  {
    tenantId: sqliteText('tenant_id').notNull(),
    namespace: sqliteText('namespace').notNull(),
    userId: sqliteText('user_id').notNull(),
    key: sqliteText('key').notNull(),
    valueJson: sqliteText('value_json').notNull(),
    version: sqliteInteger('version').notNull().default(1),
    expiresAt: sqliteText('expires_at'),
    createdAt: sqliteText('created_at').notNull(),
    updatedAt: sqliteText('updated_at').notNull(),
  },
  (table) => ({
    pk: sqlitePrimaryKey({ columns: [table.tenantId, table.namespace, table.userId, table.key] }),
    lookupIdx: sqliteIndex('idx_items_lookup').on(
      table.tenantId,
      table.namespace,
      table.userId,
      table.key
    ),
    expiryIdx: sqliteIndex('idx_items_expiry').on(table.expiresAt),
  })
)
