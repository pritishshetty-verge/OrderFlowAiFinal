import { useRef, useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { useActiveStore } from "@/hooks/use-store";
import { apiRequest } from "@/lib/queryClient";
import { Upload, Trash2, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

// ─────────────────────────────────────────────────────────────────────
// Settings → Workspace
//
// Lets an admin set a custom logo on the currently active store. The
// flow is intentionally tiny:
//
//   1. File picker → FileReader → base64 data URI
//   2. PATCH /api/stores/:id with { logoUrl: dataUri }
//   3. Invalidate /api/stores/me so StoreSwitcher re-renders with the
//      new asset, no manual refresh required.
//
// No S3, no presigned URLs. Workspace logos are tiny (the upload is
// capped at 1.5 MB pre-encoding) and rarely change, so storing the
// data URI directly in the stores row is the right cost trade-off
// for the next 10× of growth. The server still accepts plain http(s)
// URLs as logoUrl, so any team that wants CDN-hosted assets can use
// the "Logo URL" text input below instead of the file picker.
// ─────────────────────────────────────────────────────────────────────

// 1.5 MB pre-encoding ≈ ~2 MB after base64 expansion. The server
// rejects anything above 2 MB on the encoded shape, so reject early
// in the client too with a clearer message.
const MAX_LOGO_BYTES_BEFORE_ENCODE = 1.5 * 1024 * 1024;
const ALLOWED_MIME = new Set([
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/webp",
  "image/svg+xml",
  "image/gif",
]);

function readFileAsDataUri(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") resolve(reader.result);
      else reject(new Error("FileReader returned non-string result"));
    };
    reader.onerror = () => reject(reader.error ?? new Error("FileReader failed"));
    reader.readAsDataURL(file);
  });
}

