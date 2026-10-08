-- Align copied engine9 tables with the published @engine9/schemas tables.
-- SQLite cannot ADD a NOT NULL column whose default is CURRENT_TIMESTAMP,
-- so person_segment and person_phone are rebuilt. person_remote is new.

CREATE TABLE person_segment_new (
  "id" integer not null primary key autoincrement,
  "person_id" bigint not null default 0,
  "segment_id" char(36),
  "modified_at" datetime not null default CURRENT_TIMESTAMP
);
INSERT INTO person_segment_new (id, person_id, segment_id, modified_at)
SELECT id, person_id, segment_id, CURRENT_TIMESTAMP FROM person_segment;
DROP TABLE person_segment;
ALTER TABLE person_segment_new RENAME TO person_segment;
CREATE UNIQUE INDEX "uidx_person_segment_segment_id_person_id" ON "person_segment" ("segment_id", "person_id");
CREATE INDEX "idx_person_segment_person_id" ON "person_segment" ("person_id");

CREATE TABLE person_phone_new (
  "id" integer not null primary key autoincrement,
  "person_id" bigint not null default 0,
  "phone_type" varchar(255) not null default 'Personal',
  "phone" varchar(255),
  "preference_order" integer not null default 0,
  "sms_status" varchar(255) not null default 'Not Subscribed',
  "sms_deliverability_score" integer not null default 100,
  "call_status" varchar(255) not null default 'Not Subscribed',
  "remote_phone_id" varchar(255),
  "phone_hash_v1" varchar(64) not null default '',
  "source_input_id" char(36),
  "created_at" datetime not null default CURRENT_TIMESTAMP,
  "modified_at" datetime not null default CURRENT_TIMESTAMP
);
INSERT INTO person_phone_new (
  id, person_id, phone_type, phone, preference_order, sms_status,
  sms_deliverability_score, call_status, remote_phone_id, phone_hash_v1,
  source_input_id, created_at, modified_at
)
SELECT
  id, person_id, phone_type, phone, COALESCE(preference_order, 0), sms_status,
  sms_deliverability_score, call_status, NULL, phone_hash_v1,
  source_input_id, created_at, modified_at
FROM person_phone;
DROP TABLE person_phone;
ALTER TABLE person_phone_new RENAME TO person_phone;
CREATE INDEX "idx_person_phone_person_id" ON "person_phone" ("person_id");
CREATE UNIQUE INDEX "uidx_person_phone_phone_person_id" ON "person_phone" ("phone", "person_id");
CREATE INDEX "idx_person_phone_remote_phone_id" ON "person_phone" ("remote_phone_id");
CREATE TRIGGER "person_phone_modified_at_auto_update"
AFTER UPDATE ON "person_phone"
FOR EACH ROW
WHEN NEW.modified_at IS OLD.modified_at
BEGIN
  UPDATE "person_phone" SET modified_at = CURRENT_TIMESTAMP WHERE rowid = NEW.rowid;
END;

CREATE TABLE "person_remote" (
  "id" integer not null primary key autoincrement,
  "person_id" bigint not null default 0,
  "remote_person_id" varchar(255),
  "source_input_id" char(36),
  "created_at" datetime not null default CURRENT_TIMESTAMP,
  "modified_at" datetime not null default CURRENT_TIMESTAMP
);
CREATE INDEX "idx_person_remote_person_id" ON "person_remote" ("person_id");
CREATE INDEX "idx_person_remote_remote_person_id" ON "person_remote" ("remote_person_id");
CREATE UNIQUE INDEX "uidx_person_remote_source_input_id_remote_person_id_person_id"
  ON "person_remote" ("source_input_id", "remote_person_id", "person_id");
CREATE TRIGGER "person_remote_modified_at_auto_update"
AFTER UPDATE ON "person_remote"
FOR EACH ROW
WHEN NEW.modified_at IS OLD.modified_at
BEGIN
  UPDATE "person_remote" SET modified_at = CURRENT_TIMESTAMP WHERE rowid = NEW.rowid;
END;
