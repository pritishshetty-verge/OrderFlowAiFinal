import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";

// ─────────────────────────────────────────────────────────────────────
// useActiveStore — multi-store frontend state.
//
// Source of truth flow:
//
//   AuthProvider     /api/auth/me        →  user, isAuthenticated
//   StoreProvider    /api/stores/me      →  stores[]
//   localStorage     "activeStoreId"     →  cross-reload persistence
//   In-memory state  activeStoreId       →  React-reactive copy
//
// The provider's job is to keep all four aligned through the boot
// sequence and across user-driven switches without ever flashing the
// wrong store. The original implementation had a race condition: the
// reconciliation effect would fire during the loading window between
// `isAuthenticated = true` and `/api/stores/me` resolving, see
// `stores = []`, and incorrectly clear the persisted id — falling
// back to `stores[0]` once the fetch settled (i.e. always the legacy
// OLB store). That's been replaced with a deterministic single-shot
// reconciliation, gated on the query actually having returned data
// (`data !== undefined`), with a `useRef` guard so subsequent
// invalidations don't clobber user-driven switches.
//
// Resolution order on first arrival:
//   1. localStorage.activeStoreId — but only if it still appears in
//      the user's list (defends against a stale entry pointing at a
//      store the admin has since revoked).
//   2. The first store in the list (oldest createdAt) so existing
//      single-store deployments default to the legacy store.
//   3. null — when the user genuinely has zero memberships.
//
// Switching stores does three things:
//   a. Writes the new id into localStorage.
//   b. Updates React state so consumers re-render.
//   c. Calls queryClient.invalidateQueries() on every /api key so the
//      next render of any page fetches with the new header.
// ─────────────────────────────────────────────────────────────────────

export interface StoreSummary {
  id: string;
  storeName: string | null;
  storeUrl: string;
  /**
   * Optional workspace logo — either a base64 data URI uploaded
   * through Settings → Workspace, or a plain http(s) URL. The
   * StoreSwitcher renders this in the avatar tile when present and
   * falls back to a deterministic gradient avatar otherwise.
   */
  logoUrl: string | null;
  isActive: boolean | null;
  createdAt: string | null;
}

interface StoresMeResponse {
  stores: StoreSummary[];
}

interface StoreContextValue {
  /** All stores the current user can switch to. Empty when not authenticated. */
  stores: StoreSummary[];
  /** The currently active store id (matches localStorage.activeStoreId). */
  activeStoreId: string | null;
  /** The full store object for activeStoreId, for display convenience. */
  activeStore: StoreSummary | null;
  /**
   * Legacy "the stores-me query is in flight" flag. Prefer `bootLoading`
   * for new code — it also covers the auth bootstrap window so consumers
   * never see a false "no stores" state between auth-success and the
   * first stores-me response.
   */
  loading: boolean;
  /**
   * Authoritative "we don't know yet" flag. True while either:
   *   • AuthProvider is still rehydrating from /api/auth/me, or
   *   • Auth is settled to a logged-in user but /api/stores/me hasn't
   *     returned its first response yet.
   *
   * Components that gate skeletons vs empty-states (e.g. StoreSwitcher)
   * MUST use this flag, not `loading`. Using `loading` alone lets the
   * "No store assigned" branch render briefly while auth is still
   * loading, because the query is disabled during that window and
   * `loading` is consequently `false`.
   */
  bootLoading: boolean;
  /** True iff the user has more than one accessible store. */
  hasMultipleStores: boolean;
  /**
   * Switch the active store. Persists to localStorage and invalidates
   * /api queries so consumers refetch with the new header.
   */
  setActiveStore: (storeId: string) => void;
  /** Force a refresh of the store list (e.g. after admin grants access). */
  refresh: () => Promise<void>;
}

const StoreContext = createContext<StoreContextValue | undefined>(undefined);

const STORE_ID_STORAGE_KEY = "activeStoreId";

function readPersistedStoreId(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(STORE_ID_STORAGE_KEY);
  } catch {
    return null;
  }
}

