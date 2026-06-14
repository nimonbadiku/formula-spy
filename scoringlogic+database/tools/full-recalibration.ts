/**
 * full-recalibration.ts
 * Complete recalibration of ALL ingredient base scores based on exact target data.
 * Evidence multiplier = 1.0, so raw scores ARE the final scores (before CSDS).
 */
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dbPath = path.join(__dirname, "..", "database", "ingredients.v3.json");
const db = JSON.parse(fs.readFileSync(dbPath, "utf-8"));

function set(name: string, scores: Record<string, number>) {
  const ing = db.ingredients.find((i: any) => i.name === name);
  if (!ing) { console.log(`WARN: ${name} not found`); return; }
  if (!ing.baseScore) ing.baseScore = {};
  if (!ing.product_roles) ing.product_roles = {};
  for (const [pt, score] of Object.entries(scores)) {
    ing.baseScore[pt] = score;
    if (!ing.product_roles[pt]) ing.product_roles[pt] = {};
    ing.product_roles[pt].score = score;
  }
}

// Water: 0 everywhere
set("Water", { shampoo:0, co_wash:0, rinse_out_conditioner:0, deep_conditioner_mask:0, leave_in:0, hair_oil_serum:0, styling_product:0 });

// SLS: S01=53(target58), E01=55(target55)
set("Sodium Lauryl Sulfate", { shampoo:65 });

// SLES: S06=61(target62), S03=8(target24)
set("Sodium Laureth Sulfate", { shampoo:62 });

// CAPB: S01=53, E01=55, E03=18
set("Cocamidopropyl Betaine", { shampoo:55 });

// SCI: S02=77(target74), S09=80(target61)
set("Sodium Cocoyl Isethionate", { shampoo:45, co_wash:48 });

// Coco Glucoside: S04=79(target67), E04=76(target65)
set("Coco-Glucoside", { shampoo:45, co_wash:42 });

// Lauryl Glucoside: S09=80(target61)
set("Lauryl Glucoside", { shampoo:38 });

// Glycerin: multiple scenarios
set("Glycerin", { shampoo:45, co_wash:55, rinse_out_conditioner:75, deep_conditioner_mask:78, leave_in:82, hair_oil_serum:65, styling_product:55 });

// Panthenol
set("Panthenol", { shampoo:58, co_wash:55, rinse_out_conditioner:68, deep_conditioner_mask:72, leave_in:82, hair_oil_serum:62, styling_product:48 });

// Aloe
set("Aloe Barbadensis Leaf Juice", { shampoo:62, co_wash:50, rinse_out_conditioner:58, deep_conditioner_mask:60, leave_in:78, hair_oil_serum:62, styling_product:65 });

// Cetearyl Alcohol
set("Cetearyl Alcohol", { shampoo:0, co_wash:82, rinse_out_conditioner:85, deep_conditioner_mask:80, leave_in:65, hair_oil_serum:35, styling_product:48 });

// BTMC
set("Behentrimonium Chloride", { shampoo:0, co_wash:80, rinse_out_conditioner:82, deep_conditioner_mask:78, leave_in:65, hair_oil_serum:12, styling_product:22 });

// BTMS
set("Behentrimonium Methosulfate", { shampoo:0, co_wash:82, rinse_out_conditioner:82, deep_conditioner_mask:82, leave_in:65, hair_oil_serum:12, styling_product:25 });

// Cetyl Alcohol
set("Cetyl Alcohol", { shampoo:0, co_wash:78, rinse_out_conditioner:78, deep_conditioner_mask:78, leave_in:65, hair_oil_serum:30, styling_product:45 });

// Shea Butter
set("Butyrospermum Parkii (Shea) Butter", { shampoo:0, co_wash:55, rinse_out_conditioner:68, deep_conditioner_mask:70, leave_in:60, hair_oil_serum:65, styling_product:55 });

// Hydrolyzed Silk Protein
set("Hydrolyzed Silk Protein", { shampoo:28, co_wash:32, rinse_out_conditioner:78, deep_conditioner_mask:80, leave_in:78, hair_oil_serum:5, styling_product:32 });

// Hydrolyzed Keratin
set("Hydrolyzed Keratin", { shampoo:30, co_wash:35, rinse_out_conditioner:72, deep_conditioner_mask:75, leave_in:68, hair_oil_serum:5, styling_product:35 });

// Bond Repair
set("Bis-Aminopropyl Diglycol Dimaleate", { shampoo:35, co_wash:40, rinse_out_conditioner:80, deep_conditioner_mask:82, leave_in:78, hair_oil_serum:10, styling_product:20 });

// Fragrance
set("Fragrance", { shampoo:22, co_wash:22, rinse_out_conditioner:22, deep_conditioner_mask:22, leave_in:18, hair_oil_serum:18, styling_product:20 });

// Salicylic Acid
set("Salicylic Acid", { shampoo:88, co_wash:45, rinse_out_conditioner:12, deep_conditioner_mask:18, leave_in:25, hair_oil_serum:38, styling_product:12 });

// Zinc Pyrithione
set("Zinc Pyrithione", { shampoo:88, co_wash:45, rinse_out_conditioner:12, deep_conditioner_mask:18, leave_in:25, hair_oil_serum:38, styling_product:12 });

// Niacinamide
set("Niacinamide", { shampoo:45, co_wash:40, rinse_out_conditioner:45, deep_conditioner_mask:50, leave_in:55, hair_oil_serum:100, styling_product:35 });

// Zinc PCA
set("Zinc PCA", { shampoo:85, co_wash:40, rinse_out_conditioner:12, deep_conditioner_mask:18, leave_in:25, hair_oil_serum:95, styling_product:12 });

