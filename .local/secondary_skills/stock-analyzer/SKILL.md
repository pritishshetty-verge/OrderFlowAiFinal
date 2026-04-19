---
name: stock-analyzer
description: Analyze stocks and companies with fundamental analysis, technical indicators, and risk assessment. Primary output is a professional PDF research report.
---

# Stock & Investment Analyzer

Analyze stocks, companies, and investment opportunities using financial market data. Provide company profiles, technical analysis, fundamental analysis, and portfolio insights.

**Primary deliverable: A professional PDF research report.** The Excel model and interactive web app are optional extras — only build them if the user explicitly requests them.

## When to Use

- User wants to analyze a specific stock or company
- User asks about financial metrics, earnings, or valuations
- User wants to compare investment options
- User needs portfolio analysis or allocation advice
- User asks about market trends or sector performance

## When NOT to Use

- Tax-specific questions (use tax-reviewer skill)
- Personal budgeting (use budget-planner skill)
- Insurance coverage (use insurance-optimizer skill)

## IMPORTANT: Disclaimer & Compliance

**All output from this skill is strictly informational. It does not constitute investment advice, a recommendation or solicitation to buy or sell any security, or a substitute for professional financial counsel.**

Every report, PDF, Excel model, or web dashboard produced by this skill must:

- **State clearly on the cover page** (or first visible section): "This report is for informational purposes only and does not constitute investment advice. It is not a recommendation to buy, sell, or hold any security."
- **Include a full disclaimer on the final page** (see "Limitations & Disclaimer" section below for the required text).
- **Never use imperative language** that implies a directive — say "may outperform" or "could be worth investigating," not "you should buy" or "add this to your portfolio."
- **Always recommend consulting a licensed financial advisor** before making any investment decision.

This applies to all outputs regardless of whether an investor profile has been collected.

## Optional Investor Profile

Before starting any analysis, **offer** the user the option to share their investment profile. This step is entirely optional — if the user declines or wants to skip it, proceed immediately with a general-purpose analysis using the default assumptions below.

**How to offer it:** At the start of the analysis, ask something like: "I can tailor this analysis to your investment style if you'd like to answer a few quick questions. Otherwise, I'll provide a general market perspective. Which do you prefer?"

### Profiling Dimensions (ask all 5 if the user opts in)

### Default Assumptions (when user skips profiling)

When the user declines profiling, use these neutral defaults and **do not assume** anything about their personal situation:

- **Risk tolerance:** Moderate
- **Time horizon:** Medium-term (1-5 years)
- **Allocation:** Not assumed — present analysis without allocation recommendations
- **Income needs:** Not assumed — cover both growth and income angles
- **Experience level:** Intermediate — use clear language but don't oversimplify

### How Profiling Shapes the Report

When profile data is available, adjust the report in these ways:

- **Cover page:** Add an "Investor Profile" summary box showing the user's stated risk tolerance, time horizon, and income preference
- **Stock/sector picks:** Add a suitability tag to each recommendation (e.g., "Suitable for: moderate risk, 3-5yr horizon" or "Caution: high volatility — may not suit conservative investors")
- **Allocation section:** Add a "Suggested Allocation" section at the end of the report, tailored to their risk/timeline. Frame it as illustrative, not prescriptive (e.g., "A moderate-risk investor with a 3-5 year horizon might consider an allocation along these lines...")
- **Language calibration:** For beginners, use simpler explanations and fewer technical terms. For advanced investors, include more granular data and nuanced analysis.
- **Picks that don't fit:** Still include all relevant picks, but flag any that conflict with the user's stated profile (e.g., "Note: This is a high-volatility pick that may not align with your conservative risk preference")

When profile data is NOT available, omit the Investor Profile box, omit the Suggested Allocation section, and present all picks without suitability tags. The core analysis remains identical.

## Data Sources (Use These — Don't Guess)

**Python libs (run directly, no API key):**

`import` yfinance `as` yf

