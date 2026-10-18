-- Reshipment log: NDR-team-triggered duplicate orders in Shopify.
-- Idempotent — safe to re-run.

CREATE TABLE IF NOT EXISTS reshipment_logs (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id varchar NOT NULL REFERENCES stores(id) ON DELETE CASCADE,

  -- Original order — the one that failed and needs a reshipment.
  -- We keep the OrderFlow row id (FK) AND the Shopify id/name so the
  -- dashboard can render the "#1234" hyperlink without a join.
  original_order_id varchar NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  original_shopify_order_id text NOT NULL,
  original_shopify_order_name text NOT NULL,     -- e.g. "#1234"

  -- New (duplicate) order — Shopify create is async on our side, so
  -- these are nullable until the API round-trip succeeds. Once the
  -- fulfillment webhook fires we know it landed.
  new_shopify_order_id text,
  new_shopify_order_name text,                    -- e.g. "#1234-R"

  -- Snapshot the customer at the time of reshipment. The address is
  -- JSONB because the operator may edit phone/address in the modal
  -- (updated pincode etc.) — we send THAT payload to Shopify.
  customer_name text NOT NULL,
  customer_phone text NOT NULL,
  shipping_address jsonb NOT NULL,

  reason text NOT NULL,        -- courier_error | customer_unavailable | fake_delivery | address_issue | product_damaged | other
  urgency_type text NOT NULL,  -- instant | scheduled
  scheduled_date date,
  internal_notes text,

  payment_type text NOT NULL,  -- cod | prepaid (inherited from original)

  -- Live courier state (updated by Shopify + Delhivery webhooks).
  tracking_awb text,
  courier_name text,
  courier_status text NOT NULL DEFAULT 'pending',  -- pending | in_transit | out_for_delivery | ndr | delivered | rto

  created_by varchar REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS reshipment_logs_store_created_idx
  ON reshipment_logs (store_id, created_at DESC);
CREATE INDEX IF NOT EXISTS reshipment_logs_original_idx
  ON reshipment_logs (store_id, original_order_id);
CREATE INDEX IF NOT EXISTS reshipment_logs_new_shopify_idx
  ON reshipment_logs (store_id, new_shopify_order_id);
CREATE INDEX IF NOT EXISTS reshipment_logs_awb_idx
  ON reshipment_logs (tracking_awb);
CREATE INDEX IF NOT EXISTS reshipment_logs_status_idx
  ON reshipment_logs (store_id, courier_status);

-- Guardrail: one LIVE reshipment per original order per store.
-- Delivered/RTO/failed rows don't count, so an admin can re-attempt.
CREATE UNIQUE INDEX IF NOT EXISTS reshipment_logs_live_original_uniq
  ON reshipment_logs (store_id, original_order_id)
  WHERE courier_status IN ('pending', 'in_transit', 'out_for_delivery', 'ndr');
