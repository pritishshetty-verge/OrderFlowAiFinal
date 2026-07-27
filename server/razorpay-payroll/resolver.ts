/**
 * RazorpayX email resolver.
 *
 * The sync side of OrderFlow uses `@vergescales.com` work emails, but
 * RazorpayX has each agent under their personal Gmail. Rather than
 * maintain a separate mapping field in OrderFlow, we fetch the
 * RazorpayX roster live at sync time and match each OrderFlow user to
 * their RazorpayX employee by NAME — then use whatever email RazorpayX
 * has on file for the attendance push.
 *
 * Trade-off: a name mismatch in RazorpayX (e.g. an employee labeled
 * with the wrong name) will fail to resolve and the user will be
 * skipped with a clear reason. That's the right failure mode — fix it
 * in RazorpayX, then re-run. No silent fallback.
 */
import { peopleView } from "./client";

export interface RzpEmployee {
  id: number;
  name: string;
  email: string;
  active: boolean;
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z]/g, "");

/**
 * Fetch every active employee from RazorpayX by iterating employee-id
 * from 1 upward. Stops once we've seen N consecutive "not found" misses
 * (RazorpayX returns code 8 for unknown ids) so we don't keep probing
 * forever on a small roster. Inactive (dismissed) employees are
 * dropped — they shouldn't receive new attendance.
 */
export async function fetchRazorpayEmployees(opts?: {
  maxId?: number;
  consecutiveMissThreshold?: number;
}): Promise<RzpEmployee[]> {
  const maxId = opts?.maxId ?? 30;
  const missCap = opts?.consecutiveMissThreshold ?? 6;
  const out: RzpEmployee[] = [];
  let consecMisses = 0;
  for (let id = 1; id <= maxId && consecMisses < missCap; id++) {
    const r = await peopleView({ "employee-id": id, "employee-type": "employee" });
    if (!r.ok) {
      consecMisses++;
      continue;
    }
    consecMisses = 0;
    const b: any = r.body ?? {};
    if (b.is_active === false) continue;
    out.push({
      id,
      name: b.name ?? "",
      email: b.email ?? "",
      active: !!b.is_active,
    });
  }
  return out;
}

/**
 * Build a name → email lookup from a RazorpayX roster.
 *
 *  Tier 1: exact normalized match against the RZP employee's *name*.
 *  Tier 2: any 4+ char token in the OF name matches a 4+ char token in
 *          the RZP name (tolerates word ordering, middle initials).
 *  Tier 3: any 4+ char token in the OF name appears in the *local part*
 *          of the RZP employee's email. Catches the case where RZP has
 *          a mislabeled name field but the personal Gmail still
 *          contains the agent's real name (e.g. RZP name "Vani Sirohi" /
 *          email chandichaudhary.11@gmail.com → matches "Chandi Chaudhary").
 *
 * Returns null when nothing matches — caller decides what to do.
 */
export function buildEmailResolver(roster: RzpEmployee[]): (fullName: string) => string | null {
  const exact = new Map<string, string>();
  const byNameToken = new Map<string, string>();
  const byEmailLocal: { local: string; email: string }[] = [];
  for (const e of roster) {
    const key = norm(e.name);
    if (key && !exact.has(key)) exact.set(key, e.email);
    for (const tok of e.name.split(/\s+/).filter(Boolean)) {
      const t = norm(tok);
      if (t.length >= 4 && !byNameToken.has(t)) byNameToken.set(t, e.email);
    }
    // Index the email's local part with non-letters stripped so a token
    // like "chandi" still finds "chandichaudhary.11@gmail.com".
    const local = (e.email ?? "").split("@")[0] ?? "";
    const localLetters = local.toLowerCase().replace(/[^a-z]/g, "");
    if (localLetters) byEmailLocal.push({ local: localLetters, email: e.email });
  }
  return (fullName: string) => {
    const k = norm(fullName);
    if (!k) return null;
    const hit = exact.get(k);
    if (hit) return hit;
    const tokens = fullName.split(/\s+/).filter(Boolean).map((t) => norm(t)).filter((t) => t.length >= 4);
    // Tier 2: name-token match
    for (const t of tokens) {
      const m = byNameToken.get(t);
      if (m) return m;
    }
    // Tier 3: token appears in some email's local part
    for (const t of tokens) {
      const hit = byEmailLocal.find((e) => e.local.includes(t));
      if (hit) return hit.email;
    }
    return null;
  };
}
