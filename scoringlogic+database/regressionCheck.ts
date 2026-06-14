import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { analyze } from './engine/index.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const db = JSON.parse(fs.readFileSync(path.join(__dirname, 'database', 'ingredients.v3.json'), 'utf-8'));

const cases = [
  { name:'R1', inci:'Water, Cetearyl Alcohol, Behentrimonium Chloride, Dimethicone, Glycerin, Panthenol', profile:{porosity:'high',density:'medium',condition:'dry',oiliness:'dry',productType:'rinse_out_conditioner',curlPattern:'curly',scalpSensitivity:false,proteinSensitivity:false,siliconeSensitivity:false,chemicallyTreated:false,goal:'moisture'}, min:60, max:99 },
  { name:'R2', inci:'Water, Glycerin, Aloe Vera, Panthenol, Argan Oil, Dimethicone', profile:{porosity:'medium',density:'medium',condition:'normal',oiliness:'normal',productType:'leave_in_conditioner',curlPattern:'wavy',scalpSensitivity:false,proteinSensitivity:false,siliconeSensitivity:false,chemicallyTreated:false,goal:'frizz-control'}, min:55, max:99 },
  { name:'R3', inci:'Argan Oil, Jojoba Oil, Sweet Almond Oil, Vitamin E', profile:{porosity:'high',density:'coarse',condition:'dry',oiliness:'dry',productType:'serum',curlPattern:'coily',scalpSensitivity:false,proteinSensitivity:false,siliconeSensitivity:false,chemicallyTreated:false,goal:'moisture'}, min:68, max:80 },
  { name:'R4', inci:'Water, Bis-Aminopropyl Diglycol Dimaleate, Cetearyl Alcohol, Panthenol, Glycerin', profile:{porosity:'high',density:'medium',condition:'damaged',oiliness:'normal',productType:'treatment',curlPattern:'curly',scalpSensitivity:false,proteinSensitivity:true,siliconeSensitivity:false,chemicallyTreated:false,goal:'damage-repair'}, min:68, max:80 },
  { name:'R5', inci:'Water, Hydrolyzed Keratin, Hydrolyzed Wheat Protein, Cetearyl Alcohol, Panthenol', profile:{porosity:'high',density:'coarse',condition:'damaged',oiliness:'normal',productType:'treatment',curlPattern:'curly',scalpSensitivity:false,proteinSensitivity:false,siliconeSensitivity:false,chemicallyTreated:false,goal:'damage-repair'}, min:74, max:86 },
];

for (const c of cases) {
  const r = analyze(c.inci, c.profile, db);
  const s = r.summary.formulationScore;
  const ok = s >= c.min && s <= c.max;
  console.log(ok ? 'PASS' : 'FAIL', '|', c.name, '| score:', s, '| range:', c.min+'-'+c.max);
}
