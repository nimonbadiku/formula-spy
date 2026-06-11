import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Mobile lookup table structure
interface MobileIngredient {
  n: string; // name
  c: string; // category
  t: readonly string[]; // tags
  a?: readonly string[]; // aliases (optional)
}

function run() {
  const inputPath = path.resolve(__dirname, '../database/ingredients.v3.json');
  const outputPath = path.resolve(__dirname, '../database/mobile-ingredients.json');
  
  const rawData = fs.readFileSync(inputPath, 'utf8');
  const db = JSON.parse(rawData);
  
  const mobileDb: Record<string, MobileIngredient> = {};
  
  let entries = [];
  
  // The database output we saw showed keys like '0', '1', '2' or other string indices containing actual objects.
  if (Array.isArray(db)) {
    entries = db;
  } else if (db.ingredients && Array.isArray(db.ingredients)) {
    entries = db.ingredients;
  } else if (db.data && Array.isArray(db.data)) {
    entries = db.data;
  } else {
    // If db is an object where keys are numbers or names and values are the actual ingredient objects
    entries = Object.values(db).filter(
      (val): val is any => typeof val === 'object' && val !== null && 'name' in val
    );
  }

  for (const entry of entries) {
    if (!entry || typeof entry !== 'object' || !entry.name) continue;
    
    const minified: MobileIngredient = {
      n: entry.name,
      c: entry.category || 'Unknown',
      t: entry.tags || [],
    };
    
    if (entry.aliases && entry.aliases.length > 0) {
      minified.a = entry.aliases;
    }
    
    mobileDb[entry.name] = minified;
  }
  
  fs.writeFileSync(outputPath, JSON.stringify(mobileDb));
  console.log(`Successfully generated mobile DB: ${Object.keys(mobileDb).length} entries.`);
  
  const inputStats = fs.statSync(inputPath);
  const outputStats = fs.statSync(outputPath);
  
  console.log(`Original Size: ${(inputStats.size / 1024 / 1024).toFixed(2)} MB`);
  console.log(`Mobile DB Size: ${(outputStats.size / 1024 / 1024).toFixed(2)} MB`);
}

run();