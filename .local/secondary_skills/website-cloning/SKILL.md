---
name: website-cloning
description: Clone or recreate a website's design and functionality. Covers visual scraping, functional app building, image handling, mobile support, and validation.
---

# Website Cloning Skill

Build a faithful recreation of an existing website — either as a static visual clone or a full-stack functional app inspired by the target's design.

## Legitimate Use Policy

This skill is for learning, prototyping, and building original products inspired by existing designs. Do NOT use it to:

- Impersonate another brand or business
- Copy proprietary content, trademarks, or copyrighted material
- Violate terms of service of the target site
- Deceive users into thinking they are on the original site

Always replace logos, brand names, and proprietary content with original alternatives.

## Functional App vs Visual Clone — Decision Tree

Before scraping anything, determine what the user actually wants. Most users saying "build something like X" want a **functional app**, not a pixel-perfect static clone.

### Choose "Functional App" when the user

- Says "build something like [site]", "inspired by [site]", or "similar to [site]"
- Wants backend functionality (database, API, user accounts, CRUD operations)
- Needs the app to work with real data
- Mentions specific features (e.g., "like Vinted but for books")

**Approach:** Use the target site as design inspiration only. Scrape the homepage for layout/color/typography reference, then build a full-stack app using the project's existing framework (React, Vite, Express, etc.). Do NOT build a static HTML clone.

### Choose "Visual Clone" when the user

- Says "clone this page", "replicate this design", "copy this layout"
- Wants a single static page or landing page
- Is studying CSS/layout techniques
- Needs a quick prototype with no backend

**Approach:** Follow the full 5-phase scraping process below.

### When in doubt

Ask the user: "Would you like a working app inspired by that site's design, or a visual replica of the page layout?"

---

## Phase 1: Environment Setup

### Primary Method — Node.js Playwright (Recommended)

Node.js is always available in the Replit workspace. Use this as the default.

```bash
# Install Playwright as a dev dependency
pnpm add -D playwright

# Find the correct Chromium binary in Nix store
CHROMIUM_PATH=$(ls /nix/store/*/bin/chromium 2>/dev/null | head -1)
echo "Chromium at: $CHROMIUM_PATH"
```

**Node.js scraping script template:**

```javascript
const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || '/nix/store/.../bin/chromium',
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
  });

  const page = await browser.newPage();
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.setExtraHTTPHeaders({
    'User-Agent': 'Mozilla/5.0 ...',
  });

  await page.goto('<https://target-site.com>', {
    waitUntil: 'networkidle',
    timeout: 30000,
  });

  await page.screenshot({ path: 'reference-desktop.png', fullPage: true });

  const styles = await page.evaluate(() => {
    const computed = getComputedStyle(document.body);
    return {
      fontFamily: computed.fontFamily,
      backgroundColor: computed.backgroundColor,
      color: computed.color,
    };
  });

  const html = await page.content();
  require('fs').writeFileSync('reference.html', html);
  await browser.close();
})();
```

### Fallback Method — Python Playwright

Only use this if Node.js Playwright fails.

```bash
pip install playwright
playwright install chromium
```

### Chromium Binary Discovery

If the basic command returns nothing:

```bash
ls -la /nix/store/*ungoogled-chromium*/bin/chromium 2>/dev/null | tail -1

# Or broader search
find /nix/store -name "chromium" -type f -executable 2>/dev/null | sort | tail -1
```

---

## Phase 2: Reconnaissance

### Desktop Recon (1440px)

1. Navigate to the target URL at 1440×900 viewport
2. Take a full-page screenshot → reference-desktop.png
3. Extract DOM structure: header/nav, hero, content grids, footer
4. Extract computed styles: colors, fonts, spacing, border-radius, shadows

### Mobile Recon (375px)

1. Resize viewport to 375×812
2. Take screenshot → reference-mobile.png
3. Note: hamburger menu, stacked cards, hidden elements, touch targets (44×44px min), font adjustments

### Tablet Recon (768px) — Optional

1. Resize to 768×1024
2. Take screenshot → reference-tablet.png
3. Note intermediate layout changes

---

## Phase 3: Image Handling

### Default — Download Key Images Locally

Always download essential images to public/images/ so they don't break when CDN URLs expire.

### When CDN URLs Are Acceptable

- Large sets of product images (20+)
- Reliable CDNs (Unsplash, Pexels, Cloudinary)
- Temporary prototypes

Reliable free image sources:

- Unsplash: <https://images.unsplash.com/photo-{id}?w={width}&h={height}&fit=crop>
- Pexels: <https://images.pexels.com/photos/{id}/pexels-photo-{id}.jpeg>
- DiceBear (avatars): <https://api.dicebear.com/7.x/avataaars/svg?seed={name}>
- Placeholder: <https://placehold.co/{width}x{height}/{bg}/{text}>

### Image Replacement Strategy

1. Brand logos → Custom SVG or text-based logo
2. Hero images → Unsplash photos matching the category
3. Product photos → Unsplash with relevant search terms
4. User avatars → DiceBear generated avatars
5. Icons → Lucide React or similar open-source library

---

## Phase 4: Build the Clone

### Structure

src/
  components/ (Header, Hero, CategoryNav, ProductCard, ProductGrid, Footer)
  pages/ (Home, Browse, Detail, Sell)
  styles/ (variables.css)

### CSS Variables from Extracted Tokens

Use :root variables for colors, typography, spacing, and borders.

### Responsive Breakpoints

Always implement: 768px (tablet), 1024px (desktop), 1440px (large desktop)

---

## Phase 5: Validation

### Automated Screenshot Comparison

Take clone screenshots at 1440px, 768px, and 375px and compare against references.

### Manual Checklist

**Layout:** Header height, nav positions, hero proportions, grid columns, footer, container max-width
**Typography:** Font family/weight, body text size, text colors
**Spacing:** Card gaps, section padding, margins
**Mobile:** Navigation works, cards stack, touch targets 44×44px, no horizontal scroll
**Functionality (functional clones):** Routes work, search/filter works, forms submit, data loads from API

---

## Troubleshooting — Common Scraping Failures

### Bot Detection / Cloudflare

- Set realistic User-Agent
- Add random 2-5s delays
- Try Wayback Machine as fallback
- Screenshot manually as last resort

### Cookie Consent Banners

- Auto-click common accept/agree buttons
- Wait 1s for banner to disappear

### Client-Side Rendering Timeouts

- Use waitUntil: 'networkidle'
- Wait for specific content selectors
- Increase timeout to 60s
- Extract data from **NEXT_DATA** or **INITIAL_STATE** script tags

### Playwright Launch Failures

- Verify Chromium path exists
- Add --disable-gpu flag
- Fall back to raw fetch() for static HTML

---

## Ethical Scraping — Rate Limiting and robots.txt

### Check robots.txt First

- Fetch /robots.txt before scraping
- Respect Disallow directives

### Rate Limiting

- 2-5 second delays between page loads
- Max 10 pages per site
- Descriptive User-Agent
- Stop on 429 responses

### Scope Limits

You only need:

- 1 homepage screenshot + HTML
- 1-2 inner page screenshots
- Extracted CSS variables and layout structure

Do NOT scrape every page or download every image.
