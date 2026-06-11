import { analyze } from "./engine/index.ts";
import * as fs from "fs";
import * as path from "path";

const dbPath = path.join(__dirname, "database", "ingredients.v3.json");
const dbRaw = fs.readFileSync(dbPath, "utf-8");
const database = JSON.parse(dbRaw);

const result = analyze(
  "Water, Glycerin, Dimethicone",
  {
    porosity: "med",
    density: "med",
    condition: "normal",
    oiliness: "normal",
    productType: "shampoo",
    curlPattern: "wavy",
    scalpSensitivity: false,
    proteinSensitivity: false,
    siliconeSensitivity: false,
    chemicallyTreated: false
  },
  database
);

console.log(JSON.stringify(result.summary, null, 2));
