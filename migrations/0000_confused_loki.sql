CREATE TABLE "abandoned_checkouts" (
	"id" serial PRIMARY KEY NOT NULL,
	"store_id" varchar,
	"external_id" text,
	"customer_name" text,
	"customer_phone" text,
	"customer_email" text,
	"items" jsonb,
	"cart_value" numeric(10, 2),
	"checkout_url" text,
	"checkout_stage" text,
	"address" text,
	"assigned_to" text,
	"is_recovered" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "app_settings" (
	"store_id" varchar NOT NULL,
	"key" text NOT NULL,
	"value" jsonb NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "app_settings_store_id_key_pk" PRIMARY KEY("store_id","key")
);
--> statement-breakpoint
CREATE TABLE "attendance" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"date" timestamp NOT NULL,
	"clock_in_time" timestamp,
	"clock_out_time" timestamp,
	"status" text DEFAULT 'present' NOT NULL,
	"total_hours" numeric(5, 2),
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "attendance_breaks" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"attendance_id" varchar NOT NULL,
	"break_start" timestamp NOT NULL,
	"break_end" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "calls" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"store_id" varchar,
	"order_id" varchar NOT NULL,
	"agent_id" varchar NOT NULL,
	"customer_phone" text NOT NULL,
	"call_status" text DEFAULT 'initiated' NOT NULL,
	"called_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"call_duration" integer,
	"recording_url" text,
	"call_reference" text,
	"recipient_number" text,
	"ivr_status" text,
	"completed_at" timestamp,
	"webhook_data" jsonb,
	"transcript" text,
	"ai_analysis" jsonb
);
--> statement-breakpoint
CREATE TABLE "courses" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"slug" text NOT NULL,
	"description" text NOT NULL,
	"thumbnail" text,
	"category" text NOT NULL,
	"tags" text[] DEFAULT ARRAY[]::text[],
	"author_id" varchar,
	"prerequisite_course_ids" text[] DEFAULT ARRAY[]::text[],
	"estimated_duration" integer,
	"difficulty" text DEFAULT 'beginner',
	"is_published" boolean DEFAULT false NOT NULL,
	"order" integer DEFAULT 0,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "courses_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "customers" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"store_id" varchar,
	"shopify_customer_id" text,
	"email" text,
	"phone" text,
	"first_name" text,
	"last_name" text,
	"total_orders" integer DEFAULT 0,
	"total_spent" numeric(12, 2) DEFAULT '0',
	"tags" text[],
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "customers_store_shopify_customer_id_key" UNIQUE("store_id","shopify_customer_id")
);
--> statement-breakpoint
CREATE TABLE "holidays" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"date" date NOT NULL,
	"name" text NOT NULL,
	"state" text NOT NULL,
	"type" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "inbound_webhook_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"source" text DEFAULT 'telecrm' NOT NULL,
	"event_type" text,
	"payload" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invites" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"first_name" text,
	"last_name" text,
	"role" text DEFAULT 'agent' NOT NULL,
	"admin_type" text,
	"permissions" jsonb,
	"token" text NOT NULL,
	"invited_by" varchar,
	"status" text DEFAULT 'pending' NOT NULL,
	"expires_at" timestamp NOT NULL,
	"accepted_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "invites_email_unique" UNIQUE("email"),
	CONSTRAINT "invites_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "leave_requests" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"leave_type" text NOT NULL,
	"start_date" timestamp NOT NULL,
	"end_date" timestamp NOT NULL,
	"reason" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"reviewed_by" varchar,
	"reviewed_at" timestamp,
	"review_note" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lesson_analytics" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"lesson_id" varchar NOT NULL,
	"total_views" integer DEFAULT 0 NOT NULL,
	"unique_views" integer DEFAULT 0 NOT NULL,
	"total_completions" integer DEFAULT 0 NOT NULL,
	"average_completion_time" integer DEFAULT 0,
	"average_time_spent" integer DEFAULT 0,
	"completion_rate" numeric(5, 2) DEFAULT '0',
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "lesson_analytics_lesson_id_unique" UNIQUE("lesson_id")
);
--> statement-breakpoint
CREATE TABLE "lessons" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"course_id" varchar NOT NULL,
	"title" text NOT NULL,
	"slug" text NOT NULL,
	"description" text,
	"content" text,
	"video_url" text,
	"video_duration" integer,
	"prerequisite_lesson_ids" text[] DEFAULT ARRAY[]::text[],
	"order" integer DEFAULT 0 NOT NULL,
	"estimated_duration" integer,
	"is_published" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "lessons_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "marketing_metrics" (
	"date" date NOT NULL,
	"store_id" varchar NOT NULL,
	"fb_spend" numeric(14, 2) DEFAULT '0' NOT NULL,
	"fb_roas" numeric(10, 4),
	"fb_gmv" numeric(14, 2) DEFAULT '0' NOT NULL,
	"fb_orders" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "marketing_metrics_date_store_id_pk" PRIMARY KEY("date","store_id")
);
--> statement-breakpoint
CREATE TABLE "ndr_events" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"store_id" varchar,
	"shipment_id" varchar NOT NULL,
	"order_id" varchar NOT NULL,
	"awb" text NOT NULL,
	"ndr_status" text NOT NULL,
	"ndr_reason" text NOT NULL,
	"ndr_date" timestamp NOT NULL,
	"action_taken" text,
	"action_by" varchar,
	"action_notes" text,
	"action_at" timestamp,
	"reattempt_scheduled" boolean DEFAULT false NOT NULL,
	"reattempt_date" timestamp,
	"reattempt_awb" text,
	"updated_phone" text,
	"updated_address" jsonb,
	"resolved" boolean DEFAULT false NOT NULL,
	"resolved_at" timestamp,
	"resolution" text,
	"raw_ndr_data" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"order_id" varchar,
	"type" text NOT NULL,
	"title" text NOT NULL,
	"message" text NOT NULL,
	"is_read" boolean DEFAULT false NOT NULL,
	"read_at" timestamp,
	"action_url" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "onboarding_checklists" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"role" text NOT NULL,
	"milestones" jsonb NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"order" integer DEFAULT 0,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "order_assignments" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"store_id" varchar,
	"order_id" varchar NOT NULL,
	"user_id" varchar NOT NULL,
	"assigned_by" varchar,
	"note" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "order_items" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"store_id" varchar,
	"order_id" varchar NOT NULL,
	"shopify_line_item_id" text,
	"shopify_product_id" text,
	"shopify_variant_id" text,
	"product_name" text NOT NULL,
	"variant_title" text,
	"sku" text,
	"quantity" integer NOT NULL,
	"price" numeric(12, 2) NOT NULL,
	"total_price" numeric(12, 2) NOT NULL,
	"image_url" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "order_status_history" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"store_id" varchar,
	"order_id" varchar NOT NULL,
	"status" text NOT NULL,
	"previous_status" text,
	"changed_by" varchar,
	"note" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "orders" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"store_id" varchar,
	"shopify_order_id" text NOT NULL,
	"shopify_order_number" text NOT NULL,
	"customer_id" varchar,
	"customer_name" text NOT NULL,
	"customer_email" text,
	"customer_phone" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"call_status" text DEFAULT 'Pending' NOT NULL,
	"fulfillment_status" text,
	"fulfilled_at" timestamp,
	"financial_status" text,
	"payment_method" text NOT NULL,
	"confirmed_at" timestamp,
	"confirmed_by" varchar,
	"confirmed_notes" text,
	"cancelled_at" timestamp,
	"cancelled_by" varchar,
	"cancelled_reason" text,
	"cancelled_notes" text,
	"followup_at" timestamp,
	"followup_notes" text,
	"follow_up_attempts" integer DEFAULT 0,
	"total_price" numeric(12, 2) NOT NULL,
	"subtotal" numeric(12, 2) NOT NULL,
	"total_tax" numeric(12, 2) DEFAULT '0',
	"total_discount" numeric(12, 2) DEFAULT '0',
	"discount_code" text,
	"shipping_price" numeric(12, 2) DEFAULT '0',
	"currency" text DEFAULT 'INR' NOT NULL,
	"shipping_address" jsonb,
	"shipping_address_line1" text,
	"shipping_address_line2" text,
	"shipping_city" text,
	"shipping_state" text,
	"shipping_pincode" text,
	"shipping_country" text,
	"items_count" integer DEFAULT 1,
	"items_summary" text,
	"assigned_to" varchar,
	"assigned_at" timestamp,
	"courier_name" text,
	"tracking_number" text,
	"tracking_url" text,
	"shipment_status" text,
	"nsl_code" text,
	"failure_reason" text,
	"last_failed_at" timestamp,
	"is_actionable" boolean DEFAULT false,
	"tags" text[],
	"notes" text,
	"test_order" boolean DEFAULT false NOT NULL,
	"raw_shopify_data" jsonb,
	"last_synced_at" timestamp,
	"sync_status" text DEFAULT 'not_synced' NOT NULL,
	"shopify_created_at" timestamp NOT NULL,
	"processed_at" timestamp with time zone,
	"shopify_updated_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "orders_store_shopify_order_id_key" UNIQUE("store_id","shopify_order_id")
);
--> statement-breakpoint
CREATE TABLE "payroll_ledger" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"year" integer NOT NULL,
	"month" integer NOT NULL,
	"base_salary" numeric(12, 2) NOT NULL,
	"expected_working_days" integer NOT NULL,
	"days_present" integer NOT NULL,
	"paid_holidays_used" integer DEFAULT 0 NOT NULL,
	"base_pay_ratio" numeric(5, 4) NOT NULL,
	"base_pay_amount" numeric(12, 2) NOT NULL,
	"compensation_profile" text,
	"delivery_rate_pct" numeric(5, 2),
	"team_delivery_rate_pct" numeric(5, 2),
	"recovery_rate_pct" numeric(5, 2),
	"reships_count" integer DEFAULT 0,
	"confirmation_bonus" numeric(12, 2) DEFAULT '0' NOT NULL,
	"team_delivery_bonus" numeric(12, 2) DEFAULT '0' NOT NULL,
	"recovery_bonus" numeric(12, 2) DEFAULT '0' NOT NULL,
	"reships_bonus" numeric(12, 2) DEFAULT '0' NOT NULL,
	"total_incentives" numeric(12, 2) DEFAULT '0' NOT NULL,
	"final_payout" numeric(12, 2) NOT NULL,
	"currency" text DEFAULT 'INR' NOT NULL,
	"status" text DEFAULT 'finalized' NOT NULL,
	"pdf_filename" text,
	"recipient_email" text,
	"sent_at" timestamp,
	"email_error" text,
	"notes" text,
	"created_by" varchar,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pg_settlements" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"store_id" varchar,
	"order_id" varchar,
	"pg_name" text NOT NULL,
	"pg_order_id" text,
	"pg_payment_id" text NOT NULL,
	"order_amount" numeric(12, 2),
	"settled_amount" numeric(12, 2) NOT NULL,
	"gross_amount" numeric(12, 2),
	"fee_deducted" numeric(12, 2),
	"tax_on_fee" numeric(12, 2),
	"utr_number" text,
	"settled_at" timestamp with time zone,
	"pg_transaction_at" timestamp with time zone,
	"status" text DEFAULT 'pending' NOT NULL,
	"raw_payload" jsonb,
	"source_file" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "pg_settlements_store_payment_key" UNIQUE("store_id","pg_name","pg_payment_id")
);
--> statement-breakpoint
CREATE TABLE "pincode_tiers" (
	"pincode" varchar(12) PRIMARY KEY NOT NULL,
	"city" varchar(128),
	"state" varchar(64),
	"tier" varchar(16) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "products" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"store_id" varchar,
	"shopify_product_id" text NOT NULL,
	"shopify_variant_id" text NOT NULL,
	"title" text NOT NULL,
	"variant_title" text,
	"sku" text,
	"image_url" text,
	"last_synced_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "products_store_shopify_variant_id_key" UNIQUE("store_id","shopify_variant_id")
);
--> statement-breakpoint
CREATE TABLE "resources" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"type" text NOT NULL,
	"category" text NOT NULL,
	"file_url" text NOT NULL,
	"file_size" integer,
	"file_name" text NOT NULL,
	"mime_type" text,
	"lesson_id" varchar,
	"tags" text[] DEFAULT ARRAY[]::text[],
	"author_id" varchar,
	"download_count" integer DEFAULT 0 NOT NULL,
	"is_published" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "session" (
	"sid" varchar PRIMARY KEY NOT NULL,
	"sess" json NOT NULL,
	"expire" timestamp (6) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "shipments" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"store_id" varchar,
	"order_id" varchar NOT NULL,
	"shopify_order_id" text NOT NULL,
	"shiprocket_order_id" text,
	"shiprocket_shipment_id" text,
	"awb" text,
	"courier_name" text,
	"courier_id" text,
	"status" text DEFAULT 'created' NOT NULL,
	"current_status" text,
	"status_updated_at" timestamp,
	"tracking_url" text,
	"estimated_delivery_date" timestamp,
	"pickup_scheduled_date" timestamp,
	"picked_up_at" timestamp,
	"delivered_at" timestamp,
	"weight" numeric(10, 2),
	"length" numeric(10, 2),
	"breadth" numeric(10, 2),
	"height" numeric(10, 2),
	"raw_shiprocket_data" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "shipments_order_id_unique" UNIQUE("order_id"),
	CONSTRAINT "shipments_shiprocket_order_id_unique" UNIQUE("shiprocket_order_id"),
	CONSTRAINT "shipments_shiprocket_shipment_id_unique" UNIQUE("shiprocket_shipment_id")
);
--> statement-breakpoint
CREATE TABLE "shopify_credentials" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"store_name" text,
	"store_url" text NOT NULL,
	"api_key" text NOT NULL,
	"api_secret" text NOT NULL,
	"access_token" text,
	"webhook_secret" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"last_tested_at" timestamp,
	"test_status" text,
	"test_message" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "shopify_sync_logs" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"store_id" varchar,
	"order_id" varchar NOT NULL,
	"shopify_order_id" text NOT NULL,
	"sync_type" text NOT NULL,
	"sync_action" text NOT NULL,
	"sync_status" text DEFAULT 'pending' NOT NULL,
	"request_payload" jsonb,
	"response_data" jsonb,
	"error_message" text,
	"retry_count" integer DEFAULT 0 NOT NULL,
	"synced_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stores" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"store_name" text,
	"store_url" text NOT NULL,
	"logo_url" text,
	"api_key" text,
	"api_secret" text,
	"access_token" text,
	"webhook_secret" text,
	"meta_access_token" text,
	"meta_ad_accounts_config" jsonb,
	"is_active" boolean DEFAULT true NOT NULL,
	"last_tested_at" timestamp,
	"test_status" text,
	"test_message" text,
	"connected_by" varchar,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "stores_store_url_unique" UNIQUE("store_url")
);
--> statement-breakpoint
CREATE TABLE "team_messages" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"from_user_id" varchar NOT NULL,
	"to_user_id" varchar NOT NULL,
	"message" text NOT NULL,
	"is_read" boolean DEFAULT false NOT NULL,
	"read_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_lesson_progress" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"lesson_id" varchar NOT NULL,
	"completion_percentage" integer DEFAULT 0 NOT NULL,
	"is_completed" boolean DEFAULT false NOT NULL,
	"completed_at" timestamp,
	"time_spent" integer DEFAULT 0,
	"last_accessed_at" timestamp,
	"is_bookmarked" boolean DEFAULT false NOT NULL,
	"video_progress" integer DEFAULT 0,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_onboarding_progress" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"checklist_id" varchar NOT NULL,
	"progress" jsonb DEFAULT '{}' NOT NULL,
	"completion_percentage" integer DEFAULT 0 NOT NULL,
	"is_completed" boolean DEFAULT false NOT NULL,
	"completed_at" timestamp,
	"signed_off_by" varchar,
	"signed_off_at" timestamp,
	"started_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_stores" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"store_id" varchar NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"created_by" varchar,
	CONSTRAINT "user_stores_user_id_store_id_unique" UNIQUE("user_id","store_id")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"username" text NOT NULL,
	"password" text NOT NULL,
	"email" text NOT NULL,
	"full_name" text NOT NULL,
	"phone" text,
	"avatar_image" text,
	"role" text DEFAULT 'agent' NOT NULL,
	"admin_type" text,
	"permissions" jsonb,
	"department" text DEFAULT 'Operations',
	"employee_id" text,
	"agent_extension" varchar(10),
	"presence_status" text DEFAULT 'present' NOT NULL,
	"holiday_state" text,
	"base_salary" numeric(12, 2),
	"compensation_profile" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"kyc_document_url" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "users_username_unique" UNIQUE("username"),
	CONSTRAINT "users_email_unique" UNIQUE("email"),
	CONSTRAINT "users_employee_id_unique" UNIQUE("employee_id")
);
--> statement-breakpoint
CREATE TABLE "webhook_logs" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"store_id" varchar,
	"topic" text NOT NULL,
	"shopify_order_id" text,
	"payload" jsonb NOT NULL,
	"processed" boolean DEFAULT false NOT NULL,
	"processed_at" timestamp,
	"error" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "webhooks" (
	"id" serial PRIMARY KEY NOT NULL,
	"event_type" text NOT NULL,
	"url" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "abandoned_checkouts" ADD CONSTRAINT "abandoned_checkouts_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app_settings" ADD CONSTRAINT "app_settings_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance" ADD CONSTRAINT "attendance_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_breaks" ADD CONSTRAINT "attendance_breaks_attendance_id_attendance_id_fk" FOREIGN KEY ("attendance_id") REFERENCES "public"."attendance"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calls" ADD CONSTRAINT "calls_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calls" ADD CONSTRAINT "calls_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calls" ADD CONSTRAINT "calls_agent_id_users_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "courses" ADD CONSTRAINT "courses_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customers" ADD CONSTRAINT "customers_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invites" ADD CONSTRAINT "invites_invited_by_users_id_fk" FOREIGN KEY ("invited_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leave_requests" ADD CONSTRAINT "leave_requests_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leave_requests" ADD CONSTRAINT "leave_requests_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lesson_analytics" ADD CONSTRAINT "lesson_analytics_lesson_id_lessons_id_fk" FOREIGN KEY ("lesson_id") REFERENCES "public"."lessons"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lessons" ADD CONSTRAINT "lessons_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "marketing_metrics" ADD CONSTRAINT "marketing_metrics_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ndr_events" ADD CONSTRAINT "ndr_events_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ndr_events" ADD CONSTRAINT "ndr_events_shipment_id_shipments_id_fk" FOREIGN KEY ("shipment_id") REFERENCES "public"."shipments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ndr_events" ADD CONSTRAINT "ndr_events_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ndr_events" ADD CONSTRAINT "ndr_events_action_by_users_id_fk" FOREIGN KEY ("action_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_assignments" ADD CONSTRAINT "order_assignments_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_assignments" ADD CONSTRAINT "order_assignments_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_assignments" ADD CONSTRAINT "order_assignments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_assignments" ADD CONSTRAINT "order_assignments_assigned_by_users_id_fk" FOREIGN KEY ("assigned_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_status_history" ADD CONSTRAINT "order_status_history_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_status_history" ADD CONSTRAINT "order_status_history_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_status_history" ADD CONSTRAINT "order_status_history_changed_by_users_id_fk" FOREIGN KEY ("changed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_confirmed_by_users_id_fk" FOREIGN KEY ("confirmed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_cancelled_by_users_id_fk" FOREIGN KEY ("cancelled_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_assigned_to_users_id_fk" FOREIGN KEY ("assigned_to") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_ledger" ADD CONSTRAINT "payroll_ledger_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_ledger" ADD CONSTRAINT "payroll_ledger_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pg_settlements" ADD CONSTRAINT "pg_settlements_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pg_settlements" ADD CONSTRAINT "pg_settlements_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resources" ADD CONSTRAINT "resources_lesson_id_lessons_id_fk" FOREIGN KEY ("lesson_id") REFERENCES "public"."lessons"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resources" ADD CONSTRAINT "resources_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shipments" ADD CONSTRAINT "shipments_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shipments" ADD CONSTRAINT "shipments_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shopify_sync_logs" ADD CONSTRAINT "shopify_sync_logs_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shopify_sync_logs" ADD CONSTRAINT "shopify_sync_logs_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stores" ADD CONSTRAINT "stores_connected_by_users_id_fk" FOREIGN KEY ("connected_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_messages" ADD CONSTRAINT "team_messages_from_user_id_users_id_fk" FOREIGN KEY ("from_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_messages" ADD CONSTRAINT "team_messages_to_user_id_users_id_fk" FOREIGN KEY ("to_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_lesson_progress" ADD CONSTRAINT "user_lesson_progress_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_lesson_progress" ADD CONSTRAINT "user_lesson_progress_lesson_id_lessons_id_fk" FOREIGN KEY ("lesson_id") REFERENCES "public"."lessons"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_onboarding_progress" ADD CONSTRAINT "user_onboarding_progress_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_onboarding_progress" ADD CONSTRAINT "user_onboarding_progress_checklist_id_onboarding_checklists_id_fk" FOREIGN KEY ("checklist_id") REFERENCES "public"."onboarding_checklists"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_onboarding_progress" ADD CONSTRAINT "user_onboarding_progress_signed_off_by_users_id_fk" FOREIGN KEY ("signed_off_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_stores" ADD CONSTRAINT "user_stores_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_stores" ADD CONSTRAINT "user_stores_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_stores" ADD CONSTRAINT "user_stores_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webhook_logs" ADD CONSTRAINT "webhook_logs_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "pg_settlements_status_idx" ON "pg_settlements" USING btree ("store_id","status");--> statement-breakpoint
CREATE INDEX "pg_settlements_settled_at_idx" ON "pg_settlements" USING btree ("store_id","settled_at");--> statement-breakpoint
CREATE INDEX "pg_settlements_order_id_idx" ON "pg_settlements" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "pg_settlements_payment_id_idx" ON "pg_settlements" USING btree ("pg_name","pg_payment_id");--> statement-breakpoint
CREATE INDEX "IDX_session_expire" ON "session" USING btree ("expire");