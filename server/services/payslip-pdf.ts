import PDFDocument from "pdfkit";
import fs from "fs";
import os from "os";
import path from "path";
import { formatINR } from "./payroll";

// ── Glyph fallbacks (pdfkit's built-in Helvetica is Latin-1 only) ────
//
// pdfkit ships with Helvetica/Times/Courier as built-ins, none of which
// cover characters outside Latin-1. The Indian rupee sign (U+20B9) and
// rightwards arrow (U+2192) silently render as garbage glyphs (¹, !')
// when used. Until we register a Unicode font (NotoSans etc.), every
// PDF string flows through `pdfText()` which swaps those two
// characters for ASCII-safe alternatives. The HTML email preserves the
// originals — only the PDF is constrained.
const RUPEE_REPLACEMENT = "Rs. ";
const ARROW_REPLACEMENT = "->";
function pdfText(s: string): string {
  return s.replace(/₹/g, RUPEE_REPLACEMENT).replace(/→/g, ARROW_REPLACEMENT);
}

// ─────────────────────────────────────────────────────────────────────
// Payslip PDF generation — Verge Scales Pvt Ltd
//
// Programmatic A4 layout via pdfkit (pure-JS, no Chromium).
//
// Layout (top → bottom):
//   1. Dark navy header band (so the *white* Verge Scales logo is
//      visible without filtering — pdfkit doesn't do CSS filters).
//      Logo on the left, brand text + "PAYSLIP" on the right.
//   2. Pay-period strip + company address (light background).
//   3. Two-column details: Employee on the left, Pay Period on right.
//   4. Earnings table with header band, right-aligned currency, and
//      smaller gray "Notes" sub-text below each line item carrying
//      the math expansion (e.g. "(20 + 2) ÷ 22 × ₹50,000").
//   5. Total band with double-rule.
//   6. Footer: "CONFIDENTIAL · System-generated — no signature
//      required" + ledger id + generation timestamp.
//
// The white-on-white branding logo is fetched once from a CDN URL
// and cached at uploads/branding/verge-scales-logo.png so subsequent
// renders are instant and offline-tolerant.
// ─────────────────────────────────────────────────────────────────────

// ── Branding constants ──────────────────────────────────────────────
const COMPANY_NAME = "Verge Scales Pvt Ltd";
const COMPANY_ADDRESS =
  "4th Floor, Innov8 R City North wing, LBS Marg, Sahakar Bhawan Sub Post Office, Ghatkopar West, Mumbai 400086";
const LOGO_URL =
  "https://cdn.shopify.com/s/files/1/0974/4616/6844/files/logo.png?v=1777270936";

// ── Color palette (slate + amber accent, dark for contrast) ─────────
const C = {
  navyDark: "#0f172a",
  navyHeader: "#0b1220", // slightly darker so white logo pops
  ink: "#0f172a",
  body: "#1e293b",
  mute: "#64748b",
  hairline: "#e2e8f0",
  band: "#f8fafc",
  amber: "#b45309",
  totalRule: "#0f172a",
} as const;

// On Vercel the only writable filesystem is `/tmp`, and even that is
// wiped between invocations. We park both the rendered PDFs and the
// cached logo there so the same code runs on Vercel and locally
// without an environment switch. Locally `os.tmpdir()` is /tmp (or
// /var/folders/.../T on macOS) which is fine — uploads/ is no longer
// referenced by the payroll engine.
const PAYSLIPS_DIR = path.join(os.tmpdir(), "orderflow-payslips");
const BRANDING_DIR = path.join(os.tmpdir(), "orderflow-branding");
const LOGO_CACHED_PATH = path.join(BRANDING_DIR, "verge-scales-logo.png");

