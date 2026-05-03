import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Eye, EyeOff, Workflow } from "lucide-react";

// ─────────────────────────────────────────────────────────────────────
// Login page — split-screen premium SaaS layout.
//
// Left panel  : OrderFlow brand band on a deep-blue gradient with
//               subtle abstract decorative elements.
// Right panel : centred email + password form.
//
// Auth flow:
//   1. POST /api/auth/login (server-side bcrypt verify)
//   2. On success, write the returned user shape into localStorage
//      under the same keys the rest of the app already reads
//      (userId / userRole / userEmail / userFullName). This is the
//      transitional "shim" — Phase 2 replaces it with a real
//      session cookie / useAuth() hook.
//
// Removed from the previous implementation:
//   • Self-signup tab and "Create the first admin" flow on this page
//     (the bootstrap admin route still exists server-side; it's just
//     not surfaced here — invite-only is the steady state).
//   • Client-side password compare. The browser no longer touches
//     password material beyond posting it once over HTTPS.
// ─────────────────────────────────────────────────────────────────────

export default function LoginPage() {
  const [, setLocation] = useLocation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // If the user is already authenticated (localStorage shim), bounce
  // them to the dashboard — keeps the back-button flow tidy.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const existing = localStorage.getItem("userId");
    if (existing) setLocation("/");
  }, [setLocation]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrorMessage(null);
    if (!email || !password) {
      setErrorMessage("Please enter both your email and password.");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErrorMessage(
          (data && typeof data.error === "string" && data.error) ||
            "Unable to sign in. Please try again.",
        );
        setSubmitting(false);
        return;
      }
      // Transitional shim — same keys the existing app reads from
      // localStorage. Replaced by useAuth() in Phase 2.
      localStorage.setItem("userId", data.id);
      localStorage.setItem("userRole", data.role);
      localStorage.setItem("userEmail", data.email);
      if (data.fullName) localStorage.setItem("userFullName", data.fullName);
      setLocation("/");
    } catch (err: any) {
      setErrorMessage(err?.message ?? "Network error. Please try again.");
      setSubmitting(false);
    }
  }

  return (
    <div className="h-screen w-full grid grid-cols-1 md:grid-cols-2 bg-white">
      {/* ── Left: brand panel ── */}
      <aside className="relative hidden md:flex flex-col justify-between overflow-hidden bg-gradient-to-br from-blue-900 via-blue-800 to-blue-700 p-12 text-white">
        {/* Decorative blobs — subtle, no SVG library needed */}
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
          <div className="grid h-10 w-10 place-items-center rounded-lg bg-white/15 backdrop-blur-sm">
            <Workflow className="h-5 w-5" />
          </div>
          <span className="text-lg font-semibold tracking-tight">OrderFlow</span>
        </div>

        {/* Headline */}
        <div className="relative z-10 max-w-md space-y-4">
          <h1 className="text-4xl font-semibold leading-tight tracking-tight">
            Streamline your order operations.
          </h1>
          <p className="text-base text-blue-100/80 leading-relaxed">
            One workspace for orders, fulfilment, NDR recovery, payroll, and the
            integrations your team already runs on.
          </p>
        </div>

        {/* Foot note */}
        <p className="relative z-10 text-xs text-blue-200/60">
          © {new Date().getFullYear()} Verge Scales Pvt Ltd · Confidential
        </p>
      </aside>

      {/* ── Right: form ── */}
      <main className="flex items-center justify-center p-6 md:p-12">
        <div className="w-full max-w-sm space-y-8">
          {/* Mobile-only brand mark */}
          <div className="md:hidden flex items-center gap-2">
            <div className="grid h-9 w-9 place-items-center rounded-lg bg-blue-700 text-white">
              <Workflow className="h-4 w-4" />
            </div>
            <span className="text-base font-semibold tracking-tight text-slate-900">
              OrderFlow
            </span>
          </div>

          <div className="space-y-2">
            <h2 className="text-2xl font-semibold text-slate-900">Sign in</h2>
            <p className="text-sm text-slate-500">
              Enter your email and password to continue.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5" noValidate>
            <div className="space-y-2">
              <Label htmlFor="email" className="text-slate-700">
                Email
              </Label>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                placeholder="you@vergescales.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                disabled={submitting}
                data-testid="input-login-email"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="password" className="text-slate-700">
                Password
              </Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  disabled={submitting}
                  className="pr-10"
                  data-testid="input-login-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((s) => !s)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-slate-400 hover:text-slate-600"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  tabIndex={-1}
                >
                  {showPassword ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </button>
              </div>
            </div>

            {errorMessage && (
              <div
                role="alert"
                className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
                data-testid="login-error"
              >
                {errorMessage}
              </div>
            )}

            <Button
              type="submit"
              className="w-full"
              disabled={submitting}
              data-testid="button-login-submit"
            >
              {submitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Signing in…
                </>
              ) : (
                "Sign in"
              )}
            </Button>
          </form>

          <p className="text-center text-xs text-slate-400">
            Need access? Ask your administrator for an invite.
          </p>
        </div>
      </main>
    </div>
  );
}