t =` yf.Ticker("AAPL")

t.info              # P/E, market cap, beta, 52w range, margins

t.financials        # income statement (4yr)

t.balance_sheet     # debt, cash, equity

t.cashflow          # FCF, capex

t.history(period="1y")  # OHLCV for technicals

t.institutional_holders # 13F ownership

**Sector screening:** Use yfinance sector ETFs (XLE, XLK, XLF, XLV, XLI, XLP, XLU, XLRE, XLB, XLC, XLY) for reliable sector-level data. These are more stable than third-party screener libraries. For individual stock screening, pull yfinance data for each ticker directly.

**Note on ****finvizfinance****:** This library frequently breaks due to website changes. Avoid relying on it. Use yfinance sector ETFs and direct ticker lookups instead.

**Primary filings:** Start from the EDGAR filing index: webFetch("<https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK={ticker}&type=10-K>"). This returns a list of filings — find the most recent 10-K and webFetch its "Documents" link to reach the actual filing. Read Item 1A (Risk Factors) and Item 7 (MD&A) — this is where management admits problems.

**Insider activity:** webFetch("<http://openinsider.com/screener?s={ticker}>") — look for **cluster buys** (multiple execs buying same week) and **P-code** open-market purchases (insider paid cash at market price — strongest signal). Ignore option exercises (M-code) and 10b5-1 scheduled sales.

**Short interest:** webSearch "{ticker} short interest fintel" — >20% of float = crowded short, squeeze risk either direction.

### Data Source Fallbacks

yfinance occasionally returns empty data, tickers change, or rate limits kick in. Use this fallback hierarchy:

- **Primary:** yfinance — try up to 2 retries with a short delay
- **Fallback:** Web search for the specific metric (e.g., webSearch("[ticker] market cap 2026"))
- **Last resort:** Flag the metric as "data unavailable" — never fabricate numbers

## Research First — Mandatory Before Any Output

**Never show financials, tables, or a report to the user without thoroughly researching first.** Before generating the PDF, you must:

- **Load the ****deep-research**** skill** for comprehensive web research. This is not optional — every stock analysis must use deep research to gather real data before producing any deliverable.
- **Pull actual financials** from yfinance AND cross-reference with SEC EDGAR filings (10-K, 10-Q). Do not rely on a single source.
- **Search for every company mentioned** — if the user's request involves multiple companies or peers, pull financials on ALL of them, not just the primary ticker.
- **Bias towards tables and numbers from actual public filings.** Every financial figure in the report must be traceable to a real source (SEC filing, earnings release, or yfinance data pull). Do not estimate or round when real numbers are available.

If you cannot verify a financial figure from at least one real source, flag it explicitly as unverified. Never present guessed or hallucinated numbers as fact.

### Scoping Deep Research

For a **single-stock analysis**, launch 2-3 parallel research agents: one for fundamentals/financials, one for industry/competitive landscape, one for recent news/catalysts.

For a **multi-sector or thematic analysis**, launch 4-6 parallel research agents organized by theme (e.g., macro environment, sector rotation, geopolitics, specific sector deep-dives). More than 6 agents rarely adds value and wastes time.

## Methodology

### Step 1: Pull the Data (Python)

Run yfinance to get fundamentals + 1yr price history. Compute 50/200 SMA, RSI(14), and current price vs 52w high. Takes 10 lines of pandas.

### Step 2: Fundamental Analysis

**Valuation (compare to sector median, not S&P):**

- P/E — meaningless alone; flag if >2x sector median
- PEG — <1.0 = growth at reasonable price; >2.0 = priced for perfection
- EV/EBITDA — better than P/E for capital-intensive or leveraged cos
- P/S — only metric for unprofitable growth; >20x = needs hypergrowth to justify
- FCF yield (FCF/market cap) — >5% = genuinely cheap; negative = burning cash

**Quality red lines (practitioner heuristics):**

- Revenue growing but FCF shrinking -> earnings quality problem, dig into receivables
- Debt/EBITDA >4x -> one bad year from covenant breach
- Gross margin compressing 3+ quarters -> losing pricing power
- Stock-based comp >15% of revenue -> dilution machine (common in SaaS)
- Goodwill >50% of assets -> acquisition-heavy, writedown risk

### Step 3: Technical Context (Not Prediction)

Compute in pandas — don't just describe:

- Price vs 50/200 SMA: below both = downtrend, don't catch knives
- Golden cross (50 crosses above 200) = trend confirmation, not entry signal
- RSI(14): >70 overbought / <30 oversold — only useful at extremes + divergence
- Volume: moves on 2x+ avg volume are real; low-volume moves fade
- % off 52w high: >30% drawdown in an uptrending market = something broke

### Step 4: The Retail Edge — Signals Institutions Ignore

- **Insider cluster buys** (OpenInsider): 3+ insiders open-market buying within 2 weeks is the single highest-conviction public signal. Research shows insider buys outperform; sells mean nothing (taxes/divorces/yachts).
- **Buying the dip**: insider P-code purchase after >10% drop = management disagrees with the market
- **Short squeeze setup**: short interest >20% + days-to-cover >5 + any positive catalyst
- **Unusual options**: webSearch "{ticker} unusual options activity" — large OTM call sweeps before earnings sometimes leak info

### Step 5: Comparative Table

Build a pandas DataFrame with peers side-by-side: P/E, PEG, rev growth, gross margin, FCF yield, debt/EBITDA. The outlier in either direction is your thesis. **Pull yfinance data for every peer company** — do not leave cells blank or use estimates when real data is available. Every company in the comparison must have actual financials pulled and verified.

## Step 6: Web Research — Find Existing Analyst Reports and News

**Use web search aggressively via the ****deep-research**** skill.** Before writing the report, gather real external research to cite:

webSearch("[ticker] analyst report 2026")

webSearch("[ticker] earnings analysis site:seekingalpha.com")

webSearch("[ticker] bull case bear case site:seekingalpha.com OR site:fool.com")

webSearch("[company] investor presentation 2026 filetype:pdf")

webSearch("[ticker] price target consensus")

webSearch("[ticker] industry outlook [sector]")

webSearch("[company] competitive landscape")

webSearch("[ticker] short interest thesis")

**Source hierarchy (cite all of these in the report):**

Use webFetch to pull actual content from SeekingAlpha articles, earnings transcripts, and investor presentations. Extract specific data points, quotes, and estimates to cite in the report.

## Build Order — PDF First (Primary), Then Optional Extras

The PDF research report is the primary deliverable. Focus effort here.

### Step 1: Generate charts (Python + matplotlib)

Generate all charts first — these will be embedded in the PDF. Save as PNG at 150+ DPI to reports/charts/. Generate **at least 4 charts**: price history with SMAs, revenue/margin trends, peer valuation comparison, and one more relevant to the thesis.

`import` matplotlib.pyplot `as` plt

`import` yfinance `as` yf

df =` yf.Ticker("AAPL").history(period="1y")

