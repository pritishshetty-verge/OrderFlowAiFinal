import "dotenv/config";
import fs from "fs";
import path from "path";
import csvParser from "csv-parser";
import { db } from "../db";
import { pincodeTiers, type InsertPincodeTier } from "@shared/schema";

// ─────────────────────────────────────────────────────────────────────
// Seed pincode_tiers from the India Post `pincodes.csv` dump.
//
// Usage:
//   cd <worktree>
//   npx tsx server/scripts/seed-pincodes.ts                 # defaults to ./pincodes.csv
//   npx tsx server/scripts/seed-pincodes.ts ./some-other.csv
//
// The CSV has ~165k rows — many pincodes appear multiple times (one row
// per post office). We dedupe in memory by pincode, preferring the
// highest tier: Tier 1 > Tier 2 > Tier 3 > Unknown. That way a pincode
// that covers both a Tier-1 city and a nearby village still classifies
// as Tier 1.
//
// Insert chunks of 2,000 rows with ON CONFLICT DO NOTHING so reruns
// are safe.
// ─────────────────────────────────────────────────────────────────────

// Exact arrays from the user's spec (Pare PRD v2).
const tier1 = [
  "Ahmedabad", "Bengaluru", "Chennai", "Gurgaon", "Hyderabad", "Kolkata",
  "Mumbai", "New Delhi", "Pune", "Delhi", "Bangalore",
];
const tier2 = [
  "Agra", "Ambala", "Amravati", "Amritsar", "Ananthapur", "Asansol", "Belagavi",
  "Bhavnagar", "Bhiwandi", "Bhopal", "Bhubaneswar", "Calicut", "Aurangabad",
  "Chandigarh", "Coimbatore", "Cuttack", "Davangere", "Dhanbad", "Durg",
  "Bhilai", "Faridabad", "Gandhinagar", "Goa", "Ghaziabad", "Greater Noida",
  "Guntur", "Guwahati", "Gwalior", "Hisar", "Howrah", "Hooghly", "Huballi",
  "Dharwad", "Indore", "Jabalpur", "Jaipur", "Jalandhar", "Jalgaon",
  "Jamnagar", "Jamshedpur", "Jodhpur", "Kadapa", "Kakinada", "Kalyan",
  "Dombivli", "Kanpur", "Karnal", "Kochi", "Kolhapur", "Kota", "Kurnool",
  "Latur", "Lucknow", "Ludhiana", "Madurai", "Malegaon", "Mangaluru",
  "Mira Bhyander", "Mohali", "Moradabad", "Mysuru", "Nagpur", "Nanded",
  "Nashik", "Navi Mumbai", "Nellore", "Nizamabad", "Noida", "Panchkula",
  "Patna", "Prayagraj", "Puducherry", "Raipur", "Rajahmundry", "Rajkot",
  "Ranchi", "Rohtak", "Sagar", "Salem", "Sangli", "Satara", "Solapur",
  "Sonipat", "Surat", "Thane", "Thrissur", "Tirupathi", "Trichy",
  "Trivandrum", "Udaipur", "Vadodara", "Varanasi", "Vijayawada",
  "Vishakhapatnam", "Warangal", "Yamuna",
];
const tier3 = [
  "Ahmednagar", "Akola", "Aligarh", "Alwar", "Amalner", "Ambajogai",
  "Amreli", "Anand", "Baramati", "Bardoli", "Barshi", "Bathinda",
  "Becharaji", "Beed", "Begusarai", "Berhampur", "Bhadradri Kothagudam",
  "Bhandara", "Bharatpur", "Bharuch", "Indapur", "Islampur", "Jagityal",
  "Jalna", "Jaysingpur", "Jhansi", "Jharsuguda", "Junagadh", "Kachchh",
  "Kadi", "Kagal", "Kalol", "Kamareddy", "Karad", "Karim Nagar", "Karwar",
  "Khamgaon", "Khammam", "Kharar", "Kopargaon", "Shirdi", "Palanpur",
  "Palghar", "Boisar", "Pandharpur", "Parbhani", "Patan", "Phaltan",
  "Pimpalgaon Baswant", "Puri", "Raigad", "Raigarh", "Ratnagiri", "Ropar",
  "Sabarkantha", "Sakri", "Sambalpur", "Sangrur", "Sawantwadi", "Shahada",
  "Nandurbar", "Shahapur", "Murbad", "Shirpur", "Bhimavaram",
  "Machilipatnam", "Siddipet", "Bhusawal", "Mahabubnagar", "Silvassa",
  "Bidar", "Mahad", "Sindhudurg", "Bilaspur", "Malvan", "Sinnar",
  "Buldhana", "Mancherial", "Srikakulam", "Chalisgaon", "Mathura",
  "Tirunelveli", "Chandrapur", "Mehsana", "Tuni",
];

