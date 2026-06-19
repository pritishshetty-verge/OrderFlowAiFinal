import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";

// ─────────────────────────────────────────────────────────────────────
// useAuth — session-backed identity hook (Phase 0).
//
// On mount, the provider calls GET /api/auth/me to rehydrate the
// signed-in user from the server's session cookie. The cookie is set
// by POST /api/auth/login and destroyed by POST /api/auth/logout —
// see server/routes.ts.
//
// Compatibility with the existing localStorage shim:
//   The codebase has ~30 components that read
//   localStorage.getItem("userRole") / userId / userEmail directly.
//   Until those are migrated to useAuth(), we keep writing the same
//   keys on /me success so they continue to work. On 401, we clear
//   the shim so a stale localStorage entry can't outlive an expired
//   session. New code SHOULD prefer useAuth() — the localStorage
//   path is transitional and will be deleted in a follow-up.
// ─────────────────────────────────────────────────────────────────────

export interface AuthUser {
  id: string;
  email: string;
  username: string;
  fullName: string;
  role: string;
  adminType?: string | null;
  avatarImage?: string | null;
  department?: string | null;
  isActive?: boolean;
  // Whatever else the server includes — mostly the scrubbed `User`
  // shape from shared/schema. Kept open so callers can read fields
  // without us having to mirror every column here.
  [extra: string]: unknown;
}

interface AuthContextValue {
  user: AuthUser | null;
  loading: boolean;
  /** True iff a session-authenticated user is loaded. */
  isAuthenticated: boolean;
  /** Re-fetch /api/auth/me (e.g. after a profile edit). */
  refresh: () => Promise<void>;
  /** Calls POST /api/auth/logout, clears localStorage, sets user=null. */
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

// Keep the localStorage shim in lockstep with the session so legacy
// components reading from localStorage stay correct. Once those are
// migrated to useAuth(), this helper can disappear.
function writeShim(u: AuthUser | null) {
  if (typeof window === "undefined") return;
  if (u) {
    localStorage.setItem("userId", u.id);
    localStorage.setItem("userRole", u.role);
    localStorage.setItem("userEmail", u.email);
    if (u.fullName) localStorage.setItem("userFullName", u.fullName);
    // Per-user module access grants — mirrored so route guards read them
    // synchronously (see client/src/lib/access.ts).
    localStorage.setItem(
      "moduleAccess",
      JSON.stringify(Array.isArray((u as any).moduleAccess) ? (u as any).moduleAccess : []),
    );
  } else {
    localStorage.removeItem("userId");
    localStorage.removeItem("userRole");
    localStorage.removeItem("userEmail");
    localStorage.removeItem("userFullName");
    localStorage.removeItem("moduleAccess");
    // Phase 3: clear the active store id on logout so a subsequent
    // login by a different user doesn't inherit the previous one's
    // store selection (or worse, send a header for a store the new
    // user has no access to — the backend would 403).
    localStorage.removeItem("activeStoreId");
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/auth/me", { credentials: "include" });
      if (res.status === 200) {
        const u = (await res.json()) as AuthUser;
        setUser(u);
        writeShim(u);
      } else if (res.status === 401 || res.status === 403) {
        setUser(null);
        writeShim(null);
      } else {
        // Network blip / 5xx: don't nuke a previously-known user; just
        // leave the existing state in place. The next refresh will
        // either confirm or clear.
        console.warn(`[useAuth] /api/auth/me returned ${res.status}; keeping prior state`);
      }
    } catch (err) {
      console.warn("[useAuth] /api/auth/me network error:", err);
      // Same as above — preserve last-known state on transient failure.
    } finally {
      setLoading(false);
    }
  }, []);

  const logout = useCallback(async () => {
    try {
      await fetch("/api/auth/logout", {
        method: "POST",
        credentials: "include",
      });
    } catch (err) {
      // Even on a network failure, clear local state — the cookie
      // may already be gone, and the user shouldn't be stuck in a
      // half-authenticated UI.
      console.warn("[useAuth] /api/auth/logout failed:", err);
    }
    setUser(null);
    writeShim(null);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        isAuthenticated: !!user,
        refresh,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within <AuthProvider>");
  }
  return ctx;
}