fig, ax =` plt.subplots(figsize=(10, 5))

ax.`plot(df.index, df['Close'], label='Price', color='#1a1a2e')

ax.`plot(df.index, df['Close'].rolling(50).mean(), label='50 SMA', color='#e94560', linestyle='--')

ax.`plot(df.index, df['Close'].rolling(200).mean(), label='200 SMA', color='#0f3460', linestyle='--')

ax.set_title("AAPL - 1 Year Price History")

ax.legend()

ax.`grid(alpha=0.3)

fig.savefig("reports/charts/price_chart.png", dpi=150, bbox_inches='tight')

### Step 2: Generate the PDF research report (PRIMARY DELIVERABLE)

Write a Python generation script (reports/generate_pdf.py) using **fpdf2** to produce a polished, multi-page equity research PDF. **Do not output a markdown summary as a substitute. Do not skip the PDF.**

**Why fpdf2, not jsPDF:** Python is already required for yfinance and matplotlib. fpdf2 installs instantly (pip install fpdf2), runs reliably, and handles image embedding natively. jsPDF (Node) has heavy dependencies, frequent install timeouts in constrained environments, and is designed for browser-side generation — not server-side report building.

Present the PDF to the user in chat immediately after generating it.

### Step 3 (OPTIONAL): Build the Excel model

Only build if the user requests it or the analysis involves complex financial modeling (DCF, scenario analysis) where an interactive spreadsheet adds genuine value.

Use openpyxl in Python to generate the .xlsx file:

`from` openpyxl `import` Workbook

`from` openpyxl.styles `import` Font, PatternFill, Alignment, numbers

wb = Workbook()

ws = wb.active

ws.title = "Summary"

ws.append(["Metric", "Value"])

ws.`append(["P/E", 25.3])