function writePersistedStoreId(id: string | null): void {
  if (typeof window === "undefined") return;
  try {
    if (id) {
      window.localStorage.setItem(STORE_ID_STORAGE_KEY, id);
    } else {
      window.localStorage.removeItem(STORE_ID_STORAGE_KEY);
    }
  } catch {
    /* private-mode browsers can throw; the header just falls back */
  }
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const { isAuthenticated, user, loading: authLoading } = useAuth();
  const queryClient = useQueryClient();

  // Initial state seeded from localStorage so a refresh on the same
  // tenant keeps the right id during the brief auth-loading window —
  // the StoreSwitcher reads activeStoreId immediately to size the
  // skeleton appropriately.
  const [activeStoreId, setActiveStoreIdState] = useState<string | null>(
    readPersistedStoreId,
  );

  // We only fetch /api/stores/me once the user is authenticated.
  // `enabled` keys the query off auth state so a logged-out tab
  // doesn't 401-spam the endpoint. Including user?.id in the key
  // means switching accounts (rare but possible during dev) re-fetches.
  const {
    data,
    isLoading,
    refetch,
  } = useQuery<StoresMeResponse>({
    queryKey: ["/api/stores/me", user?.id ?? "anon"],
    queryFn: async () => {
      const res = await fetch("/api/stores/me", {
        credentials: "include",
      });
      if (!res.ok) {
        // 401 means the session expired between the AuthProvider's
        // bootstrap and this fetch. Return an empty list rather than
        // throwing — the user is about to be bounced to /login anyway.
        if (res.status === 401) return { stores: [] };
        throw new Error(
          `Failed to load stores: ${res.status} ${res.statusText}`,
        );
      }
      return (await res.json()) as StoresMeResponse;
    },
    enabled: isAuthenticated,
    staleTime: 5 * 60 * 1000, // 5 min — store membership rarely changes mid-session
  });

  const stores = useMemo(() => data?.stores ?? [], [data]);

  // ── Reconciliation, deterministic edition ─────────────────────────
  //
  // The previous implementation depended on `activeStoreId` (which
  // re-triggered on every switch) AND treated `stores.length === 0`
  // as "the user has no memberships," conflating it with the loading
  // window. That caused localStorage to be wiped during boot.
  //
  // New rules:
  //   • Gate on `data` (the raw query result). If data is undefined,
  //     we're still loading — do absolutely nothing.
  //   • Reset the ref guard whenever the user changes (login /
  //     logout). Each authenticated session reconciles exactly once
  //     on first arrival.
  //   • On every subsequent fetch (e.g. after Manage Access changed
  //     the user's membership server-side), we re-validate the
  //     persisted id and fall back if it's been revoked. We do NOT
  //     reset state to localStorage on every refetch — the only
  //     legitimate state mutation after the first reconciliation is
  //     `setActiveStore`.
  const hasReconciledRef = useRef(false);

  // Reset the reconciliation guard when the authenticated user
  // identity changes. Otherwise a logout → login as a different
  // account would skip reconciliation and inherit the previous
  // user's activeStoreId state.
  useEffect(() => {
    hasReconciledRef.current = false;
  }, [user?.id, isAuthenticated]);

  useEffect(() => {
    if (!isAuthenticated) return;
    // Wait until the query has actually resolved. While `data` is
    // undefined the query is in flight (or disabled); either way we
    // have no authoritative list to reconcile against and must not
    // touch localStorage.
    if (data === undefined) return;

    const fetched = data.stores;
    if (fetched.length === 0) {
      // Authenticated, fetch settled, user truly has no memberships.
      // Drop the persisted id so the header doesn't carry a stale
      // value. We do this on every fetch (not just the first) so a
      // revoked-all-access scenario clears cleanly.
      if (readPersistedStoreId() !== null) writePersistedStoreId(null);
      if (activeStoreId !== null) setActiveStoreIdState(null);
      hasReconciledRef.current = true;
      return;
    }

    const persisted = readPersistedStoreId();
    const persistedStillValid =
      !!persisted && fetched.some((s) => s.id === persisted);

    if (persistedStillValid) {
      // Steady state.
      //
      // First arrival per session: align in-memory state to the
      // persisted value. This handles the case where useState's
      // lazy initializer read localStorage before stores arrived
      // and we want to make sure the activeStore object resolves
      // correctly downstream.
      //
      // Subsequent arrivals (refetch after invalidateQueries): do
      // NOTHING. The user-driven switch already updated state +
      // localStorage; the refetch should not override that.
      if (!hasReconciledRef.current) {
        if (activeStoreId !== persisted) setActiveStoreIdState(persisted);
        hasReconciledRef.current = true;
      }
      return;
    }

    // Persisted id is missing or stale (admin revoked access to
    // that store, or this is the user's first session). Fall back
    // to the oldest store the user can see and persist it.
    const fallback = fetched[0].id;
    writePersistedStoreId(fallback);
    setActiveStoreIdState(fallback);
    hasReconciledRef.current = true;
    // We intentionally don't include `activeStoreId` here — that's
    // exactly the feedback loop the old code suffered from. Reads of
    // activeStoreId inside this effect are deliberately stale; the
    // ref guard guarantees idempotency.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated, data]);

  const setActiveStore = useCallback(
    (storeId: string) => {
      if (storeId === activeStoreId) return; // no-op
      writePersistedStoreId(storeId);
      setActiveStoreIdState(storeId);
      // Invalidate all /api queries so every page refetches with the
      // new header. predicate is the lowest-common-denominator way to
      // hit every key shape — array keys, string keys, nested arrays.
      // Anything not starting with /api is left alone.
      queryClient.invalidateQueries({
        predicate: (q) => {
          const first = Array.isArray(q.queryKey)
            ? q.queryKey[0]
            : q.queryKey;
          return typeof first === "string" && first.startsWith("/api");
        },
      });
    },
    [activeStoreId, queryClient],
  );

  const refresh = useCallback(async () => {
    await refetch();
  }, [refetch]);

  const activeStore = useMemo(
    () => stores.find((s) => s.id === activeStoreId) ?? null,
    [stores, activeStoreId],
  );

  // The authoritative "still booting" flag. Combines the two windows
  // that the old code didn't span:
  //   1. Auth in flight (AuthProvider hasn't rehydrated yet)
  //   2. Auth settled to a logged-in user, but /api/stores/me hasn't
  //      returned its first payload (`data === undefined`).
  // Once either is no longer true, consumers can treat the state as
  // fully settled and render real content (or the empty state).
  const bootLoading =
    authLoading || (isAuthenticated && data === undefined);

  const value = useMemo<StoreContextValue>(
    () => ({
      stores,
      activeStoreId,
      activeStore,
      loading: isLoading,
      bootLoading,
      hasMultipleStores: stores.length > 1,
      setActiveStore,
      refresh,
    }),
    [
      stores,
      activeStoreId,
      activeStore,
      isLoading,
      bootLoading,
      setActiveStore,
      refresh,
    ],
  );

  return (
    <StoreContext.Provider value={value}>{children}</StoreContext.Provider>
  );
}

export function useActiveStore(): StoreContextValue {
  const ctx = useContext(StoreContext);
  if (!ctx) {
    throw new Error("useActiveStore must be used within <StoreProvider>");
  }
  return ctx;
}
