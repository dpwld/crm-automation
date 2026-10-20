import { sqliteTable, text, integer, primaryKey, index, uniqueIndex } from 'drizzle-orm/sqlite-core';
/** Domain rows retain the original interfaces. Owner and entity are structural,
 * indexed columns; payload is validated on every mutation by the domain API. */
export const crmRecords = sqliteTable('crm_records', {
  owner: text('owner').notNull(), entity: text('entity').notNull(), id: text('id').notNull(),
  payload: text('payload').notNull(), uniqueKey:text('unique_key'),secondaryKey:text('secondary_key'), updatedAt: text('updated_at').notNull(),
}, table => [primaryKey({columns:[table.owner,table.entity,table.id]}), index('crm_owner_entity').on(table.owner,table.entity),uniqueIndex('crm_unique_key').on(table.owner,table.entity,table.uniqueKey),uniqueIndex('crm_secondary_key').on(table.owner,table.entity,table.secondaryKey)]);
export const crmCounters = sqliteTable('crm_counters', {
  owner: text('owner').notNull(), scope: text('scope').notNull(), year: integer('year').notNull(), value: integer('value').notNull().default(0),
}, table => [primaryKey({columns:[table.owner,table.scope,table.year]})]);
export const crmFiles = sqliteTable('crm_files', {
  owner: text('owner').notNull(), bucket: text('bucket').notNull(), path: text('path').notNull(), objectKey: text('object_key').notNull(), contentType:text('content_type').notNull(), size:integer('size').notNull(),
}, table => [primaryKey({columns:[table.owner,table.bucket,table.path]})]);
export const integrationRuns = sqliteTable('integration_runs', {
  id: text('id').primaryKey(), owner:text('owner').notNull(), action:text('action').notNull(), status:text('status').notNull(), detail:text('detail').notNull(), createdAt:text('created_at').notNull(),
});

export const crmLinks=sqliteTable('crm_links',{hash:text('hash').primaryKey(),owner:text('owner').notNull(),entity:text('entity').notNull(),recordId:text('record_id').notNull(),expiresAt:text('expires_at').notNull(),revoked:integer('revoked',{mode:'boolean'}).notNull().default(false)});
export const crmActions=sqliteTable('crm_actions',{owner:text('owner').notNull(),entity:text('entity').notNull(),recordId:text('record_id').notNull(),action:text('action').notNull(),createdAt:text('created_at').notNull()},table=>[primaryKey({columns:[table.owner,table.entity,table.recordId,table.action]})]);
