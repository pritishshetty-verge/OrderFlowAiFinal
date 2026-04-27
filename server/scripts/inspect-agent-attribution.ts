import "dotenv/config";
import { db } from "../db";
import { sql } from "drizzle-orm";

// ─────────────────────────────────────────────────────────────────────
// Second-pass discovery: if of:* tags are bare (no agent suffix),
// where — if anywhere — is agent attribution encoded? Read-only.
//
// We check:
//   1. Distinct tag vocabulary    — maybe agent names live in a
//                                   different prefix (cx:, agent:, etc.)
//   2. note_attributes keys        — Shopify's structured metadata slot
//   3. Distinct tag shapes where   — some tags have 3+ colons
//      the colon count > 1
//   4. Any tags that look like a   — heuristic: single-word tags that
//      plausible human first name   aren't obviously a tag word
// ─────────────────────────────────────────────────────────────────────

async function main() {
  // ── 1. Distinct tag vocabulary ──────────────────────────────────
  // unnest the comma-split tag list and count unique values.
  const tagVocab: any = await db.execute(sql`
    WITH t AS (
      SELECT
        trim(tag_value) AS tag
      FROM orders o,
           LATERAL unnest(string_to_array(COALESCE(o.raw_shopify_data->>'tags', ''), ',')) AS tag_value
      WHERE o.raw_shopify_data->>'tags' IS NOT NULL
        AND test_order = false
    )
    SELECT tag, COUNT(*)::int4 AS n
    FROM t
    WHERE tag <> ''
    GROUP BY tag
    ORDER BY n DESC
    LIMIT 60
  `);
  const vocab: any[] = (tagVocab as any).rows ?? tagVocab ?? [];

  console.log(`\n── Top 60 tags (by frequency) ──`);
  for (const r of vocab) {
    console.log(`  ${String(r.n).padStart(6)}  ${r.tag}`);
  }

  // ── 2. Note-attribute keys ───────────────────────────────────────
  // Flatten note_attributes arrays and count key frequencies.
  const noteAttrKeys: any = await db.execute(sql`
    SELECT
      attr->>'name' AS key,
      COUNT(*)::int4 AS n
    FROM orders o,
         LATERAL jsonb_array_elements(
           COALESCE(o.raw_shopify_data->'note_attributes', '[]'::jsonb)
         ) AS attr
    WHERE o.raw_shopify_data IS NOT NULL
      AND test_order = false
    GROUP BY key
    ORDER BY n DESC
    LIMIT 30
  `);
  const attrRows: any[] = (noteAttrKeys as any).rows ?? noteAttrKeys ?? [];
  console.log(`\n── note_attributes key frequency ──`);
  if (attrRows.length === 0) {
    console.log(`  (no note_attributes on any order — feature unused)`);
  } else {
    for (const r of attrRows) {
      console.log(`  ${String(r.n).padStart(6)}  ${r.key}`);
    }
  }

  // ── 3. Tags with multiple colons ────────────────────────────────
  // If ANY tag has 2+ colons it probably encodes a namespace:action:agent.
  const multiColon: any = await db.execute(sql`
    WITH t AS (
      SELECT trim(tag_value) AS tag
      FROM orders o,
           LATERAL unnest(string_to_array(COALESCE(o.raw_shopify_data->>'tags', ''), ',')) AS tag_value
      WHERE o.raw_shopify_data->>'tags' IS NOT NULL
        AND test_order = false
    )
    SELECT tag, COUNT(*)::int4 AS n
    FROM t
    WHERE tag LIKE '%:%:%'
    GROUP BY tag
    ORDER BY n DESC
    LIMIT 30
  `);
  const multiRows: any[] = (multiColon as any).rows ?? multiColon ?? [];
  console.log(`\n── Tags containing 2+ colons ──`);
  if (multiRows.length === 0) {
    console.log(`  (none — no tag uses multi-segment namespacing)`);
  } else {
    for (const r of multiRows) {
      console.log(`  ${String(r.n).padStart(6)}  ${r.tag}`);
    }
  }

  // ── 4. Order-level metadata fields ──────────────────────────────
  // Check a few Shopify fields that sometimes carry operator info.
  const metaCheck: any = await db.execute(sql`
    SELECT
      COUNT(*) FILTER (WHERE raw_shopify_data ? 'user_id'  AND raw_shopify_data->>'user_id' IS NOT NULL)::int4 AS has_user_id,
      COUNT(*) FILTER (WHERE raw_shopify_data ? 'staff_id' AND raw_shopify_data->>'staff_id' IS NOT NULL)::int4 AS has_staff_id,
      COUNT(*) FILTER (WHERE raw_shopify_data ? 'app_id'   AND raw_shopify_data->>'app_id' IS NOT NULL)::int4 AS has_app_id,
      COUNT(*) FILTER (WHERE raw_shopify_data ? 'source_name')::int4 AS has_source_name,
      COUNT(*)::int4 AS total
    FROM orders
    WHERE raw_shopify_data IS NOT NULL
      AND test_order = false
  `);
  const m = ((metaCheck as any).rows ?? metaCheck)[0];
  console.log(`\n── Shopify order-level attribution fields ──`);
  console.log(`  total non-test orders:       ${m.total}`);
  console.log(`  with user_id present:        ${m.has_user_id}   (Shopify staff who created the order)`);
  console.log(`  with staff_id present:       ${m.has_staff_id}`);
  console.log(`  with app_id present:         ${m.has_app_id}   (app that made the edit)`);
  console.log(`  with source_name present:    ${m.has_source_name}`);

  // If user_id is widely populated, also show the distinct set of
  // values — these are Shopify staff user IDs that could plausibly
  // be agents (though they're Shopify-admin users, not our CX team).
  const userIdValues: any = await db.execute(sql`
    SELECT raw_shopify_data->>'user_id' AS user_id, COUNT(*)::int4 AS n
    FROM orders
    WHERE raw_shopify_data->>'user_id' IS NOT NULL
      AND test_order = false
    GROUP BY 1
    ORDER BY n DESC
    LIMIT 15
  `);
  const idRows: any[] = (userIdValues as any).rows ?? userIdValues ?? [];
  if (idRows.length > 0) {
    console.log(`\n── Top user_id values in raw_shopify_data ──`);
    for (const r of idRows) {
      console.log(`  ${String(r.n).padStart(6)}  user_id=${r.user_id}`);
    }
  }

  console.log(`\n[inspect-agent-attribution] done.`);
  process.exit(0);
}

main().catch((err) => {
  console.error("[inspect-agent-attribution] failed:", err);
  process.exit(1);
});