export interface PayslipData {
  employee: {
    fullName: string;
    email: string;
    employeeId: string | null;
    holidayState: string | null;
    department: string | null;
  };
  period: {
    year: number;
    month: number; // 1-indexed
  };
  base: {
    baseSalary: number;
    expectedWorkingDays: number;
    daysPresent: number;
    paidHolidaysUsed: number;
    ratio: number;
    amount: number;
    capped: boolean;
  };
  incentives: {
    profile: "ORDER_CONFIRMATION" | "NDR_RTO" | "CHAT_SUPPORT" | null;
    deliveryRatePct?: number | null;
    teamDeliveryRatePct?: number | null;
    recoveryRatePct?: number | null;
    reshipsCount?: number | null;
    confirmationBonus: number;
    teamDeliveryBonus: number;
    recoveryBonus: number;
    reshipsBonus: number;
    total: number;
  };
  finalPayout: number;
  ledgerId: string;
  generatedAt: Date;
}

export interface PayslipFile {
  absPath: string;
  filename: string;
  byteLength: number;
}

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

// ── Page geometry (A4 portrait, 50pt side margins) ──────────────────
const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;
const MARGIN = 50;
const CONTENT_LEFT = MARGIN;
const CONTENT_RIGHT = PAGE_WIDTH - MARGIN;
const CONTENT_WIDTH = CONTENT_RIGHT - CONTENT_LEFT;

// Earnings-table column anchors (right-aligned amount column).
const COL_LABEL_X = CONTENT_LEFT + 12;
const COL_AMOUNT_RIGHT = CONTENT_RIGHT - 12;
const COL_AMOUNT_WIDTH = 120;
const COL_AMOUNT_X = COL_AMOUNT_RIGHT - COL_AMOUNT_WIDTH;

// ─────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────

/**
 * Render the payslip in-memory and return a Buffer. Writes nothing to
 * disk. Used on Vercel (where `/tmp` is ephemeral and the download
 * route re-renders on demand) and is also the building block for the
 * disk-backed variants below.
 */
export async function renderPayslipPdfBuffer(data: PayslipData): Promise<Buffer> {
  // Best-effort: ensure logo is cached. Don't fail PDF render if the
  // CDN is briefly unreachable — fall back to a text-only header.
  let logoPath: string | null = null;
  try {
    logoPath = await ensureLogoCached();
  } catch (err: any) {
    console.warn(
      `[payslip-pdf] logo fetch failed (${err?.message ?? err}); continuing text-only`,
    );
  }

  return await new Promise<Buffer>((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: MARGIN });
    const chunks: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    drawHeaderBand(doc, data, logoPath);
    drawPeriodStrip(doc, data);
    drawDetailsTwoColumn(doc, data);
    drawEarningsTable(doc, data);
    drawTotal(doc, data);
    drawFooter(doc, data);

    doc.end();
  });
}

/**
 * Disk-backed variant. Renders to a Buffer and persists to
 * `os.tmpdir()/orderflow-payslips/`. Returned for the "Run Payroll"
 * flow because the email dispatcher prefers a file path for its
 * attachment helper. On Vercel the file disappears once the function
 * returns — that's fine, the email is sent before then. The download
 * route never reads back from disk; it always re-renders.
 */
export async function renderPayslipPdf(data: PayslipData): Promise<PayslipFile> {
  ensureDir(PAYSLIPS_DIR);
  const period = `${data.period.year}-${String(data.period.month).padStart(2, "0")}`;
  const safeName = data.employee.fullName.replace(/[^a-z0-9]/gi, "_");
  const filename = `${safeName}__${period}.pdf`;
  const absPath = path.join(PAYSLIPS_DIR, filename);

  const buf = await renderPayslipPdfBuffer(data);
  fs.writeFileSync(absPath, buf);
  return { absPath, filename, byteLength: buf.byteLength };
}

// ─────────────────────────────────────────────────────────────────────
// Header band — dark navy with white logo + brand text
// ─────────────────────────────────────────────────────────────────────

