CREATE TABLE "resolved_outages" (
	"outage_id" bigint PRIMARY KEY NOT NULL,
	"kind" varchar(16) NOT NULL,
	"key" varchar(40) NOT NULL,
	"fingerprint" varchar(64) NOT NULL,
	"resolution" jsonb NOT NULL,
	"resolved_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "resolved_outages_resolved_at_idx" ON "resolved_outages" USING btree ("resolved_at");