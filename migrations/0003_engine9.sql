-- Migration 0003: adopt the Engine9 client schema.
-- The D1 database is now the engine9 database: the standard Engine9
-- tables replace the demo's ad-hoc person table (generated with
-- `npx e9core sqlite-ddl`), plus the api_key table used by the client API.
-- Demo content tables (artist, performance, ticket, ticket_type) are unchanged
-- and act as the site content read through the client API.

-- 1. Move the old demo person table out of the way
ALTER TABLE person RENAME TO demo_person;

-- 2. Engine9 standard schema (client-generated, idempotent)
-- @engine9/schemas/plugin
create table if not exists "plugin" (
  "id" char(36) not null,
  "path" varchar(255),
  "name" varchar(255),
  "nickname" varchar(255),
  "table_prefix" varchar(255),
  "deployed_version" varchar(255),
  "remote_plugin_id" varchar(255),
  "schema" json,
  "transforms" json,
  "created_at" datetime not null default CURRENT_TIMESTAMP,
  "modified_at" datetime not null default CURRENT_TIMESTAMP,
  primary key ("id")
);
create unique index if not exists "uidx_plugin_remote_plugin_id" on "plugin" ("remote_plugin_id");
create trigger if not exists "plugin_modified_at_auto_update"
after update on "plugin"
for each row
when NEW.modified_at is OLD.modified_at
begin
  update "plugin" set modified_at = CURRENT_TIMESTAMP where rowid = NEW.rowid;
end;
create table if not exists "plugin_history" (
  "id" integer not null primary key autoincrement,
  "plugin_id" char(36) not null,
  "path" varchar(255),
  "deployed_version" varchar(255),
  "created_at" datetime not null default CURRENT_TIMESTAMP,
  "modified_at" datetime not null default CURRENT_TIMESTAMP
);
create trigger if not exists "plugin_history_modified_at_auto_update"
after update on "plugin_history"
for each row
when NEW.modified_at is OLD.modified_at
begin
  update "plugin_history" set modified_at = CURRENT_TIMESTAMP where rowid = NEW.rowid;
end;
create table if not exists "setting" (
  "id" integer not null primary key autoincrement,
  "plugin_id" char(36),
  "name" varchar(255),
  "value" varchar(255),
  "created_at" datetime not null default CURRENT_TIMESTAMP,
  "modified_at" datetime not null default CURRENT_TIMESTAMP
);
create unique index if not exists "uidx_setting_plugin_id_name" on "setting" ("plugin_id","name");
create trigger if not exists "setting_modified_at_auto_update"
after update on "setting"
for each row
when NEW.modified_at is OLD.modified_at
begin
  update "setting" set modified_at = CURRENT_TIMESTAMP where rowid = NEW.rowid;
end;
create table if not exists "input" (
  "id" char(36) not null,
  "plugin_id" char(36) not null,
  "remote_input_id" varchar(255),
  "remote_input_name" varchar(255),
  "input_type" varchar(255),
  "min_timeline_ts" datetime,
  "max_timeline_ts" datetime,
  "records" bigint,
  "data_path" varchar(255),
  "created_at" datetime not null default CURRENT_TIMESTAMP,
  "modified_at" datetime not null default CURRENT_TIMESTAMP,
  primary key ("id")
);
create unique index if not exists "uidx_input_plugin_id_remote_input_id" on "input" ("plugin_id","remote_input_id");
create trigger if not exists "input_modified_at_auto_update"
after update on "input"
for each row
when NEW.modified_at is OLD.modified_at
begin
  update "input" set modified_at = CURRENT_TIMESTAMP where rowid = NEW.rowid;
end;
-- @engine9/schemas/person
create table if not exists "person" (
  "id" integer not null primary key autoincrement,
  "given_name" varchar(255),
  "family_name" varchar(255),
  "created_at" datetime not null default CURRENT_TIMESTAMP,
  "modified_at" datetime not null default CURRENT_TIMESTAMP
);
create trigger if not exists "person_modified_at_auto_update"
after update on "person"
for each row
when NEW.modified_at is OLD.modified_at
begin
  update "person" set modified_at = CURRENT_TIMESTAMP where rowid = NEW.rowid;