function drawHeaderBand(doc: PDFKit.PDFDocument, data: PayslipData, logoPath: string | null) {
  const bandHeight = 110;
  // Fill the entire band edge-to-edge (overrides the page margin
  // on top so the navy bleeds to the page edges).
  doc.save();
  doc.rect(0, 0, PAGE_WIDTH, bandHeight).fill(C.navyHeader);
  doc.restore();

  const padX = 40;
  const padY = 28;

  // ── Logo (left) ──
  if (logoPath && fs.existsSync(logoPath)) {
    try {
      doc.image(logoPath, padX, padY, { fit: [55, 55] });
    } catch {
      // Corrupt cache file? Drop it and continue text-only.
      try { fs.unlinkSync(logoPath); } catch {}
    }
  }

  // ── Brand text (next to logo) ──
  const textX = padX + 70;
  doc
    .fillColor("#ffffff")
    .font("Helvetica-Bold")
    .fontSize(18)
    .text(COMPANY_NAME, textX, padY, {
      width: CONTENT_WIDTH - 80,
    });
  doc
    .fillColor("#cbd5e1")
    .font("Helvetica")
    .fontSize(9)
    .text("Payroll · Confidential", textX, padY + 24);

  // ── "PAYSLIP" eyebrow on the far right ──
  const period = `${MONTH_NAMES[data.period.month - 1]} ${data.period.year}`;
  doc
    .fillColor("#94a3b8")
    .font("Helvetica-Bold")
    .fontSize(10)
    .text("PAYSLIP", PAGE_WIDTH - 120, padY, {
      width: 80 - 8,
      align: "right",
      characterSpacing: 2,
    });
  doc
    .fillColor("#ffffff")
    .font("Helvetica-Bold")
    .fontSize(14)
    .text(period, PAGE_WIDTH - 120, padY + 16, {
      width: 80 - 8,
      align: "right",
    });

  // Reset cursor below the band, with normal margins resumed.
  doc.x = CONTENT_LEFT;
  doc.y = bandHeight + 18;
}

// ─────────────────────────────────────────────────────────────────────
// Period strip + company address (just below header band)
// ─────────────────────────────────────────────────────────────────────

function drawPeriodStrip(doc: PDFKit.PDFDocument, _data: PayslipData) {
  const stripTop = doc.y;
  const stripHeight = 38;
  doc
    .save()
    .rect(CONTENT_LEFT, stripTop, CONTENT_WIDTH, stripHeight)
    .fill(C.band)
    .restore();
  doc
    .fillColor(C.mute)
    .font("Helvetica-Bold")
    .fontSize(8)
    .text("REGISTERED OFFICE", CONTENT_LEFT + 12, stripTop + 8, {
      characterSpacing: 1.5,
    });
  doc
    .fillColor(C.body)
    .font("Helvetica")
    .fontSize(9)
    .text(COMPANY_ADDRESS, CONTENT_LEFT + 12, stripTop + 20, {
      width: CONTENT_WIDTH - 24,
      lineBreak: false,
      ellipsis: true,
    });
  doc.x = CONTENT_LEFT;
  doc.y = stripTop + stripHeight + 18;
}

// ─────────────────────────────────────────────────────────────────────
// Two-column details (Employee / Pay Period)
// ─────────────────────────────────────────────────────────────────────

function drawDetailsTwoColumn(doc: PDFKit.PDFDocument, data: PayslipData) {
  const colTop = doc.y;
  const colGap = 24;
  const colWidth = (CONTENT_WIDTH - colGap) / 2;
  const leftX = CONTENT_LEFT;
  const rightX = CONTENT_LEFT + colWidth + colGap;
  const period = `${MONTH_NAMES[data.period.month - 1]} ${data.period.year}`;

  // Section labels
  drawSectionLabel(doc, "EMPLOYEE DETAILS", leftX, colTop);
  drawSectionLabel(doc, "PAY PERIOD", rightX, colTop);

  const rowTop = colTop + 14;
  // Left column
  drawKeyValue(doc, "Name", data.employee.fullName, leftX, rowTop, colWidth);
  drawKeyValue(doc, "Email", data.employee.email, leftX, rowTop + 16, colWidth);
  if (data.employee.department) {
    drawKeyValue(doc, "Department", data.employee.department, leftX, rowTop + 32, colWidth);
  }
  if (data.employee.employeeId) {
    drawKeyValue(doc, "Employee ID", data.employee.employeeId, leftX, rowTop + 48, colWidth);
  }
  if (data.employee.holidayState) {
    drawKeyValue(
      doc,
      "Holiday calendar",
      capitalizeFirst(data.employee.holidayState),
      leftX,
      rowTop + 64,
      colWidth,
    );
  }

  // Right column
  drawKeyValue(doc, "Period", period, rightX, rowTop, colWidth);
  drawKeyValue(
    doc,
    "Working days (M–F)",
    String(data.base.expectedWorkingDays),
    rightX,
    rowTop + 16,
    colWidth,
  );
  drawKeyValue(
    doc,
    "Days present",
    String(data.base.daysPresent),
    rightX,
    rowTop + 32,
    colWidth,
  );
  drawKeyValue(
    doc,
    "Paid holidays used",
    String(data.base.paidHolidaysUsed),
    rightX,
    rowTop + 48,
    colWidth,
  );
  drawKeyValue(
    doc,
    "Base salary",
    `Rs. ${formatINR(data.base.baseSalary)}`,
    rightX,
    rowTop + 64,
    colWidth,
  );

  doc.x = CONTENT_LEFT;
  doc.y = rowTop + 64 + 18 + 8; // bottom-most row + line height + gap
}

