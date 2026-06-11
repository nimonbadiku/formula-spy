import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";
import { loadBenchmarks } from "./benchmarkLoader.ts";
import { runAllBenchmarks } from "./benchmarkRunner.ts";

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const BENCHMARKS_DIR = path.join(PROJECT_ROOT, "benchmarks");
const DB_PATH = path.join(PROJECT_ROOT, "database", "ingredients.v3.json");

function loadDatabase() {
  return JSON.parse(fs.readFileSync(DB_PATH, "utf-8"));
}

const database = loadDatabase();
const benchmarks = loadBenchmarks(BENCHMARKS_DIR, undefined);
const results = runAllBenchmarks(benchmarks, database);
console.log(JSON.stringify(results));
