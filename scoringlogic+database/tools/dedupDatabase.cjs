'use strict';
const fs = require('fs');
const path = require('path');
const DB_PATH = path.join(__dirname, '..', 'database', 'ingredients.json');

const db = JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));

// Remove duplicate SD Alcohol 40-B — keep the richer entry (more tags), remove the sparse one
// The duplicate was created when the original "Sd Alcohol 40-B (Alcohol Denat.)" entry was renamed
// to "SD Alcohol 40-B", but there was already a canonical "SD Alcohol 40-B" entry in the DB.
const seen = new Set();
const deduped = [];
let removedCount = 0;

for (const i of db.ingredients) {
  const key = i.name;
  if (!seen.has(key)) {
    seen.add(key);
    deduped.push(i);
  } else {
    removedCount++;
    console.log('Removed duplicate:', i.name);
  }
}

db.ingredients = deduped;
db.totalIngredients = deduped.length;

fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2), 'utf8');
console.log('Removed', removedCount, 'duplicate(s). Total now:', deduped.length);

// Verify
const sdAlcs = deduped.filter(function(i) { return i.name === 'SD Alcohol 40-B'; });
console.log('SD Alcohol 40-B entries remaining:', sdAlcs.length, sdAlcs.length === 1 ? 'PASS' : 'FAIL');
console.log('Tags:', JSON.stringify(sdAlcs[0].tags));
const dryingAlcohols = deduped.filter(function(i) { return i.category === 'Drying Alcohol'; });
console.log('Drying Alcohol category total:', dryingAlcohols.length, dryingAlcohols.length === 3 ? 'PASS' : 'CHECK');
dryingAlcohols.forEach(function(i) { console.log(' -', i.name); });
