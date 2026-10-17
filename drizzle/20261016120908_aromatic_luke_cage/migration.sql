
ALTER TABLE "resolved_outages" ADD COLUMN IF NOT EXISTS "company_id" varchar(64) DEFAULT 'beneco' NOT NULL;
--> statement-breakpoint
ALTER TABLE "resolved_outages" DROP CONSTRAINT IF EXISTS "resolved_outages_pkey";
--> statement-breakpoint
ALTER TABLE "resolved_outages" ADD CONSTRAINT "resolved_outages_pkey" PRIMARY KEY("company_id","outage_id");