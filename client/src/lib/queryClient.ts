import { QueryClient, QueryFunction } from "@tanstack/react-query";

// ─────────────────────────────────────────────────────────────────────
// Phase 3 — multi-store header interceptor.
//
// The backend's storeScope middleware (server/storeScope.ts) routes
// every authenticated request to a single tenant. The header it reads
// is `X-Active-Store-Id`; when absent the backend falls back to the
// user's first user_stores row. To make the frontend explicit about
// which store it's targeting, every fetch through `apiRequest` and
// the default React Query `getQueryFn` attaches the header from
// localStorage on the way out.
//
// localStorage is the source of truth because:
//   • It survives full page reloads (so the user doesn't bounce back
//     to the default store every time they refresh).
//   • It's accessible from non-React code paths (the AuthProvider
//     bootstrap, any direct fetch() calls in pages that haven't
//     migrated to the hook yet).
//
// The StoreProvider (client/src/hooks/use-store.tsx) is the only
// writer — it sets `activeStoreId` on selection, removes it on
// logout, and exposes a hook for components that need the current
// value reactively.
//
// SSR-safety: every read is guarded with `typeof window`, so this
// module is safe to import in environments that don't have a window
// (tests, future SSR setup).
// ─────────────────────────────────────────────────────────────────────

const STORE_ID_STORAGE_KEY = "activeStoreId";
const STORE_HEADER_NAME = "X-Active-Store-Id";

export function getActiveStoreId(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(STORE_ID_STORAGE_KEY);
  } catch {
    // Some browsers throw on localStorage access in private mode.
    // Treat as "no scope" and let the backend fallback take over.
    return null;
  }
}

// Small helper so apiRequest and getQueryFn build identical header
// blocks (just `Cache-Control` differs between read/write).
function buildHeaders(extra?: Record<string, string>): Record<string, string> {
  const headers: Record<string, string> = { ...(extra ?? {}) };
  const storeId = getActiveStoreId();
  if (storeId) {
    headers[STORE_HEADER_NAME] = storeId;
  }
  return headers;
}

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    const text = (await res.text()) || res.statusText;
    throw new Error(`${res.status}: ${text}`);
  }
}

export async function apiRequest(
  method: string,
  url: string,
  data?: unknown | undefined,
): Promise<Response> {
  const headers = buildHeaders({
    "Cache-Control": "no-cache, no-store, must-revalidate",
    "Pragma": "no-cache",
  });

  if (data) {
    headers["Content-Type"] = "application/json";
  }

  const res = await fetch(url, {
    method,
    headers,
    body: data ? JSON.stringify(data) : undefined,
    credentials: "include",
    cache: "no-store",
  });

  await throwIfResNotOk(res);
  return res;
}

type UnauthorizedBehavior = "returnNull" | "throw";
export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
  async ({ queryKey }) => {
    const res = await fetch(queryKey.join("/") as string, {
      headers: buildHeaders(),
      credentials: "include",
    });

    if (unauthorizedBehavior === "returnNull" && res.status === 401) {
      return null;
    }

    await throwIfResNotOk(res);
    return await res.json();
  };

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "throw" }),
      refetchInterval: false,
      refetchOnWindowFocus: false,
      staleTime: Infinity,
      retry: false,
    },
    mutations: {
      retry: false,
    },
  },
});
