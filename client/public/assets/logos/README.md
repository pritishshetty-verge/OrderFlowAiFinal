# Integration Logos

This folder is the home for locally-hosted integration logos referenced
by `client/src/pages/integrations.tsx`. We dropped external URLs because
several brand sites use hotlink protection.

Vite serves `client/public/*` at the site root, so a file dropped here
at `client/public/assets/logos/foo.png` is reachable from the browser as
`/assets/logos/foo.png` — no rebuild required, just refresh.

## Expected files (square PNGs preferred, ~256x256 or larger)

| Integration | Filename             | Notes                              |
| ----------- | -------------------- | ---------------------------------- |
| Meta Ads    | `meta-ads.png`       | Blue infinity / Meta corporate logo |
| BiteSpeed   | `bitespeed.png`      | Blue square with stylized B        |
| Google Ads  | `google-ads.png`     | Multicolour "Ads" mark             |
| Delhivery   | `delhivery.png`      | Black D with red corner            |
| Shiprocket  | `shiprocket.png`     | Purple play-triangle mark          |

If a file is missing the IntegrationCard renders a coloured letter
avatar (the integration's first letter on a tinted background) — the
page won't break, it just looks plainer until the asset lands.

## Adding a new integration

1. Drop a square PNG/SVG here using the convention above.
2. In `client/src/pages/integrations.tsx`, add an entry to the
   `INTEGRATIONS` array with `iconImg: "/assets/logos/<filename>"`.