wb.save("reports/Stock_Analysis.xlsx")

Include: sector/stock performance data, peer comparison metrics, financial model sheets. Add conditional formatting for key thresholds (green/red for outperform/underperform).

### Step 4 (OPTIONAL): Build the web app

Only build if the user requests an interactive dashboard or web view. When building the web app:

- **Design it as a native web dashboard** — responsive, interactive charts (Recharts), scrollable sections. Do NOT make it a literal PDF replica with fixed-size page containers.
- Hardcode data in a centralized data file (src/data/report-data.ts) — no backend API needed for static analysis.
- Use the react-vite skill and generateFrontend() for scaffolding.

## PDF Report — Professional Research Report (Sell-Side Format)

The PDF should look like a sell-side initiation note from Goldman, Morgan Stanley, or JP Morgan. **This is the primary deliverable — invest the most effort here.**

### Report Structure

**Page 1 — Cover / Executive Summary:**

- **Disclaimer line** (required): "This report is for informational purposes only and does not constitute investment advice. It is not a recommendation to buy, sell, or hold any security."
- Company name, ticker, exchange, current price, market cap
- **Rating**: Buy / Hold / Sell with price target and upside/downside %
- **Investment thesis** in 3-4 bullet points (the "elevator pitch")
- Key metrics snapshot: P/E, EV/EBITDA, revenue growth, FCF yield
- A **1-year price chart** (generated via matplotlib, embedded as image)
- **Investor Profile box** (only if profile was collected): Show risk tolerance, time horizon, and income preference in a small summary box

**Pages 2-3 — Investment Thesis:**

- Bull case (with probability weighting if possible)
- Bear case (required — what kills this trade?)
- Key catalysts with expected timeline
- Competitive positioning / moat analysis

**Pages 3-4 — Financial Analysis:**

- Revenue breakdown by segment (with a **stacked bar chart**)
- Margin trends over 4+ quarters (with a **line chart**)
- FCF bridge / waterfall
- Balance sheet health (debt maturity, liquidity)
- Peer comparison table (pulled from yfinance for 3-5 peers)

**Page 5 — Valuation:**

- DCF model summary (show assumptions: WACC, terminal growth, revenue CAGR)
- Comparable company analysis table
- Historical valuation range (P/E or EV/EBITDA band chart)
- Price target derivation

**Page 6 — Technical Analysis:**

- Price chart with 50/200 SMA overlay (generated via matplotlib)
- Volume analysis
- Key support/resistance levels
- RSI chart

**Page 7 — Risks:**

- Ranked by probability x impact
- Regulatory, competitive, execution, macro risks
- Specific to this company, not generic boilerplate

**Final Page — Sources & Disclaimer:**

- Full citation list with dates for every external source referenced
- **Full disclaimer** (required — use the exact text from the "Limitations & Disclaimer" section below)
- If investor profile was collected, include a closing note: "This analysis was tailored to a [risk tolerance] risk profile with a [time horizon] time horizon. Your actual circumstances may differ. Consult a licensed financial advisor before making investment decisions."

### PDF Generation with fpdf2

Use **fpdf2** (Python) to generate the PDF. Install: pip install fpdf2.

```python
from fpdf import FPDF

class ResearchReport(FPDF):
    def header(self):
        self.set_font("Helvetica", "B", 9)
        self.cell(0, 10, "Equity Research Report", align="R")
        self.ln(5)
        self.set_draw_color(0, 51, 102)
        self.line(10, self.get_y(), 200, self.get_y())
        self.ln(5)

    def footer(self):
        self.set_y(-15)
        self.set_font("Helvetica", "I", 8)
        self.cell(0, 10, f"Page {self.page_no()}/{{nb}}", align="C")

pdf = ResearchReport()
pdf.alias_nb_pages()
pdf.set_auto_page_break(auto=True, margin=20)
pdf.add_page()

# Title
pdf.set_font("Helvetica", "B", 24)
pdf.cell(0, 15, "Company Analysis", ln=True)

# Embed chart
pdf.image("reports/charts/price_chart.png", x=10, w=190)
pdf.output("reports/Research_Report.pdf")
```

### Critical: Text Encoding for fpdf2

