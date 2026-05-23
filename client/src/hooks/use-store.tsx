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
// useActiveStore — Phase 3 multi-store frontend state.
//
// On mount (or whenever the signed-in user changes), the provider
// fetches GET /api/stores/me — the list of stores the current user
// has access to. The active store id is persisted to localStorage
// under `activeStoreId`, which the fetch interceptor in
// client/src/lib/queryClient.ts reads on every outbound request.
//
// Resolution order for the initial active store:
//   1. localStorage.activeStoreId — but only if it still appears in
//      the user's list (defends against a stale entry pointing at a
//      store the admin has since revoked).
//   2. The first store in the list, returned in createdAt order so
//      the legacy store stays the default for existing users.
//   3. null — when the user genuinely has no stores attached. The
//      switcher renders an empty/blocked state in that case.
//
// Switching stores does two things:
//   a. Writes the new id into localStorage and updates the React
//      state so consumers re-render with the right name.
//   b. Calls queryClient.invalidateQueries({ queryKey: ['/api'] }) so
//      the next render of any page (Overview, Orders, NDR, etc.)
//      kicks off a fresh fetch that includes the updated header.
//      We deliberately scope the invalidation to /api keys so we
//      don't nuke client-only queries (e.g. cached file uploads).
// ─────────────────────────────────────────────────────────────────────

export interface StoreSummary {
  id: string;
  storeName: string | null;
  storeUrl: string;
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
  /** True while the initial fetch is in flight. */
  loading: boolean;
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
  const { isAuthenticated, user } = useAuth();
  const queryClient = useQueryClient();

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

  // Reconcile the persisted id with the fetched list. Runs whenever
  // either changes. Three cases:
  //   • persisted id is in the list  → use it (idempotent)
  //   • persisted id is missing      → fall back to the first store
  //   • the list is empty            → clear the persisted id so the
  //                                     header is dropped on next fetch
  useEffect(() => {
    if (!isAuthenticated) {
      // Don't touch localStorage on logout flicker; the logout flow
      // does the explicit clear. Just keep the in-memory state in
      // sync with what's actually persisted.
      setActiveStoreIdState(readPersistedStoreId());
      return;
    }
    if (stores.length === 0) {
      // Authenticated but no stores attached. Clear so the header
      // doesn't carry a stale id.
      if (activeStoreId !== null) {
        writePersistedStoreId(null);
        setActiveStoreIdState(null);
      }
      return;
    }
    const persisted = readPersistedStoreId();
    const persistedStillValid =
      !!persisted && stores.some((s) => s.id === persisted);
    if (persistedStillValid) {
      // The state may have been read before stores arrived; align it.
      if (activeStoreId !== persisted) setActiveStoreIdState(persisted);
      return;
    }
    const fallback = stores[0].id;
    writePersistedStoreId(fallback);
    setActiveStoreIdState(fallback);
  }, [isAuthenticated, stores, activeStoreId]);

  // Track whether the user-driven switcher was the one that changed
  // the id. We don't want to invalidate queries on the initial
  // hydration — only on actual switches.
  const isInitialMount = useRef(true);

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

  useEffect(() => {
    // Mark the first run done after both the initial localStorage
    // read AND the first fetch have settled. Future setActiveStore
    // calls will then always be treated as switches.
    isInitialMount.current = false;
  }, []);

  const refresh = useCallback(async () => {
    await refetch();
  }, [refetch]);

  const activeStore = useMemo(
    () => stores.find((s) => s.id === activeStoreId) ?? null,
    [stores, activeStoreId],
  );

  const value = useMemo<StoreContextValue>(
    () => ({
      stores,
      activeStoreId,
      activeStore,
      loading: isLoading,
      hasMultipleStores: stores.length > 1,
      setActiveStore,
      refresh,
    }),
    [stores, activeStoreId, activeStore, isLoading, setActiveStore, refresh],
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