function drawSectionLabel(doc: PDFKit.PDFDocument, label: string, x: number, y: number) {
  doc
    .fillColor(C.mute)
    .font("Helvetica-Bold")
    .fontSize(8)
    .text(label, x, y, { characterSpacing: 1.5 });
  // Underline for visual separation
  doc
    .strokeColor(C.hairline)
    .lineWidth(1)
    .moveTo(x, y + 11)
    .lineTo(x + 100, y + 11)
    .stroke();
}

function drawKeyValue(
  doc: PDFKit.PDFDocument,
  key: string,
  value: string,
  x: number,
  y: number,
  width: number,
) {
  const keyWidth = 110;
  doc
    .fillColor(C.mute)
    .font("Helvetica")
    .fontSize(9)
    .text(key, x, y, { width: keyWidth });
  doc
    .fillColor(C.body)
    .font("Helvetica-Bold")
    .fontSize(9.5)
    .text(value, x + keyWidth, y, {
      width: width - keyWidth,
      lineBreak: false,
      ellipsis: true,
    });
}

// ─────────────────────────────────────────────────────────────────────
// Earnings table — header band, right-aligned currency, math sub-text
// ─────────────────────────────────────────────────────────────────────

function drawEarningsTable(doc: PDFKit.PDFDocument, data: PayslipData) {
  // Section heading
  drawSectionLabel(doc, "EARNINGS", CONTENT_LEFT, doc.y);
  doc.y += 16;

  // Header band
  const headerTop = doc.y;
  const headerHeight = 24;
  doc
    .save()
    .rect(CONTENT_LEFT, headerTop, CONTENT_WIDTH, headerHeight)
    .fill(C.navyHeader)
    .restore();
  doc
    .fillColor("#ffffff")
    .font("Helvetica-Bold")
    .fontSize(9.5)
    .text("Component", COL_LABEL_X, headerTop + 7, {
      characterSpacing: 1,
    });
  doc.text("Amount (Rs.)", COL_AMOUNT_X, headerTop + 7, {
    width: COL_AMOUNT_WIDTH,
    align: "right",
    characterSpacing: 1,
  });
  doc.y = headerTop + headerHeight;

  // ── Base pay row ──
  const ratioPct = (data.base.ratio * 100).toFixed(2);
  const cappedNote = data.base.capped ? " (capped at 100%)" : "";
  drawTableRow(
    doc,
    "Base pay",
    `Calculation: (${data.base.daysPresent} present + ${data.base.paidHolidaysUsed} paid holidays) ÷ ${data.base.expectedWorkingDays} working days × Rs. ${formatINR(data.base.baseSalary)} = ${ratioPct}%${cappedNote}`,
    formatINR(data.base.amount),
  );

  // ── Incentive rows (only for ORDER_CONFIRMATION / NDR_RTO) ──
  const showIncentives =
    data.incentives.profile === "ORDER_CONFIRMATION" ||
    data.incentives.profile === "NDR_RTO";

  if (showIncentives) {
    if (data.incentives.profile === "ORDER_CONFIRMATION") {
      drawTableRow(
        doc,
        "Confirmation bonus",
        data.incentives.deliveryRatePct == null
          ? "No delivery rate recorded for this period"
          : `Delivery rate ${data.incentives.deliveryRatePct.toFixed(2)}% -> tier bonus per Order Confirmation ladder`,
        formatINR(data.incentives.confirmationBonus),
      );
    } else if (data.incentives.profile === "NDR_RTO") {
      drawTableRow(
        doc,
        "Team delivery bonus",
        data.incentives.teamDeliveryRatePct == null
          ? "No team delivery rate recorded"
          : `Team delivery ${data.incentives.teamDeliveryRatePct.toFixed(2)}% -> tier bonus per NDR/RTO ladder`,
        formatINR(data.incentives.teamDeliveryBonus),
      );
      drawTableRow(
        doc,
        "Personal recovery bonus",
        data.incentives.recoveryRatePct == null
          ? "No personal recovery rate recorded"
          : `Recovery rate ${data.incentives.recoveryRatePct.toFixed(2)}% -> tier bonus per NDR/RTO ladder`,
        formatINR(data.incentives.recoveryBonus),
      );
      const reships = data.incentives.reshipsCount ?? 0;
      drawTableRow(
        doc,
        "Reships bonus",
        `${reships} reships × Rs. 50 = Rs. ${formatINR(reships * 50)}`,
        formatINR(data.incentives.reshipsBonus),
      );
    }
  }
}

