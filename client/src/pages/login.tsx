import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Eye, EyeOff, TrendingUp, Activity } from "lucide-react";
// Same logo asset the sidebar uses — `@assets` is the Vite alias for
// `attached_assets/` (see vite.config.ts). The asset itself is a small
// PNG with a transparent background, which is why we render it inside
// a translucent white rounded tile on the dark gradient panel — the
// tile gives it a clean light backdrop without needing a CSS invert
// filter that would distort the brand colours.
import logoUrl from "@assets/Orderflow_Icon[1]_1761724429427.png";

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
        // `credentials: "include"` is the explicit form — same-origin
        // requests carry cookies by default, but being explicit
        // future-proofs the call if the frontend ever moves to a
        // different domain than the API.
        credentials: "include",
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
      localStorage.setItem("moduleAccess", JSON.stringify(Array.isArray(data.moduleAccess) ? data.moduleAccess : []));
      localStorage.setItem("userEmail", data.email);
      if (data.fullName) localStorage.setItem("userFullName", data.fullName);
      setLocation("/");
    } catch (err: any) {
      setErrorMessage(err?.message ?? "Network error. Please try again.");
      setSubmitting(false);
    }
  }

  // Stagger entrance: each item appears after the previous with a tiny
  // delay. Reused on both panels for a unified feel.
  const stagger = {
    hidden: { opacity: 0 },
    show: { opacity: 1, transition: { staggerChildren: 0.12, delayChildren: 0.05 } },
  };
  const item = {
    hidden: { opacity: 0, y: 18 },
    show: { opacity: 1, y: 0, transition: { duration: 0.65, ease: [0.22, 1, 0.36, 1] as const } },
  };

  // Headline split into words so each fades in one-by-one (Linear-style).
  const headline = "Streamline your order operations.".split(" ");

  return (
    <div className="h-screen w-full grid grid-cols-1 md:grid-cols-2 bg-background overflow-hidden">
      {/* ── Left: brand panel ── */}
      <aside
        className="relative hidden md:flex flex-col justify-between overflow-hidden p-12"
        style={{
          backgroundImage: "var(--brand-gradient)",
          color: "hsl(var(--brand-foreground))",
        }}
      >
        {/* ── Ambient layers ── */}
        {/* Subtle dot grid — instant "designed product" cue, very low alpha. */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-[0.18]"
          style={{
            backgroundImage:
              "radial-gradient(rgba(255,255,255,0.6) 1px, transparent 1px)",
            backgroundSize: "22px 22px",
          }}
        />

        {/* Slow-drifting gradient orbs (framer-motion infinite easing). */}
        <motion.div
          aria-hidden
          className="pointer-events-none absolute -top-32 -left-32 h-[26rem] w-[26rem] rounded-full bg-white/20 blur-3xl"
          animate={{ x: [0, 40, 0], y: [0, 28, 0] }}
          transition={{ duration: 16, repeat: Infinity, ease: "easeInOut" }}
        />
        <motion.div
          aria-hidden
          className="pointer-events-none absolute -bottom-40 -right-20 h-[32rem] w-[32rem] rounded-full bg-black/20 blur-3xl"
          animate={{ x: [0, -30, 0], y: [0, -36, 0] }}
          transition={{ duration: 20, repeat: Infinity, ease: "easeInOut" }}
        />
        <motion.div
          aria-hidden
          className="pointer-events-none absolute top-1/2 left-1/3 h-44 w-44 rounded-full border border-white/15"
          animate={{ scale: [1, 1.08, 1], opacity: [0.5, 0.8, 0.5] }}
          transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }}
        />
        <motion.div
          aria-hidden
          className="pointer-events-none absolute top-1/4 right-1/3 h-24 w-24 rounded-full border border-white/15"
          animate={{ scale: [1, 1.15, 1], opacity: [0.4, 0.7, 0.4] }}
          transition={{ duration: 6, repeat: Infinity, ease: "easeInOut", delay: 1.2 }}
        />

        {/* ── Hero logo tile (top-right, fully visible) ────────────────
            A large rounded frosted-glass tile containing the OrderFlow
            mark. Sits in the upper-right, framed by a soft white bloom
            and a faint outer ring. Slow breath + drift sells motion
            without bleeding off the canvas. */}
        <motion.div
          aria-hidden
          className="pointer-events-none absolute top-12 right-12 h-56 w-56"
          initial={{ opacity: 0, scale: 0.85, y: -10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          transition={{ duration: 1.1, ease: [0.22, 1, 0.36, 1], delay: 0.2 }}
        >
          {/* Soft bloom behind */}
          <div className="absolute -inset-10 rounded-full bg-white/25 blur-3xl" />
          {/* Faint outer ring — adds the "designed" feel */}
          <motion.div
            className="absolute -inset-6 rounded-3xl border border-white/20"
            animate={{ scale: [1, 1.03, 1], opacity: [0.5, 0.8, 0.5] }}
            transition={{ duration: 7, repeat: Infinity, ease: "easeInOut" }}
          />
          {/* Frosted glass tile holding the logo */}
          <motion.div
            className="relative h-full w-full rounded-3xl bg-white/95 shadow-2xl flex items-center justify-center backdrop-blur-sm"
            animate={{ y: [0, -8, 0] }}
            transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }}
          >
            <img src={logoUrl} alt="" className="h-32 w-32 object-contain" />
          </motion.div>
        </motion.div>

        {/* ── Foreground content (staggered entrance) ── */}
        <motion.div
          variants={stagger}
          initial="hidden"
          animate="show"
          className="relative z-10 flex flex-col h-full justify-between"
        >
          {/* Brand mark */}
          <motion.div variants={item} className="flex items-center gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-xl bg-white/95 shadow-lg">
              <img src={logoUrl} alt="OrderFlow" className="h-7 w-7 object-contain" />
            </div>
            <span className="text-lg font-semibold tracking-tight">OrderFlow</span>
            <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-white/10 backdrop-blur-sm border border-white/20 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider">
              Verge Scales
            </span>
          </motion.div>

          {/* Headline — words fade in one-by-one. */}
          <div className="max-w-md space-y-5">
            <motion.h1
              variants={stagger}
              className="text-5xl font-semibold leading-[1.1] tracking-tight"
            >
              {headline.map((w, i) => (
                <motion.span key={i} variants={item} className="inline-block mr-[0.25em]">
                  {w}
                </motion.span>
              ))}
            </motion.h1>
            <motion.p variants={item} className="text-base opacity-80 leading-relaxed max-w-md">
              One workspace for orders, fulfilment, NDR recovery, payroll, and the
              integrations your team already runs on.
            </motion.p>

            {/* Tiny feature chips — keep it minimal */}
            <motion.div variants={item} className="flex flex-wrap items-center gap-2 pt-2">
              {[
                { icon: TrendingUp, label: "Live order ops" },
                { icon: Activity, label: "Real-time analytics" },
              ].map((c) => (
                <span
                  key={c.label}
                  className="inline-flex items-center gap-1.5 rounded-full bg-white/10 backdrop-blur-sm border border-white/20 px-2.5 py-1 text-xs font-medium"
                >
                  <c.icon className="h-3 w-3" />
                  {c.label}
                </span>
              ))}
            </motion.div>
          </div>

          {/* Foot note */}
          <motion.p variants={item} className="text-xs opacity-60">
            © {new Date().getFullYear()} Verge Scales Pvt Ltd · Confidential
          </motion.p>
        </motion.div>
      </aside>

      {/* ── Right: form ── */}
      <main className="flex items-center justify-center p-6 md:p-12 relative">
        {/* A faint radial backdrop so the form has a soft "spotlight" feel. */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-60"
          style={{
            backgroundImage:
              "radial-gradient(ellipse at center, hsl(var(--brand) / 0.06), transparent 60%)",
          }}
        />
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1], delay: 0.2 }}
          className="relative w-full max-w-sm space-y-8"
        >
          {/* Mobile-only brand mark — uses a tinted tile so the logo
              keeps its natural colours, matching the desktop panel. */}
          <div className="md:hidden flex items-center gap-2">
            <div className="grid h-9 w-9 place-items-center rounded-lg bg-muted ring-1 ring-border">
              <img
                src={logoUrl}
                alt="OrderFlow"
                className="h-6 w-6 object-contain"
              />
            </div>
            <span className="text-base font-semibold tracking-tight text-foreground">
              OrderFlow
            </span>
          </div>

          <div className="space-y-2">
            <h2 className="text-2xl font-semibold tracking-tight text-foreground">Welcome back</h2>
            <p className="text-sm text-muted-foreground">
              Sign in to continue to OrderFlow.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5" noValidate>
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
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
              <Label htmlFor="password">Password</Label>
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
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:text-foreground"
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
                className="rounded-xl border border-red-500/20 bg-red-500/10 px-3 py-2 text-sm text-red-600 dark:text-red-400"
                data-testid="login-error"
              >
                {errorMessage}
              </div>
            )}

            <Button
              type="submit"
              className="w-full shadow-sm transition-shadow hover:shadow-md"
              style={{ backgroundImage: "var(--brand-gradient)", color: "hsl(var(--brand-foreground))" }}
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

          <p className="text-center text-xs text-muted-foreground">
            Need access? Ask your administrator for an invite.
          </p>
        </motion.div>
      </main>
    </div>
  );
}