end;
create table if not exists "person_identifier" (
  "id" integer not null primary key autoincrement,
  "person_id" bigint not null default 0,
  "source_input_id" char(36),
  "id_type" varchar(255) not null default '',
  "id_value" varchar(128) not null default ''
);
create index if not exists "idx_person_identifier_person_id" on "person_identifier" ("person_id");
create index if not exists "idx_person_identifier_id_value" on "person_identifier" ("id_value");
create unique index if not exists "uidx_person_identifier_source_input_id_id_value_person_id" on "person_identifier" ("source_input_id","id_value","person_id");
-- @engine9/schemas/person_remote
-- @engine9/schemas/segment
create table if not exists "segment_folder" (
  "id" char(36) not null,
  "name" varchar(255),
  "description" text,
  "created_at" datetime not null default CURRENT_TIMESTAMP,
  "modified_at" datetime not null default CURRENT_TIMESTAMP,
  primary key ("id")
);
create trigger if not exists "segment_folder_modified_at_auto_update"
after update on "segment_folder"
for each row
when NEW.modified_at is OLD.modified_at
begin
  update "segment_folder" set modified_at = CURRENT_TIMESTAMP where rowid = NEW.rowid;
end;
create table if not exists "segment" (
  "id" char(36) not null,
  "plugin_id" char(36) not null,
  "submodule" varchar(255),
  "segment_folder_id" char(36),
  "remote_segment_id" varchar(255),
  "legacy_id" integer,
  "name" varchar(255),
  "category" varchar(255),
  "definition_path" varchar(255),
  "stars" integer,
  "search" json,
  "build_type" varchar(255) not null default 'list',
  "build_schedule" varchar(255),
  "build_status" varchar(255),
  "build_status_modified_at" datetime not null default CURRENT_TIMESTAMP,
  "build_table" varchar(255),
  "last_built" datetime,
  "people" integer,
  "reported_people" integer,
  "created_at" datetime not null default CURRENT_TIMESTAMP,
  "modified_at" datetime not null default CURRENT_TIMESTAMP,
  primary key ("id")
);
create unique index if not exists "uidx_segment_plugin_id_remote_segment_id" on "segment" ("plugin_id","remote_segment_id");
create trigger if not exists "segment_build_status_modified_at_auto_update"
after update on "segment"
for each row
when NEW.build_status_modified_at is OLD.build_status_modified_at
begin
  update "segment" set build_status_modified_at = CURRENT_TIMESTAMP where rowid = NEW.rowid;
end;
create trigger if not exists "segment_modified_at_auto_update"
after update on "segment"
for each row
when NEW.modified_at is OLD.modified_at
begin
  update "segment" set modified_at = CURRENT_TIMESTAMP where rowid = NEW.rowid;
end;
create table if not exists "person_segment" (
  "id" integer not null primary key autoincrement,
  "person_id" bigint not null default 0,
  "segment_id" char(36)
);
create unique index if not exists "uidx_person_segment_segment_id_person_id" on "person_segment" ("segment_id","person_id");
create index if not exists "idx_person_segment_person_id" on "person_segment" ("person_id");
-- @engine9/schemas/person_email
create table if not exists "person_email" (
  "id" integer not null primary key autoincrement,
  "person_id" bigint not null default 0,
  "email_type" varchar(255) not null default 'Personal',
  "email" varchar(255),
  "subscription_status" varchar(255) not null default 'Not Subscribed',
  "confirmation_status" varchar(255) default 'Not Confirmed',
  "deliverability_score" integer not null default 1,
  "preference_order" integer not null default 0,
  "email_hash_v1" varchar(64) not null default '',
  "source_input_id" char(36),
  "created_at" datetime not null default CURRENT_TIMESTAMP,
  "modified_at" datetime not null default CURRENT_TIMESTAMP
);
create index if not exists "idx_person_email_person_id" on "person_email" ("person_id");
create unique index if not exists "uidx_person_email_email_person_id" on "person_email" ("email","person_id");
create trigger if not exists "person_email_modified_at_auto_update"
after update on "person_email"
for each row
when NEW.modified_at is OLD.modified_at
begin
  update "person_email" set modified_at = CURRENT_TIMESTAMP where rowid = NEW.rowid;
end;
-- @engine9/schemas/person_phone
create table if not exists "person_phone" (
  "id" integer not null primary key autoincrement,
  "person_id" bigint not null default 0,
  "phone_type" varchar(255) not null default 'Personal',
  "phone" varchar(255),
  "preference_order" integer,
  "sms_status" varchar(255) not null default 'Not Subscribed',
  "sms_deliverability_score" integer not null default 1,
  "call_status" varchar(255) not null default 'Not Subscribed',
  "phone_hash_v1" varchar(64) not null default '',
  "source_input_id" char(36),
  "created_at" datetime not null default CURRENT_TIMESTAMP,
  "modified_at" datetime not null default CURRENT_TIMESTAMP
);
create index if not exists "idx_person_phone_person_id" on "person_phone" ("person_id");
create unique index if not exists "uidx_person_phone_phone_person_id" on "person_phone" ("phone","person_id");
create trigger if not exists "person_phone_modified_at_auto_update"
after update on "person_phone"
for each row
when NEW.modified_at is OLD.modified_at
begin
  update "person_phone" set modified_at = CURRENT_TIMESTAMP where rowid = NEW.rowid;
