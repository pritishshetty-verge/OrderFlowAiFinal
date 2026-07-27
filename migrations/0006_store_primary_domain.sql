-- Add stores.primary_domain so inbound abandoned-cart webhooks can be routed
-- to the correct store by matching the checkout URL's host, instead of always
-- stamping the oldest store (which mislabeled every glowandme.in cart as OLB).
ALTER TABLE stores ADD COLUMN IF NOT EXISTS primary_domain text;

-- Backfill the known live store's storefront domain.
-- Glow & Me = r7rsqd-z8.myshopify.com → glowandme.in
UPDATE stores
  SET primary_domain = 'glowandme.in'
  WHERE store_url = 'r7rsqd-z8.myshopify.com' AND primary_domain IS NULL;
