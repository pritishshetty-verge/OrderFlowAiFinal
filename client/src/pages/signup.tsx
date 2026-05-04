import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { AlertCircle, CheckCircle2, Loader2 } from "lucide-react";
// Same logo asset the sidebar + login page use. Vite alias `@assets`
// maps to the project's `attached_assets/` directory.
import logoUrl from "@assets/Orderflow_Icon[1]_1761724429427.png";

// ─────────────────────────────────────────────────────────────────────
// Invite acceptance — split-screen premium SaaS layout.
//
// Layout mirrors the login page so the visual journey from invitation
// email → onboarding feels continuous. ALL invite logic is preserved
// verbatim from the previous implementation:
//   • Reads ?token=… from the URL on mount
//   • GET /api/invites/verify/:token  (token validation + invite data)
//   • POST /api/invites/accept        (account creation + bcrypt hash
//                                       happens server-side)
//   • Same field set: read-only Email (from invite), Full Name
//     (pre-filled), Username, Phone (optional), Password, Confirm.
//   • Same redirect to "/" on success, same localStorage shim.
//
// Three rendering states share the same shell so the dark brand panel
// stays put while the right column changes:
//   1. Loading  — spinner + "Verifying invitation…"
//   2. Error    — invite is missing/invalid/expired; offers Go to Login
//   3. Form     — the actual account-creation form
// ─────────────────────────────────────────────────────────────────────