end;
-- @engine9/schemas/person_address
create table if not exists "person_address" (
  "id" integer not null primary key autoincrement,
  "person_id" bigint not null default 0,
  "name" varchar(255),
  "type" varchar(255),
  "status" varchar(255),
  "street_1" varchar(255),
  "street_2" varchar(255),
  "street_3" varchar(255),
  "city" varchar(255),
  "region" varchar(255),
  "postal_code" varchar(255),
  "country" varchar(255),
  "subscription_status" varchar(255) not null default 'Not Subscribed',
  "deliverability_score" integer not null default 1,
  "preference_order" integer not null default 0,
  "is_best_address" boolean,
  "created_at" datetime not null default CURRENT_TIMESTAMP,
  "modified_at" datetime not null default CURRENT_TIMESTAMP,
  "source_input_id" char(36)
);
create index if not exists "idx_person_address_person_id" on "person_address" ("person_id");
create trigger if not exists "person_address_modified_at_auto_update"
after update on "person_address"
for each row
when NEW.modified_at is OLD.modified_at
begin
  update "person_address" set modified_at = CURRENT_TIMESTAMP where rowid = NEW.rowid;
end;
-- @engine9/schemas/timeline
create table if not exists "timeline" (
  "id" char(36) not null,
  "ts" datetime,
  "input_id" char(36),
  "entry_type_id" integer,
  "person_id" bigint not null default 0,
  "source_code_id" bigint not null default 0,
  "created_at" datetime not null default CURRENT_TIMESTAMP,
  primary key ("id")
);
create index if not exists "idx_timeline_ts" on "timeline" ("ts");
create index if not exists "idx_timeline_person_id" on "timeline" ("person_id");
create index if not exists "idx_timeline_input_id" on "timeline" ("input_id");
-- @engine9/schemas/source_code
create table if not exists "source_code_dictionary" (
  "source_code_id" integer not null primary key autoincrement,
  "source_code" varchar(180) not null default '',
  "format" varchar(255),
  "format_regex" varchar(255),
  "source_code_channel" varchar(255),
  "source_code_last_used" datetime not null default CURRENT_TIMESTAMP,
  "parsing" json,
  "created_at" datetime not null default CURRENT_TIMESTAMP,
  "modified_at" datetime not null default CURRENT_TIMESTAMP
);
create unique index if not exists "uidx_source_code_dictionary_source_code" on "source_code_dictionary" ("source_code");
create index if not exists "idx_source_code_dictionary_source_code_last_used" on "source_code_dictionary" ("source_code_last_used");
create trigger if not exists "source_code_dictionary_modified_at_auto_update"
after update on "source_code_dictionary"
for each row
when NEW.modified_at is OLD.modified_at
begin
  update "source_code_dictionary" set modified_at = CURRENT_TIMESTAMP where rowid = NEW.rowid;
end;
-- @engine9/schemas/transaction/core
create table if not exists "transaction" (
  "id" char(36) not null,
  "ts" datetime,
  "input_id" char(36),
  "entry_type_id" integer,
  "person_id" bigint not null default 0,
  "amount" decimal(19,2),
  "remote_entry_id" varchar(255),
  "remote_page_name" varchar(255),
  "remote_recurring_id" varchar(255),
  "recurs_id" integer not null default 0,
  "recurring_number" integer,
  "refund_amount" decimal(19,2),
  "given_name" varchar(255),
  "family_name" varchar(255),
  "email" varchar(255),
  "source_code_id" bigint not null default 0,
  "override_source_code_id" bigint not null default 0,
  "final_source_code_id" bigint not null default 0,
  "recommended_message_id" char(36),
  "override_message_id" char(36),
  "final_message_id" char(36),
  "extra" json,
  "created_at" datetime not null default CURRENT_TIMESTAMP,
  "modified_at" datetime not null default CURRENT_TIMESTAMP,
  primary key ("id")
);
create index if not exists "idx_transaction_ts" on "transaction" ("ts");
create index if not exists "idx_transaction_person_id" on "transaction" ("person_id");
create index if not exists "idx_transaction_remote_entry_id" on "transaction" ("remote_entry_id");
create index if not exists "idx_transaction_modified_at" on "transaction" ("modified_at");
create trigger if not exists "transaction_modified_at_auto_update"
after update on "transaction"
for each row
when NEW.modified_at is OLD.modified_at
begin
  update "transaction" set modified_at = CURRENT_TIMESTAMP where rowid = NEW.rowid;
