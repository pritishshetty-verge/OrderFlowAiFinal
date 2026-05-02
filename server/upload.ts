import fs from "fs";
import path from "path";
import crypto from "crypto";
import multer from "multer";
import type { Request } from "express";

// ─────────────────────────────────────────────────────────────────────
// KYC upload — local disk storage.
//
// This is the "foundation" step. When we migrate to S3, replace the
// diskStorage + file-serving code with:
//   - `multer.memoryStorage()` to buffer the file, OR
//   - `multer-s3` for streaming uploads to S3
// and swap the download route to return a pre-signed S3 URL.
// Keep the same POST /api/users/:id/kyc-upload contract so the frontend
// doesn't need to change.
// ─────────────────────────────────────────────────────────────────────

export const KYC_UPLOAD_DIR = path.resolve(
  import.meta.dirname,
  "..",
  "uploads",
  "kyc",
);

// Defensive mkdirp — `-p` semantics, safe on repeat boots.
fs.mkdirSync(KYC_UPLOAD_DIR, { recursive: true });

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