/**
 * One earnings row. Label + right-aligned amount on the primary line,
 * smaller gray "Notes" sub-line below carrying the math expansion.
 */
function drawTableRow(doc: PDFKit.PDFDocument, label: string, mathNote: string, amount: string) {
  const rowTop = doc.y;
  const rowPadding = 6;

  // Primary label/amount line
  doc
    .fillColor(C.body)
    .font("Helvetica-Bold")
    .fontSize(11)
    .text(label, COL_LABEL_X, rowTop + rowPadding, {
      width: COL_AMOUNT_X - COL_LABEL_X - 12,
      lineBreak: false,
      ellipsis: true,
    });
  doc
    .fillColor(C.ink)
    .font("Helvetica-Bold")
    .fontSize(11)
    .text(amount, COL_AMOUNT_X, rowTop + rowPadding, {
      width: COL_AMOUNT_WIDTH,
      align: "right",
      features: ["tnum"], // tabular nums keep decimals lined up
    });

  // Notes sub-line
  const noteY = rowTop + rowPadding + 14;
  doc
    .fillColor(C.mute)
    .font("Helvetica")
    .fontSize(8.5)
    .text(mathNote, COL_LABEL_X, noteY, {
      width: COL_AMOUNT_X - COL_LABEL_X - 12,
    });

  // Hairline divider so rows don't blur into each other
  const rowEnd = doc.y + 4;
  doc
    .strokeColor(C.hairline)
    .lineWidth(0.5)
    .moveTo(CONTENT_LEFT, rowEnd)
    .lineTo(CONTENT_RIGHT, rowEnd)
    .stroke();

  doc.x = CONTENT_LEFT;
  doc.y = rowEnd + 4;
}

// ─────────────────────────────────────────────────────────────────────
// Total (band with double rule, right-aligned final figure)
// ─────────────────────────────────────────────────────────────────────