end;
-- @engine9/schemas/transaction/contact_details
create table if not exists "transaction" (
  "street_1" varchar(255),
  "street_2" varchar(255),
  "city" varchar(255),
  "region" varchar(255),
  "postal_code" varchar(16),
  "country" varchar(255),
  "email" varchar(255),
  "phone" varchar(24),
  "employer" varchar(255),
  "occupation" varchar(255)
);

-- 3. API keys for the client API
create table if not exists "api_key" (
  "id" char(36) not null,
  "name" varchar(255) not null default '',
  "key_hash" varchar(64) not null default '',
  "scopes" json,
  "active" boolean not null default 1,
  "expires_at" datetime,
  "created_at" datetime not null default CURRENT_TIMESTAMP,
  "modified_at" datetime not null default CURRENT_TIMESTAMP,
  primary key ("id")
);
create unique index if not exists "uidx_api_key_key_hash" on "api_key" ("key_hash");

-- 4. Migrate demo people into the engine9 tables (ids are preserved, so
-- session person_ids and ticket rows keep working)
INSERT INTO person (id, given_name, family_name)
SELECT person_id,
  CASE WHEN instr(name,' ') > 0 THEN substr(name, 1, instr(name,' ') - 1) ELSE name END,
  CASE WHEN instr(name,' ') > 0 THEN substr(name, instr(name,' ') + 1) ELSE '' END
FROM demo_person;

INSERT INTO person_email (person_id, email, subscription_status)
SELECT person_id, email, 'Subscribed' FROM demo_person WHERE email IS NOT NULL;

INSERT INTO person_address (person_id, street_1, subscription_status)
SELECT person_id, address, 'Subscribed' FROM demo_person WHERE address IS NOT NULL;

-- 5. Repoint ticket's foreign key at the engine9 person table
-- (the RENAME in step 1 rewrote its REFERENCES clause to demo_person)
CREATE TABLE ticket_new (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  person_id      INTEGER NOT NULL REFERENCES person(id) ON DELETE CASCADE,
  ticket_type_id INTEGER NOT NULL REFERENCES ticket_type(id),
  purchased_at   TEXT NOT NULL DEFAULT (datetime('now'))
);
INSERT INTO ticket_new SELECT * FROM ticket;
DROP TABLE ticket;
ALTER TABLE ticket_new RENAME TO ticket;
CREATE INDEX idx_ticket_person ON ticket(person_id);

DROP TABLE demo_person;

-- 6. Seed engine9 rows for this site
-- The website plugin: all people written through the client API are
-- attributed to this plugin (id = getPluginUUID('engine9.demo', 'festival-website'))
INSERT INTO plugin (id, path, name, table_prefix)
VALUES ('86dfc4a8-318b-51e6-9f25-d9648f963609', '@demo/festival-website', 'Festival Website', '');

-- Demo API key: e9key_0ca7302713d70f5d130cf52cbf9167f0ea1a45ef (sha-256 stored).
-- Rotate for any non-demo deployment: npx e9core create-api-key
INSERT INTO api_key (id, name, key_hash, scopes, active)
VALUES (
  'f31c2c8f-0296-4dd8-9b3c-2b0e4f4dbe1a',
  'festival-demo-website',
  'eb6638ecc09eb068be0c6abccde309c25f40ab0fc6bf66da94489ad67c4aa9e1',
  '["people:write","tables:write","data:read"]',
  1
);

-- VIP segment: membership gates the VIP content read through the client API
INSERT INTO segment (id, plugin_id, name, build_type)
VALUES ('5f2ab45c-0a39-4939-a2af-c1fcc58f37ff', '86dfc4a8-318b-51e6-9f25-d9648f963609', 'VIP', 'list');

-- Existing VIP ticket holders join the segment
INSERT INTO person_segment (segment_id, person_id)
SELECT '5f2ab45c-0a39-4939-a2af-c1fcc58f37ff', t.person_id
FROM ticket t JOIN ticket_type tt ON t.ticket_type_id = tt.id
WHERE tt.code = 'vip';