fpdf2 uses latin-1 encoding by default. **Special Unicode characters will cause errors or render as garbage.** Before writing any text to the PDF, sanitize it:

```python
def sanitize_text(text):
    replacements = {
        "\u2014": "-",    # em-dash
        "\u2013": "-",    # en-dash
        "\u2018": "'",    # left single quote
        "\u2019": "'",    # right single quote
        "\u201c": '"',    # left double quote
        "\u201d": '"',    # right double quote
        "\u2022": "*",    # bullet
        "\u2026": "...",  # ellipsis
        "\u00a0": " ",    # non-breaking space
        "\u2212": "-",    # minus sign
        "\u00b7": "*",    # middle dot
    }
    for char, replacement in replacements.items():
        text = text.replace(char, replacement)
    return text.encode("latin-1", errors="replace").decode("latin-1")
```

**Apply ****sanitize_text()**** to every string before passing it to ****pdf.cell()****, ****pdf.multi_cell()****, or ****pdf.write()****.** This is not optional — text from web scraping, yfinance, and deep research will contain Unicode characters that break the PDF.

### Avoiding Common fpdf2 Issues

- **Image sizing:** Always specify width (w=190 for full-width) and let fpdf2 calculate height proportionally. If an image would overflow the page, the auto page break handles it — but check that set_auto_page_break is enabled.
- **Long text overflow:** Use multi_cell() for paragraphs, not cell(). cell() truncates at one line.
- **Table alignment:** Right-align numbers, left-align text. Use cell() with explicit widths for table columns.
- **Font availability:** Stick to built-in fonts: Helvetica, Times, Courier. These require no font file embedding. If you need bold/italic, use the style parameter: set_font("Helvetica", "B", 12).

### Styling Guidelines

- **Header bar** on each page with company name, ticker, and page number
- **Data tables** with alternating row shading, right-aligned numbers
- **Charts** at full column width with clear titles and axis labels
- **Callout boxes** for key insights ("Management guided 15% revenue growth in Q4 call")
- **Source citations** as footnotes or inline parenthetical references
- **Professional typography**: 10-11pt body, 14pt section headers, consistent spacing
- **Color palette**: Navy (#003366) for headers, dark gray (#333333) for body text, green (#228B22) for positive metrics, red (#CC0000) for negative metrics

## Best Practices

- **Timestamp everything** — state data pull date; yfinance prices are ~15min delayed
- **Sector-relative only** — a 30 P/E is cheap in software, expensive in utilities
- **Label facts vs thesis** — "FCF yield is 6%" (fact) vs "undervalued" (opinion)
- **Bear case required** — every analysis must include: what kills this trade?
- **Position sizing reality** — no single stock >5% for most retail portfolios; if conviction demands 20%, the conviction is the problem

## Limitations & Disclaimer

**Include the following disclaimer text (or substantially similar language) on the final page of every PDF report and at the bottom of every web dashboard:**

IMPORTANT DISCLAIMER: This report is produced for informational and educational purposes only. It does not constitute investment advice, a recommendation, or a solicitation to buy, sell, or hold any security or financial instrument. The information contained herein is based on publicly available data sources that may be incomplete, delayed, or inaccurate. No representation or warranty, express or implied, is made as to the accuracy, completeness, or reliability of the information provided.

Any opinions, estimates, or projections expressed are those of an automated analysis system and do not reflect the views of any licensed financial institution, registered investment advisor, or broker-dealer. Past performance is not indicative of future results. All investments carry risk, including the potential loss of principal.

Before making any investment decision, you should consult with a qualified, licensed financial advisor who can assess your individual circumstances, risk tolerance, and financial goals. The authors and publishers of this report accept no liability for any loss or damage arising from reliance on the information contained herein.

**Technical limitations:**

- yfinance scrapes Yahoo Finance — occasionally breaks, data may lag filings by days or weeks
- Cannot access Bloomberg, FactSet, Refinitiv, or real-time Level 2 market data
- Cannot execute trades, manage portfolios, or provide personalized financial planning
- Data is delayed (typically 15-20 minutes for prices; financials may lag quarterly filings)
- All equities can decline to zero; sector and thematic analysis reflects a point-in-time snapshot that may not reflect rapid market changes