export default function SignupPage() {
  const [, setLocation] = useLocation();
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [inviteData, setInviteData] = useState<{
    email: string;
    firstName?: string;
    lastName?: string;
    role: string;
    adminType?: string;
  } | null>(null);

  const [formData, setFormData] = useState({
    username: "",
    password: "",
    confirmPassword: "",
    fullName: "",
    phone: "",
  });

  // ── Token verification (unchanged) ────────────────────────────────
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const inviteToken = params.get("token");

    if (!inviteToken) {
      setError("No invitation token provided");
      setLoading(false);
      return;
    }

    setToken(inviteToken);

    fetch(`/api/invites/verify/${inviteToken}`)
      .then((res) => {
        if (!res.ok) {
          return res.json().then((data) => {
            throw new Error(data.error || "Failed to verify invite");
          });
        }
        return res.json();
      })
      .then((data) => {
        setInviteData(data);
        setFormData((prev) => ({
          ...prev,
          fullName: `${data.firstName || ""} ${data.lastName || ""}`.trim(),
        }));
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message);
        setLoading(false);
      });
  }, []);

  // ── Submission (unchanged) ────────────────────────────────────────
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (formData.password !== formData.confirmPassword) {
      setError("Passwords do not match");
      return;
    }

    if (formData.password.length < 8) {
      setError("Password must be at least 8 characters long");
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const response = await fetch("/api/invites/accept", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          token,
          username: formData.username,
          password: formData.password,
          fullName: formData.fullName,
          phone: formData.phone || null,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to create account");
      }

      const { user } = await response.json();

      localStorage.setItem("userRole", user.role);
      localStorage.setItem("userId", user.id);
      localStorage.setItem("userEmail", user.email);

      setLocation("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create account");
      setSubmitting(false);
    }
  };

  // ── Right-column body picker ──────────────────────────────────────
  // The brand panel is identical across all three states. Only the
  // right column changes content based on { loading, error, form }.
  const renderRightColumn = () => {
    if (loading) {
      return (
        <div
          className="flex flex-col items-center justify-center py-16"
          data-testid="signup-loading"
        >
          <Loader2 className="h-8 w-8 animate-spin text-blue-700 mb-4" />
          <p className="text-sm text-slate-500">Verifying invitation…</p>
        </div>
      );
    }

    if (error && !inviteData) {
      return (
        <div className="space-y-6 max-w-sm w-full">
          <div className="space-y-2">
            <h2 className="text-2xl font-semibold text-slate-900">
              Invalid invitation
            </h2>
            <p className="text-sm text-slate-500">
              This invitation link can't be used.
            </p>
          </div>

          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>

          <Button
            onClick={() => setLocation("/login")}
            className="w-full"
            data-testid="button-to-login"
          >
            Go to Login
          </Button>

          <p className="text-center text-xs text-slate-400">
            Need a fresh invite? Ask your administrator to resend it.
          </p>
        </div>
      );
    }

    // Default: the acceptance form
    return (
      <div className="w-full max-w-sm space-y-8">
        <div className="space-y-2">
          <h2 className="text-2xl font-semibold text-slate-900">
            Create your account
          </h2>
          <p className="text-sm text-slate-500">
            Complete your profile to join your team on OrderFlow.
          </p>
        </div>

        {/* Role pill — shows what role the invitee will be granted */}
        <div className="flex items-center gap-2 text-sm">
          <span className="text-slate-500">Role:</span>
          <Badge
            variant="secondary"
            data-testid="badge-role"
          >
            {inviteData?.role === "admin"
              ? "Administrator"
              : inviteData?.role === "recovery_agent"
                ? "Recovery Agent"
                : inviteData?.role === "chat_support"
                  ? "Chat Support"
                  : "Agent"}
          </Badge>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5" noValidate>
          {error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <div className="space-y-2">
            <Label htmlFor="email" className="text-slate-700">
              Email
            </Label>
            <Input
              id="email"
              type="email"
              value={inviteData?.email || ""}
              disabled
              className="bg-slate-50"
              data-testid="input-email"
            />
            <p className="text-xs text-slate-500 flex items-center gap-1">
              <CheckCircle2 className="h-3 w-3 text-green-600" />
              Verified from your invitation
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="fullName" className="text-slate-700">
              Full name
            </Label>
            <Input
              id="fullName"
              type="text"
              placeholder="John Doe"
              value={formData.fullName}
              onChange={(e) =>
                setFormData({ ...formData, fullName: e.target.value })
              }
              required
              autoComplete="name"
              disabled={submitting}
              data-testid="input-fullname"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="username" className="text-slate-700">
              Username
            </Label>
            <Input
              id="username"
              type="text"
              placeholder="johndoe"
              value={formData.username}
              onChange={(e) =>
                setFormData({ ...formData, username: e.target.value })
              }
              required
              autoComplete="username"
              disabled={submitting}
              data-testid="input-username"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="phone" className="text-slate-700">
              Phone <span className="text-slate-400">(optional)</span>
            </Label>
            <Input
              id="phone"
              type="tel"
              placeholder="+91 98765 43210"
              value={formData.phone}
              onChange={(e) =>
                setFormData({ ...formData, phone: e.target.value })
              }
              autoComplete="tel"
              disabled={submitting}
              data-testid="input-phone"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="password" className="text-slate-700">
              Password
            </Label>
            <Input
              id="password"
              type="password"
              placeholder="••••••••"
              value={formData.password}
              onChange={(e) =>
                setFormData({ ...formData, password: e.target.value })
              }
              required
              autoComplete="new-password"
              disabled={submitting}
              data-testid="input-password"
            />
            <p className="text-xs text-slate-500">
              Must be at least 8 characters long.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="confirmPassword" className="text-slate-700">
              Confirm password
            </Label>
            <Input
              id="confirmPassword"
              type="password"
              placeholder="••••••••"
              value={formData.confirmPassword}
              onChange={(e) =>
                setFormData({ ...formData, confirmPassword: e.target.value })
              }
              required
              autoComplete="new-password"
              disabled={submitting}
              data-testid="input-confirm-password"
            />
          </div>

          <Button
            type="submit"
            className="w-full"
            disabled={submitting}
            data-testid="button-create-account"
          >
            {submitting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Creating account…
              </>
            ) : (
              "Create account"
            )}
          </Button>
        </form>
      </div>
    );
  };

  return (
    <div className="h-screen w-full grid grid-cols-1 md:grid-cols-2 bg-white overflow-y-auto md:overflow-hidden">
      {/* ── Left: brand panel (identical to login.tsx) ── */}
      <aside className="relative hidden md:flex flex-col justify-between overflow-hidden bg-gradient-to-br from-blue-900 via-blue-800 to-blue-700 p-12 text-white">
        {/* Decorative blobs */}
        <div
          aria-hidden
          className="pointer-events-none absolute -top-24 -left-24 h-96 w-96 rounded-full bg-blue-400/20 blur-3xl"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute -bottom-32 -right-16 h-[28rem] w-[28rem] rounded-full bg-cyan-300/15 blur-3xl"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute top-1/3 right-1/4 h-40 w-40 rounded-full border border-white/10"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute top-1/2 left-1/4 h-24 w-24 rounded-full border border-white/10"
        />

        {/* Brand mark */}
        <div className="relative z-10 flex items-center gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-lg bg-white/95 backdrop-blur-sm shadow-sm">
            <img
              src={logoUrl}
              alt="OrderFlow"
              className="h-7 w-7 object-contain"
            />
          </div>
          <span className="text-lg font-semibold tracking-tight">
            OrderFlow
          </span>
        </div>

        {/* Tagline (invite-flow specific) */}
        <div className="relative z-10 max-w-md space-y-4">
          <h1 className="text-4xl font-semibold leading-tight tracking-tight">
            Welcome aboard. Let's set up your account.
          </h1>
          <p className="text-base text-blue-100/80 leading-relaxed">
            You've been invited to join your team's OrderFlow workspace —
            orders, fulfilment, NDR recovery, payroll, and the integrations
            your team already runs on, all in one place.
          </p>
        </div>

        {/* Footer */}
        <p className="relative z-10 text-xs text-blue-200/60">
          © {new Date().getFullYear()} Verge Scales Pvt Ltd · Confidential
        </p>
      </aside>

      {/* ── Right: stage-dependent body ── */}
      <main className="flex items-center justify-center p-6 md:p-12">
        <div className="w-full max-w-sm space-y-8">
          {/* Mobile-only brand mark — same treatment as login.tsx */}
          <div className="md:hidden flex items-center gap-2">
            <div className="grid h-9 w-9 place-items-center rounded-lg bg-slate-100 ring-1 ring-slate-200">
              <img
                src={logoUrl}
                alt="OrderFlow"
                className="h-6 w-6 object-contain"
              />
            </div>
            <span className="text-base font-semibold tracking-tight text-slate-900">
              OrderFlow
            </span>
          </div>

          {renderRightColumn()}
        </div>
      </main>
    </div>
  );
}
