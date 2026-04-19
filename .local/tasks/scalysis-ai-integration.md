# Scalysis AI Calling Integration

## What & Why

Scalysis is an AI voice agent that auto-confirms Shopify orders and marks them with the tag `"Scalysis: Order Confirmed ✅"`. The app needs to recognise this tag on incoming order-update webhooks, reflect the confirmation in the database without attributing it to any human agent, and surface a new "AI Agent Confirmed" metric on the dashboard so the team can track AI performance alongside human performance.

## Done looks like

- When an `orders/update` webhook arrives containing the tag `"Scalysis: Order Confirmed ✅"`, the order's `callStatus` is automatically set to `"Confirmed"`, `confirmedBy` is left `null` (no human agent), `confirmedNotes` is set to `"Auto-confirmed by Scalysis AI"`, and an order-status-history entry is created with the same note.
- The `GET /api/dashboard/metrics` response includes a new `aiConfirmedOrders` field: the count of orders auto-confirmed by Scalysis in the selected date range (identified via order_status_history entries with note `"Auto-confirmed by Scalysis AI"`).
- The dashboard shows a new metric card labelled "AI Agent Confirmed" displaying the `aiConfirmedOrders` value, with a distinct Bot/Sparkles icon to differentiate it from human-agent cards.
- Existing human-confirmed metrics and attribution logic are completely unaffected.

## Out of scope

- Blocking human agents from manually calling a Scalysis-confirmed order (UI-level guard is not requested).
- Any schema migration or new DB columns — all tracking uses existing `callStatus`, `confirmedBy`, `confirmedNotes`, and `order_status_history.note` fields.
- Changes to the Shopify sync-back (outbound) path — this is inbound-only.

## Tasks

1. **Webhook tag interception** — In `handleOrderUpdated`, after parsing the tags array, check if `"Scalysis: Order Confirmed ✅"` is present. If so, set `callStatus: "Confirmed"`, `confirmedAt: now`, `confirmedBy: null`, and `confirmedNotes: "Auto-confirmed by Scalysis AI"` on the order update payload, and append an order-status-history entry with the same note and `changedBy: null`. Only apply this logic when the order's current `callStatus` is not already `"Confirmed"`, to avoid overwriting data on repeated webhook deliveries.

2. **Dashboard metric — `aiConfirmedOrders`** — In `getDashboardMetrics` (storage interface + implementation), add a new query that counts distinct orders from `order_status_history` where `note = 'Auto-confirmed by Scalysis AI'` and `changedBy IS NULL`, filtered by the existing `startDate`/`endDate` parameters. Add `aiConfirmedOrders: number` to the return type of both the `IStorage` interface and the concrete implementation.

3. **API route pass-through** — Confirm the `GET /api/dashboard/metrics` route forwards the new `aiConfirmedOrders` field from storage to the JSON response (no filtering of unknown keys).

4. **Frontend metric card** — Add `aiConfirmedOrders` to the `DashboardMetrics` interface in `analytics.tsx` and to the `stats` object passed to `DashboardStats`. Add `aiConfirmedOrders` to `DashboardStatsProps` in `dashboard-stats.tsx` and render a new `StatCard` with a `Bot` or `Sparkles` icon (from lucide-react) in its own row or appended to the second row of cards. Title: "AI Agent Confirmed". Description: "Auto-confirmed by Scalysis".

## Relevant files

- `server/webhooks.ts:250-356`
- `server/storage.ts:416-424,2558-2708`
- `server/routes.ts`
- `client/src/pages/analytics.tsx:31-39,108-116,148-149`
- `client/src/components/dashboard-stats.tsx`
