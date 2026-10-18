import "dotenv/config";
import { storage } from "../storage";
const GLOW = "3f550942-9bb4-4ec1-b8ed-3a11803acd3e";
const OLB = "484da382-137f-445e-b8b1-064af45a113a";
(async () => {
  const cases: [string, string | null][] = [
    ["https://glowandme.in/?cart-resume-id=6a38d516c0f1", GLOW],
    ["https://www.glowandme.in/checkout", GLOW],
    ["https://r7rsqd-z8.myshopify.com/cart", GLOW],
    ["https://some-other-shop.in/cart", OLB],   // no match → falls back to primary (OLB)
  ];
  for (const [url, want] of cases) {
    const got = await storage.getStoreIdForCheckoutUrl(url);
    const label = got === GLOW ? "Glow & Me" : got === OLB ? "OLB(fallback)" : got;
    const ok = got === want ? "✅" : "❌";
    console.log(`${ok} ${url.padEnd(48)} → ${label}`);
  }
})().then(() => process.exit(0)).catch((e) => { console.error("FAIL:", e?.message ?? e); process.exit(1); });
