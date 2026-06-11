// Quick audit script for ingredient DB
const db = require('../database/ingredients.v3.json');
console.log('Total ingredients:', db.length);

const terms = [
  'Lauryl Glucoside','Disodium Cocoyl Glutamate','Sodium Cocoyl Glutamate',
  'Guar Hydroxypropyltrimonium','Hydrolyzed Rice Protein','Sodium Laureth Sulfate',
  'Sodium Lauryl Sulfate','Cocamidopropyl Betaine','Polyquaternium-10','Dimethicone',
  'Alcohol Denat','Isopropyl Alcohol','Methylchloroisothiazolinone','Methylisothiazolinone',
  'Cocamide DEA','Inulin','Pullulan','Polyglyceryl-4 Caprate','Xanthan Gum',
  'Propylene Glycol','Glycerin','Aloe Barbadensis','Zinc Pyrithione','Piroctone Olamine',
  'Selenium Sulfide','Coco-Glucoside','Panthenol','Linalool','Benzyl Salicylate',
  'Phenoxyethanol','Glyceryl Oleate','PEG-120','PEG-80','Polyquaternium-7',
  'Sodium Gluconate','Glyceryl Caprylate','Sodium Benzoate','Potassium Sorbate',
  'Tetramethyl Acetyl','Dimethiconol','Dimethicone Copolyol'
];

terms.forEach(t => {
  const f = db.filter(i => i.name.toLowerCase().includes(t.toLowerCase()));
  if (f.length) {
    f.forEach(i => {
      console.log(`FOUND: "${i.name}" | cat: ${i.category} | tags: ${JSON.stringify(i.tags)} | ionic: ${i.ionic_charge}`);
      if (i.product_roles && i.product_roles.shampoo) {
        console.log(`  shampoo score: ${i.product_roles.shampoo.score}`);
      } else {
        console.log(`  NO shampoo role`);
      }
    });
  } else {
    console.log(`NOT FOUND: ${t}`);
  }
});
