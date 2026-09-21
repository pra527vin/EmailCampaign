-- MassMail initial schema
-- citext gives us case-insensitive email columns without lower() everywhere,
-- which matters because the unique constraints on users.email,
-- suppression_list.email and (list_id, email) are what stop duplicate sends.
CREATE SCHEMA IF NOT EXISTS "public";

-- citext is required by the CITEXT columns below and cannot be declared in
-- schema.prisma without the postgresqlExtensions preview feature.
CREATE EXTENSION IF NOT EXISTS "citext";

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('ADMIN', 'MEMBER');
CREATE TYPE "TemplateStatus" AS ENUM ('DRAFT', 'ACTIVE', 'INACTIVE');
CREATE TYPE "RecipientListStatus" AS ENUM ('PROCESSING', 'READY', 'FAILED');
CREATE TYPE "CampaignStatus" AS ENUM ('DRAFT', 'QUEUED', 'SENDING', 'PAUSED', 'COMPLETED', 'CANCELLED', 'FAILED');
CREATE TYPE "CampaignRecipientStatus" AS ENUM ('PENDING', 'QUEUED', 'SENDING', 'SENT', 'FAILED', 'BOUNCED', 'COMPLAINT', 'UNSUBSCRIBED', 'SKIPPED');
CREATE TYPE "EmailEventType" AS ENUM ('QUEUED', 'SEND', 'DELIVERY', 'DELIVERY_DELAY', 'BOUNCE', 'COMPLAINT', 'REJECT', 'OPEN', 'CLICK', 'RENDERING_FAILURE', 'SUBSCRIPTION', 'FAILED');
CREATE TYPE "SuppressionReason" AS ENUM ('UNSUBSCRIBE', 'BOUNCE', 'COMPLAINT', 'MANUAL');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "email" CITEXT NOT NULL,
    "name" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "role" "UserRole" NOT NULL DEFAULT 'MEMBER',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "last_login_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "sessions" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "token_hash" TEXT NOT NULL,
    "user_agent" TEXT,
    "ip_address" TEXT,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "revoked_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "email_templates" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "subject" TEXT NOT NULL,
    "html_content" TEXT NOT NULL,
    "text_content" TEXT NOT NULL,
    "status" "TemplateStatus" NOT NULL DEFAULT 'DRAFT',
    "variables" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "email_templates_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "recipient_lists" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "source_file_name" TEXT NOT NULL,
    "source_file_size" INTEGER NOT NULL,
    "source_file_hash" TEXT NOT NULL,
    "stored_file_path" TEXT,
    "status" "RecipientListStatus" NOT NULL DEFAULT 'PROCESSING',
    "total_rows" INTEGER NOT NULL DEFAULT 0,
    "valid_count" INTEGER NOT NULL DEFAULT 0,
    "invalid_count" INTEGER NOT NULL DEFAULT 0,
    "duplicate_count" INTEGER NOT NULL DEFAULT 0,
    "imported_count" INTEGER NOT NULL DEFAULT 0,
    "columns" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "error_sample" JSONB,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "recipient_lists_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "recipients" (
    "id" UUID NOT NULL,
    "list_id" UUID NOT NULL,
    "email" CITEXT NOT NULL,
    "name" TEXT,
    "first_name" TEXT,
    "last_name" TEXT,
    "company" TEXT,
    "store_name" TEXT,
    "store_url" TEXT,
    "custom_fields" JSONB NOT NULL DEFAULT '{}',
    "row_number" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "recipients_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "campaigns" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "list_id" UUID NOT NULL,
    "template_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "from_email" TEXT NOT NULL,
    "from_name" TEXT,
    "reply_to_email" TEXT,
    "status" "CampaignStatus" NOT NULL DEFAULT 'DRAFT',
    "total_recipients" INTEGER NOT NULL DEFAULT 0,
    "sent_count" INTEGER NOT NULL DEFAULT 0,
    "failed_count" INTEGER NOT NULL DEFAULT 0,
    "bounce_count" INTEGER NOT NULL DEFAULT 0,
    "complaint_count" INTEGER NOT NULL DEFAULT 0,
    "unsubscribe_count" INTEGER NOT NULL DEFAULT 0,
    "skipped_count" INTEGER NOT NULL DEFAULT 0,
    "send_rate_per_second" INTEGER,
    "last_error" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "started_at" TIMESTAMPTZ(3),
    "paused_at" TIMESTAMPTZ(3),
    "cancelled_at" TIMESTAMPTZ(3),
    "completed_at" TIMESTAMPTZ(3),

    CONSTRAINT "campaigns_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "campaign_recipients" (
    "id" UUID NOT NULL,
    "campaign_id" UUID NOT NULL,
    "recipient_id" UUID NOT NULL,
    "email" CITEXT NOT NULL,
    "status" "CampaignRecipientStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "message_id" TEXT,
    "error_code" TEXT,
    "error_message" TEXT,
    "last_attempt_at" TIMESTAMPTZ(3),
    "sent_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "campaign_recipients_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "email_events" (
    "id" UUID NOT NULL,
    "campaign_id" UUID,
    "campaign_recipient_id" UUID,
    "message_id" TEXT,
    "email" CITEXT,
    "type" "EmailEventType" NOT NULL,
    "payload" JSONB,
    "occurred_at" TIMESTAMPTZ(3) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "email_events_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "suppression_list" (
    "id" UUID NOT NULL,
    "email" CITEXT NOT NULL,
    "reason" "SuppressionReason" NOT NULL,
    "source" TEXT,
    "campaign_id" UUID,
    "notes" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "suppression_list_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "audit_logs" (
    "id" UUID NOT NULL,
    "user_id" UUID,
    "action" TEXT NOT NULL,
    "entity_type" TEXT,
    "entity_id" TEXT,
    "metadata" JSONB,
    "ip_address" TEXT,
    "user_agent" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

CREATE UNIQUE INDEX "sessions_token_hash_key" ON "sessions"("token_hash");
CREATE INDEX "sessions_user_id_idx" ON "sessions"("user_id");
CREATE INDEX "sessions_expires_at_idx" ON "sessions"("expires_at");

CREATE UNIQUE INDEX "email_templates_user_id_name_key" ON "email_templates"("user_id", "name");
CREATE INDEX "email_templates_user_id_status_idx" ON "email_templates"("user_id", "status");

CREATE INDEX "recipient_lists_user_id_created_at_idx" ON "recipient_lists"("user_id", "created_at");

CREATE UNIQUE INDEX "recipients_list_id_email_key" ON "recipients"("list_id", "email");
CREATE INDEX "recipients_email_idx" ON "recipients"("email");

CREATE INDEX "campaigns_user_id_status_idx" ON "campaigns"("user_id", "status");
CREATE INDEX "campaigns_user_id_created_at_idx" ON "campaigns"("user_id", "created_at");

CREATE UNIQUE INDEX "campaign_recipients_message_id_key" ON "campaign_recipients"("message_id");
CREATE UNIQUE INDEX "campaign_recipients_campaign_id_recipient_id_key" ON "campaign_recipients"("campaign_id", "recipient_id");
CREATE INDEX "campaign_recipients_campaign_id_status_idx" ON "campaign_recipients"("campaign_id", "status");
CREATE INDEX "campaign_recipients_campaign_id_created_at_idx" ON "campaign_recipients"("campaign_id", "created_at");
CREATE INDEX "campaign_recipients_email_idx" ON "campaign_recipients"("email");

CREATE INDEX "email_events_campaign_id_type_idx" ON "email_events"("campaign_id", "type");
CREATE INDEX "email_events_message_id_idx" ON "email_events"("message_id");
CREATE INDEX "email_events_occurred_at_idx" ON "email_events"("occurred_at");

CREATE UNIQUE INDEX "suppression_list_email_key" ON "suppression_list"("email");
CREATE INDEX "suppression_list_reason_idx" ON "suppression_list"("reason");

CREATE INDEX "audit_logs_user_id_created_at_idx" ON "audit_logs"("user_id", "created_at");
CREATE INDEX "audit_logs_action_created_at_idx" ON "audit_logs"("action", "created_at");
CREATE INDEX "audit_logs_entity_type_entity_id_idx" ON "audit_logs"("entity_type", "entity_id");

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "email_templates" ADD CONSTRAINT "email_templates_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "recipient_lists" ADD CONSTRAINT "recipient_lists_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "recipients" ADD CONSTRAINT "recipients_list_id_fkey" FOREIGN KEY ("list_id") REFERENCES "recipient_lists"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_list_id_fkey" FOREIGN KEY ("list_id") REFERENCES "recipient_lists"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "email_templates"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "campaign_recipients" ADD CONSTRAINT "campaign_recipients_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "campaign_recipients" ADD CONSTRAINT "campaign_recipients_recipient_id_fkey" FOREIGN KEY ("recipient_id") REFERENCES "recipients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "email_events" ADD CONSTRAINT "email_events_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "email_events" ADD CONSTRAINT "email_events_campaign_recipient_id_fkey" FOREIGN KEY ("campaign_recipient_id") REFERENCES "campaign_recipients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
