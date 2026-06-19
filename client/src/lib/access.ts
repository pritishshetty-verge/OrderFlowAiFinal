// Per-user page/module access (additive grants on top of the role baseline).
//
// The logged-in user's granted module keys are mirrored into localStorage at
// login (alongside userRole), so route guards can read them synchronously.

export function getGrantedModules(): string[] {
  try {
    const raw = localStorage.getItem("moduleAccess");
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}

export function hasModuleAccess(key: string): boolean {
  return getGrantedModules().includes(key);
}

// Maps a route path to the module key that grants access to it. Used by the
// route guards so a granted user on a restricted role isn't redirected away.
export const PATH_ACCESS_MODULE: Record<string, string> = {
  "/abandoned-carts": "abandoned_carts",
};

/** True if the current user has been granted access to `path` via a module. */
export function pathGrantedByModule(path: string): boolean {
  const key = PATH_ACCESS_MODULE[path];
  return !!key && hasModuleAccess(key);
}