export function WorkspaceSettings() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { activeStore, loading } = useActiveStore();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Local pending state for the URL input — only writes through on
  // explicit Save so users can edit freely without each keystroke
  // hitting the API.
  const [urlInput, setUrlInput] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // ── Mutation: PATCH /api/stores/:id with the supplied logoUrl
  // (data URI from file picker OR string from the URL input OR null
  // to clear). We update from a single helper so the success/error
  // toasts + cache invalidation live in one place.
  async function applyLogoUrl(nextLogoUrl: string | null): Promise<void> {
    if (!activeStore) return;
    setSubmitting(true);
    try {
      await apiRequest("PATCH", `/api/stores/${activeStore.id}`, {
        logoUrl: nextLogoUrl,
      });
      // Refetch /api/stores/me so the StoreSwitcher (and anything
      // else keyed off the active store object) pulls the new
      // logoUrl. invalidateQueries with a partial key matches every
      // user-id suffix.
      await queryClient.invalidateQueries({ queryKey: ["/api/stores/me"] });
      toast({
        title: nextLogoUrl ? "Logo updated" : "Logo removed",
        description: nextLogoUrl
          ? "Your workspace logo has been saved."
          : "Reverted to the default workspace tile.",
      });
      // Clear the URL input on success so it doesn't carry stale
      // text into a future edit.
      setUrlInput("");
    } catch (err: any) {
      const message = err?.message ?? "Something went wrong.";
      toast({
        title: "Could not save logo",
        description: message,
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  }

  async function handleFile(file: File | undefined) {
    if (!file) return;
    if (!ALLOWED_MIME.has(file.type)) {
      toast({
        title: "Unsupported file type",
        description: "Use PNG, JPEG, WEBP, SVG, or GIF.",
        variant: "destructive",
      });
      return;
    }
    if (file.size > MAX_LOGO_BYTES_BEFORE_ENCODE) {
      toast({
        title: "File too large",
        description: `Max 1.5 MB. This file is ${(file.size / 1024 / 1024).toFixed(2)} MB.`,
        variant: "destructive",
      });
      return;
    }
    try {
      const dataUri = await readFileAsDataUri(file);
      await applyLogoUrl(dataUri);
    } catch (err: any) {
      toast({
        title: "Could not read file",
        description: err?.message ?? "Try a different image.",
        variant: "destructive",
      });
    }
    // Reset the file input so the same file can be re-selected later
    // (browsers swallow change events when the same file is picked
    // twice in a row).
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function handleUrlSubmit() {
    const trimmed = urlInput.trim();
    if (!trimmed) return;
    if (!/^https?:\/\//i.test(trimmed)) {
      toast({
        title: "Invalid URL",
        description: "URL must start with http:// or https://.",
        variant: "destructive",
      });
      return;
    }
    await applyLogoUrl(trimmed);
  }

  async function handleClear() {
    await applyLogoUrl(null);
  }

  // ── Render ──────────────────────────────────────────────────────
  if (loading && !activeStore) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Workspace</CardTitle>
          <CardDescription>Loading active store…</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  if (!activeStore) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Workspace</CardTitle>
          <CardDescription>
            No active store selected. Pick one from the sidebar to manage its
            branding.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const displayName = activeStore.storeName?.trim() || activeStore.storeUrl;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Workspace branding</CardTitle>
          <CardDescription>
            Customise the logo that appears in the sidebar for{" "}
            <span className="font-medium text-foreground">{displayName}</span>.
            Changes apply only to this store.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* ── Current logo preview ─────────────────────────────── */}
          <div className="flex items-center gap-4">
            <div
              className={cn(
                "h-16 w-16 rounded-lg overflow-hidden",
                "bg-white shadow-sm ring-1 ring-black/5",
                "flex items-center justify-center",
              )}
              data-testid="workspace-logo-preview"
            >
              {activeStore.logoUrl ? (
                <img
                  src={activeStore.logoUrl}
                  alt={`${displayName} logo`}
                  className="h-full w-full object-contain p-1"
                />
              ) : (
                <span className="text-muted-foreground text-xs">No logo</span>
              )}
            </div>
            <div className="space-y-1">
              <p className="text-sm font-medium">{displayName}</p>
              <p className="text-xs text-muted-foreground">
                {activeStore.logoUrl
                  ? "Custom logo set."
                  : "Falls back to the default gradient avatar."}
              </p>
            </div>
            {activeStore.logoUrl && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleClear}
                disabled={submitting}
                className="ml-auto"
                data-testid="button-remove-logo"
              >
                <Trash2 className="h-4 w-4 mr-1.5" />
                Remove
              </Button>
            )}
          </div>

          {/* ── Upload from file ────────────────────────────────── */}
          <div className="space-y-2">
            <Label htmlFor="workspace-logo-file">Upload from device</Label>
            <p className="text-xs text-muted-foreground">
              PNG, JPEG, WEBP, SVG, or GIF — up to 1.5 MB. Stored inline on
              the store record; no external host needed.
            </p>
            <div className="flex items-center gap-3">
              <input
                ref={fileInputRef}
                id="workspace-logo-file"
                type="file"
                accept="image/png,image/jpeg,image/webp,image/svg+xml,image/gif"
                className="hidden"
                onChange={(e) => {
                  void handleFile(e.target.files?.[0]);
                }}
                data-testid="input-logo-file"
              />
              <Button
                type="button"
                variant="outline"
                onClick={() => fileInputRef.current?.click()}
                disabled={submitting}
                data-testid="button-upload-logo"
              >
                {submitting ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Upload className="h-4 w-4 mr-2" />
                )}
                Choose file
              </Button>
            </div>
          </div>

          {/* ── Or paste a URL ───────────────────────────────────── */}
          <div className="space-y-2">
            <Label htmlFor="workspace-logo-url">Or use a hosted URL</Label>
            <p className="text-xs text-muted-foreground">
              Useful if your logo is already on a CDN. Must start with{" "}
              <code className="text-[11px] bg-muted px-1 py-0.5 rounded">https://</code>.
            </p>
            <div className="flex items-center gap-2">
              <Input
                id="workspace-logo-url"
                type="url"
                placeholder="https://cdn.example.com/logo.png"
                value={urlInput}
                onChange={(e) => setUrlInput(e.target.value)}
                disabled={submitting}
                data-testid="input-logo-url"
              />
              <Button
                type="button"
                onClick={handleUrlSubmit}
                disabled={submitting || !urlInput.trim()}
                data-testid="button-save-logo-url"
              >
                {submitting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  "Save URL"
                )}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