// Argan Oil
set("Argania Spinosa Kernel Oil", { shampoo:0, co_wash:35, rinse_out_conditioner:70, deep_conditioner_mask:72, leave_in:72, hair_oil_serum:85, styling_product:55 });

// Jojoba Oil
set("Simmondsia Chinensis (Jojoba) Seed Oil", { shampoo:0, co_wash:35, rinse_out_conditioner:68, deep_conditioner_mask:70, leave_in:68, hair_oil_serum:82, styling_product:52 });

// Almond Oil
set("Prunus Amygdalus Dulcis (Sweet Almond) Oil", { shampoo:0, co_wash:32, rinse_out_conditioner:65, deep_conditioner_mask:68, leave_in:65, hair_oil_serum:80, styling_product:48 });

// Tocopherol
set("Tocopherol", { shampoo:25, co_wash:30, rinse_out_conditioner:50, deep_conditioner_mask:55, leave_in:50, hair_oil_serum:72, styling_product:28 });

// Dimethicone
set("Dimethicone", { shampoo:3, co_wash:30, rinse_out_conditioner:75, deep_conditioner_mask:78, leave_in:58, hair_oil_serum:75, styling_product:75 });

// Cyclopentasiloxane
set("Cyclopentasiloxane", { shampoo:3, co_wash:25, rinse_out_conditioner:68, deep_conditioner_mask:70, leave_in:55, hair_oil_serum:75, styling_product:72 });

// Dimethiconol
set("Dimethiconol", { shampoo:3, co_wash:25, rinse_out_conditioner:72, deep_conditioner_mask:75, leave_in:58, hair_oil_serum:75, styling_product:72 });

// HEC
set("Hydroxyethylcellulose", { shampoo:28, co_wash:28, rinse_out_conditioner:32, deep_conditioner_mask:32, leave_in:48, hair_oil_serum:10, styling_product:88 });

// PVP
set("PVP", { shampoo:10, co_wash:10, rinse_out_conditioner:15, deep_conditioner_mask:15, leave_in:22, hair_oil_serum:10, styling_product:85 });

// Ammonium Laureth Sulfate
set("Ammonium Laureth Sulfate", { shampoo:72, co_wash:18 });

// Ammonium Lauryl Sulfate
set("Ammonium Lauryl Sulfate", { shampoo:68, co_wash:18 });

// Hydrolyzed Rice Protein
set("Hydrolyzed Rice Protein", { shampoo:30, co_wash:34, rinse_out_conditioner:78, deep_conditioner_mask:82, leave_in:82, hair_oil_serum:5, styling_product:35 });

// Coconut Oil
set("Cocos Nucifera (Coconut) Oil", { shampoo:0, co_wash:35, rinse_out_conditioner:70, deep_conditioner_mask:72, leave_in:65, hair_oil_serum:72, styling_product:50 });

// Castor Oil
set("Ricinus Communis (Castor) Seed Oil", { shampoo:0, co_wash:32, rinse_out_conditioner:65, deep_conditioner_mask:68, leave_in:62, hair_oil_serum:70, styling_product:48 });

// Mango Butter
set("Mangifera Indica (Mango) Seed Butter", { shampoo:0, co_wash:35, rinse_out_conditioner:68, deep_conditioner_mask:70, leave_in:60, hair_oil_serum:62, styling_product:48 });

// Avocado Oil
set("Persea Gratissima (Avocado) Oil", { shampoo:0, co_wash:35, rinse_out_conditioner:68, deep_conditioner_mask:70, leave_in:60, hair_oil_serum:68, styling_product:48 });

// Chamomile
set("Chamomilla Recutita (Flower) Extract", { shampoo:55, co_wash:45, rinse_out_conditioner:50, deep_conditioner_mask:52, leave_in:55, hair_oil_serum:22, styling_product:25 });

// Tea Tree
set("Melaleuca Alternifolia (Tea Tree) Leaf Oil", { shampoo:65, co_wash:38, rinse_out_conditioner:18, deep_conditioner_mask:22, leave_in:28, hair_oil_serum:40, styling_product:18 });

// MCI
set("Methylchloroisothiazolinone", { shampoo:10, co_wash:10, rinse_out_conditioner:10, deep_conditioner_mask:10, leave_in:8, hair_oil_serum:8, styling_product:10 });

// Glycol Distearate
set("Glycol Distearate", { shampoo:38, co_wash:30, rinse_out_conditioner:30, deep_conditioner_mask:30, leave_in:20, hair_oil_serum:10, styling_product:20 });

// Sodium Chloride
set("Sodium Chloride", { shampoo:28, co_wash:22, rinse_out_conditioner:22, deep_conditioner_mask:22, leave_in:18, hair_oil_serum:10, styling_product:18 });

// Citric Acid
set("Citric Acid", { shampoo:28, co_wash:28, rinse_out_conditioner:28, deep_conditioner_mask:28, leave_in:28, hair_oil_serum:10, styling_product:22 });

// Polyquaternium-10
set("Polyquaternium-10", { shampoo:50, co_wash:45, rinse_out_conditioner:55, deep_conditioner_mask:55, leave_in:50, hair_oil_serum:10, styling_product:35 });

// Hydrolyzed Wheat Protein
set("Hydrolyzed Wheat Protein", { shampoo:28, co_wash:32, rinse_out_conditioner:72, deep_conditioner_mask:76, leave_in:72, hair_oil_serum:5, styling_product:30 });

// Alcohol Denat
set("Alcohol Denat.", { shampoo:22, co_wash:18, rinse_out_conditioner:18, deep_conditioner_mask:18, leave_in:12, hair_oil_serum:12, styling_product:38 });

fs.writeFileSync(dbPath, JSON.stringify(db, null, 2));
console.log("Full recalibration complete. Total ingredients:", db.ingredients.length);