function drawTotal(doc: PDFKit.PDFDocument, data: PayslipData) {
  doc.y += 4;
  const bandTop = doc.y;
  const bandHeight = 36;

  doc
    .save()
    .rect(CONTENT_LEFT, bandTop, CONTENT_WIDTH, bandHeight)
    .fill(C.band)
    .restore();

  doc
    .fillColor(C.ink)
    .font("Helvetica-Bold")
    .fontSize(13)
    .text("TOTAL EARNINGS", COL_LABEL_X, bandTop + 11, {
      characterSpacing: 1,
    });
  doc
    .fillColor(C.ink)
    .font("Helvetica-Bold")
    .fontSize(14)
    .text(`Rs. ${formatINR(data.finalPayout)}`, COL_AMOUNT_X, bandTop + 10, {
      width: COL_AMOUNT_WIDTH,
      align: "right",
      features: ["tnum"],
    });

  // Double rule below the total
  const ruleY1 = bandTop + bandHeight + 1;
  const ruleY2 = ruleY1 + 3;
  doc
    .strokeColor(C.totalRule)
    .lineWidth(0.8)
    .moveTo(CONTENT_LEFT, ruleY1)
    .lineTo(CONTENT_RIGHT, ruleY1)
    .stroke();
  doc
    .strokeColor(C.totalRule)
    .lineWidth(0.8)
    .moveTo(CONTENT_LEFT, ruleY2)
    .lineTo(CONTENT_RIGHT, ruleY2)
    .stroke();

  doc.x = CONTENT_LEFT;
  doc.y = ruleY2 + 16;
}

// ─────────────────────────────────────────────────────────────────────
// Footer (CONFIDENTIAL · System-generated)
// ─────────────────────────────────────────────────────────────────────

function drawFooter(doc: PDFKit.PDFDocument, data: PayslipData) {
  // Footer is anchored ~85pt above the page bottom (page height
  // 841.89, bottom margin 50). Each text() call advances doc.y; if
  // doc.y crosses (PAGE_HEIGHT - bottomMargin) pdfkit auto-paginates,
  // which is what put CONFIDENTIAL on page 2 in the previous render.
  // Reserving 85pt gives the three-line footer block headroom.
  //
  // We also use { lineBreak: false } on every text call so pdfkit
  // doesn't try to wrap and inadvertently push past the page bottom.
  const footerY = PAGE_HEIGHT - 85;

  // Top hairline rule
  doc
    .strokeColor(C.hairline)
    .lineWidth(0.5)
    .moveTo(CONTENT_LEFT, footerY - 10)
    .lineTo(CONTENT_RIGHT, footerY - 10)
    .stroke();

  // Line 1: CONFIDENTIAL (amber) + System Generated (gray) on the
  // same baseline. Both right-truncate rather than wrap.
  doc
    .fillColor(C.amber)
    .font("Helvetica-Bold")
    .fontSize(9)
    .text("CONFIDENTIAL", CONTENT_LEFT, footerY, {
      characterSpacing: 2,
      width: 130,
      lineBreak: false,
    });
  doc
    .fillColor(C.mute)
    .font("Helvetica")
    .fontSize(8.5)
    .text(
      "System Generated · No Signature Required",
      CONTENT_LEFT + 130,
      footerY + 1,
      { width: 280, lineBreak: false },
    );

  // Line 2: ledger id + timestamp, full content width
  doc
    .fillColor(C.mute)
    .font("Helvetica")
    .fontSize(7.5)
    .text(
      `Ledger ${data.ledgerId.slice(0, 8)} · Generated ${data.generatedAt.toISOString()}`,
      CONTENT_LEFT,
      footerY + 16,
      { width: CONTENT_WIDTH, align: "left", lineBreak: false },
    );
}

// ─────────────────────────────────────────────────────────────────────
// Logo cache (download once on first render)
// ─────────────────────────────────────────────────────────────────────

let logoFetchPromise: Promise<string | null> | null = null;

async function ensureLogoCached(): Promise<string | null> {
  if (fs.existsSync(LOGO_CACHED_PATH)) return LOGO_CACHED_PATH;
  if (!logoFetchPromise) {
    logoFetchPromise = downloadLogo().catch((err) => {
      logoFetchPromise = null; // allow retry next render
      throw err;
    });
  }
  return logoFetchPromise;
}

async function downloadLogo(): Promise<string | null> {
  ensureDir(BRANDING_DIR);
  const res = await fetch(LOGO_URL);
  if (!res.ok) {
    throw new Error(`logo HTTP ${res.status} ${res.statusText}`);
  }
  const arrayBuf = await res.arrayBuffer();
  fs.writeFileSync(LOGO_CACHED_PATH, Buffer.from(arrayBuf));
  return LOGO_CACHED_PATH;
}

// ─────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────

function ensureDir(p: string) {
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
}

function capitalizeFirst(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
}
