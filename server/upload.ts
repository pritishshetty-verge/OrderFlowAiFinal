import fs from "fs";
import os from "os";
import path from "path";
import crypto from "crypto";
import multer from "multer";
import type { Request } from "express";

// ─────────────────────────────────────────────────────────────────────
// KYC upload — local/ephemeral disk storage.
//
// On Vercel, /var/task is read-only and the only writable directory is
// /tmp (wiped between invocations). On a long-running host (npm run
// dev) we want uploads to persist between restarts, so we keep using
// ./uploads/kyc relative to the project root.
//
// The path is selected at module load:
//   - VERCEL=1            → os.tmpdir()/orderflow-kyc       (ephemeral)
//   - everywhere else     → <repo>/uploads/kyc              (persistent)
//
// Until we move KYC to S3, files uploaded on Vercel won't survive past
// the function invocation that received them. The legitimate
// production path is "drop a real S3 bucket here" — see the upgrade
// notes below.
//
// When we migrate to S3, replace the diskStorage + file-serving code
// with `multer-s3` (streaming) or `multer.memoryStorage()` + manual
// PutObject calls. Keep the same POST /api/users/:id/kyc-upload
// contract so the frontend doesn't need to change.
// ─────────────────────────────────────────────────────────────────────

export const KYC_UPLOAD_DIR = process.env.VERCEL
  ? path.join(os.tmpdir(), "orderflow-kyc")
  : path.resolve(import.meta.dirname, "..", "uploads", "kyc");

// Defensive mkdirp — `-p` semantics, safe on repeat boots. Wrapped in
// try/catch so a permissions blip on a serverless cold start (e.g. a
// pre-existing /tmp dir, or fs being unmounted in some edge runtime)
// doesn't take down the whole API at module-load time.
try {
  fs.mkdirSync(KYC_UPLOAD_DIR, { recursive: true });
} catch (err: any) {
  if (err?.code !== "EEXIST") {
    console.warn(
      `[kyc-upload] could not pre-create ${KYC_UPLOAD_DIR}: ${err?.message ?? err}`,
    );
  }
}

const ALLOWED_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".pdf"]);
const ALLOWED_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/jpg",
  "application/pdf",
]);

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, KYC_UPLOAD_DIR);
  },
  filename: (req: Request, file, cb) => {
    // `<userId>-<random>.<ext>` — keeps files bucketed by user for easy
    // debugging and makes the filename unguessable.
    const ext = path.extname(file.originalname).toLowerCase();
    const userId = (req.params.id ?? "unknown").replace(/[^a-zA-Z0-9-]/g, "");
    const token = crypto.randomBytes(12).toString("hex");
    cb(null, `${userId}-${token}${ext}`);
  },
});

export const kycUpload = multer({
  storage,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5 MB — generous for a passport/Aadhaar scan.
    files: 1,
  },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (!ALLOWED_EXTENSIONS.has(ext)) {
      return cb(
        new Error(
          `Unsupported file extension (${ext}). Allowed: .jpg, .jpeg, .png, .pdf`,
        ),
      );
    }
    if (!ALLOWED_MIME_TYPES.has(file.mimetype)) {
      return cb(
        new Error(
          `Unsupported mime type (${file.mimetype}). Allowed: image/jpeg, image/png, application/pdf`,
        ),
      );
    }
    cb(null, true);
  },
});

// Resolve a stored filename to an absolute path on disk. Rejects anything
// that would escape the KYC directory (e.g. "../../etc/passwd").
export function resolveKycFilePath(filename: string): string | null {
  const resolved = path.resolve(KYC_UPLOAD_DIR, filename);
  if (!resolved.startsWith(KYC_UPLOAD_DIR + path.sep)) return null;
  if (!fs.existsSync(resolved)) return null;
  return resolved;
}

// ─── Reconciliation CSV uploader ──────────────────────────────────────────
//
// PG settlement reports are small (~100 KB for a daily batch) and we want
// the file in memory so we can hand it straight to the adapter parser
// without an intermediate disk write. memoryStorage + 10 MB cap is the
// right shape: it handles ~10 years of settlement history per upload while
// staying well within Node's default heap.
//
// We accept text/csv AND application/octet-stream because some browsers
// don't set a mime for CSV files dragged from the OS picker.
const RECON_ALLOWED_CSV_EXTS = new Set([".csv", ".txt"]);
const RECON_ALLOWED_CSV_MIMES = new Set([
  "text/csv",
  "text/plain",
  "application/csv",
  "application/octet-stream",
  "application/vnd.ms-excel", // some clients label .csv as this
]);

export const reconCsvUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10 MB hard cap
    files: 1,
  },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (!RECON_ALLOWED_CSV_EXTS.has(ext)) {
      return cb(
        new Error(
          `Unsupported file extension (${ext}). Upload a .csv file (convert XLSX in Excel first).`,
        ),
      );
    }
    if (!RECON_ALLOWED_CSV_MIMES.has(file.mimetype)) {
      // Tolerant: many client mime detectors are wrong. Log a warn,
      // not an error.
      console.warn(
        `[recon-upload] unusual mime "${file.mimetype}" for ${file.originalname} — allowing`,
      );
    }
    cb(null, true);
  },
});
