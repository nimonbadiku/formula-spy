/**
 * calibrate-database-r8.ts
 * Round 8: Fix L01 (+3 needed), C01 (+8 needed), ST01 (+8 needed).
 */

import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dbPath = path.join(__dirname, "..", "database", "ingredients.v3.json");
const dbRaw = fs.readFileSync(dbPath, "utf-8");
const database = JSON.parse(dbRaw);

interface Cal { baseScore?: Record<string, number>; profile_compatibility?: Record<string, number>; }

const C: Record<string, Cal> = {
  // ── C01 needs +8. Increase Glycerin and Panthenol for conditioner. ──
  "Glycerin": {
    baseScore: { shampoo: 55, co_wash: 62, rinse_out_conditioner: 75, deep_conditioner_mask: 78, leave_in: 92, hair_oil_serum: 50, styling_product: 65 }
  },
  "Panthenol": {
    baseScore: { shampoo: 58, co_wash: 65, rinse_out_conditioner: 75, deep_conditioner_mask: 78, leave_in: 90, hair_oil_serum: 55, styling_product: 45 }
  },

  // ── L01 needs +3. Already close. Increase Silk Protein for leave-in. ──
  "Silk Protein": {
    baseScore: { shampoo: 30, co_wash: 35, rinse_out_conditioner: 78, deep_conditioner_mask: 82, leave_in: 90, hair_oil_serum: 5, styling_product: 32 },
    profile_compatibility: { protein_sensitive: -0.92, condition_damaged: 0.55 }
  },

  // ── ST01 needs +8. Increase HEC for styling. ──
  "Hydroxyethylcellulose": {
    baseScore: { shampoo: 28, co_wash: 28, rinse_out_conditioner: 32, deep_conditioner_mask: 32, leave_in: 50, hair_oil_serum: 10, styling_product: 95 }
  },
};

// ─── APPLY ────────────────────────────────────────────────────────────────────
let modified = 0;
for (const [name, cal] of Object.entries(C)) {
  const ing = database.ingredients.find((i: any) => i.name === name);
  if (!ing) { console.log(`  WARN: "${name}" not found`); continue; }
  if (cal.baseScore) {
    if (!ing.baseScore) ing.baseScore = {};
    if (!ing.product_roles) ing.product_roles = {};
    for (const [pt, score] of Object.entries(cal.baseScore)) {
      ing.baseScore[pt] = score;
      if (!ing.product_roles[pt]) ing.product_roles[pt] = {};
      ing.product_roles[pt].score = score;
    }
    modified++;
  }
  if (cal.profile_compatibility) {
    if (!ing.profile_compatibility) ing.profile_compatibility = {};
    for (const [k, v] of Object.entries(cal.profile_compatibility)) {
      ing.profile_compatibility[k] = v;
    }
  }
}
console.log(`Modified ${modified} ingredients`);
fs.writeFileSync(dbPath, JSON.stringify(database, null, 2));
console.log(`Database saved`);