type Tier = "Tier 1" | "Tier 2" | "Tier 3" | "Unknown";

// Pre-lowercase once so we're not re-allocating strings on every row.
const tier1Lower = tier1.map((s) => s.toLowerCase());
const tier2Lower = tier2.map((s) => s.toLowerCase());
const tier3Lower = tier3.map((s) => s.toLowerCase());

function classify(district: string, division: string): Tier {
  const text = `${district} ${division}`.toLowerCase();
  if (tier1Lower.some((c) => text.includes(c))) return "Tier 1";
  if (tier2Lower.some((c) => text.includes(c))) return "Tier 2";
  if (tier3Lower.some((c) => text.includes(c))) return "Tier 3";
  return "Unknown";
}

// Tier priority — lower number wins when the same pincode classifies
// differently across its post offices.
const TIER_RANK: Record<Tier, number> = {
  "Tier 1": 1,
  "Tier 2": 2,
  "Tier 3": 3,
  "Unknown": 4,
};

type Staged = { pincode: string; city: string; state: string; tier: Tier };

async function main() {
  const csvArg = process.argv[2] ?? "pincodes.csv";
  const csvPath = path.resolve(process.cwd(), csvArg);
  if (!fs.existsSync(csvPath)) {
    console.error(`CSV not found at ${csvPath}`);
    console.error(
      `Hint: pass the path as an arg, e.g. npx tsx server/scripts/seed-pincodes.ts /absolute/path/pincodes.csv`,
    );
    process.exit(1);
  }
  console.log(`[seed] reading ${csvPath}`);

  const byPincode = new Map<string, Staged>();
  let scanned = 0;
  const tierCounts: Record<Tier, number> = {
    "Tier 1": 0,
    "Tier 2": 0,
    "Tier 3": 0,
    "Unknown": 0,
  };

  await new Promise<void>((resolve, reject) => {
    fs.createReadStream(csvPath)
      .pipe(csvParser())
      .on("data", (row: Record<string, string>) => {
        scanned++;
        const rawPin = (row.pincode ?? "").trim();
        if (!rawPin) return;
        const district = (row.district ?? "").trim();
        const division = (row.divisionname ?? "").trim();
        const state = (row.statename ?? "").trim();
        const officeName = (row.officename ?? "").trim();

        const tier = classify(district, division);
        const prior = byPincode.get(rawPin);
        if (!prior || TIER_RANK[tier] < TIER_RANK[prior.tier]) {
          byPincode.set(rawPin, {
            pincode: rawPin,
            city: district || officeName,
            state,
            tier,
          });
        }
      })
      .on("end", () => resolve())
      .on("error", reject);
  });

  console.log(
    `[seed] scanned ${scanned.toLocaleString()} rows, ${byPincode.size.toLocaleString()} unique pincodes`,
  );

  // Tally final tier distribution after dedupe.
  const staged = Array.from(byPincode.values());
  for (const v of staged) tierCounts[v.tier]++;
  console.log(
    `[seed] distribution: T1=${tierCounts["Tier 1"].toLocaleString()}  ` +
      `T2=${tierCounts["Tier 2"].toLocaleString()}  ` +
      `T3=${tierCounts["Tier 3"].toLocaleString()}  ` +
      `Unknown=${tierCounts["Unknown"].toLocaleString()}`,
  );

  // Insert in chunks of 2,000 with ON CONFLICT DO NOTHING.
  const all: InsertPincodeTier[] = staged;
  const chunkSize = 2000;
  let inserted = 0;
  console.log(`[seed] inserting ${all.length.toLocaleString()} rows in chunks of ${chunkSize}…`);
  for (let i = 0; i < all.length; i += chunkSize) {
    const chunk = all.slice(i, i + chunkSize);
    await db.insert(pincodeTiers).values(chunk).onConflictDoNothing();
    inserted += chunk.length;
    if ((i / chunkSize) % 5 === 0 || i + chunkSize >= all.length) {
      process.stdout.write(
        `\r[seed] ${inserted.toLocaleString()} / ${all.length.toLocaleString()}`,
      );
    }
  }
  process.stdout.write("\n");
  console.log(`[seed] done.`);
  process.exit(0);
}

main().catch((err) => {
  console.error("[seed] failed:", err);
  process.exit(1);
});
