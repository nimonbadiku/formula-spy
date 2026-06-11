import * as fs from "fs";
import * as path from "path";
import * as process from "process";
import { fileURLToPath } from "url";
import { execSync } from "child_process";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PROJECT_ROOT = path.resolve(__dirname, "..");
const BENCHMARKS_DIR = path.join(PROJECT_ROOT, "benchmarks");
const CONFIG_PATH = path.join(BENCHMARKS_DIR, "tuning.config.json");
const DIAGNOSTICS_PATH = path.join(BENCHMARKS_DIR, "tuning_diagnostics.json");
const REPORT_JSON = path.join(BENCHMARKS_DIR, "scientific_report.json");
const REPORT_MD = path.join(BENCHMARKS_DIR, "scientific_report.md");
const RUN_SCRIPT = path.join(PROJECT_ROOT, "tools", "runBenchmarks.ts");

interface TuningTarget {
  file: string;
  regex: string;
  bounds: [number, number];
  name: string;
  classes?: string[];
}

interface TuningConfig {
  learning_rate: number;
  max_iterations: number;
  thresholds: {
    accuracy: number;
    max_score_deviation: number;
  };
  tuning_targets: TuningTarget[];
}

function loadConfig(): TuningConfig {
  return JSON.parse(fs.readFileSync(CONFIG_PATH, "utf-8"));
}

function readConstant(target: TuningTarget): number {
  const filePath = path.join(PROJECT_ROOT, target.file);
  const content = fs.readFileSync(filePath, "utf-8");
  const regex = new RegExp(target.regex);
  const match = content.match(regex);
  if (!match) throw new Error(`Could not find constant ${target.name} in ${filePath}`);
  return parseFloat(match[1]);
}

function writeConstant(target: TuningTarget, value: number): void {
  const filePath = path.join(PROJECT_ROOT, target.file);
  let content = fs.readFileSync(filePath, "utf-8");
  const regex = new RegExp(target.regex);
  const replacement = target.regex.replace("([\\d.-]+)", value.toFixed(3));
  content = content.replace(regex, replacement);
  fs.writeFileSync(filePath, content, "utf-8");
}

function parseJSONFromOutput(output: string) {
  // Try to locate JSON array
  let startIndex = output.indexOf("[");
  let lastIndex = output.lastIndexOf("]");
  if (startIndex === -1 || lastIndex === -1) {
    throw new Error("No JSON array found in output");
  }

  // Handle case where multiple JSON arrays might exist, we want the last one which should be the final benchmark output
  const possibleJSON = output.substring(startIndex, lastIndex + 1);
  return JSON.parse(possibleJSON);
}

async function main() {
  const config = loadConfig();

  console.log(`Starting Autonomous Scientific Engine Optimizer`);

  // Load current values
  const currentConstants: Record<string, number> = {};
  for (const t of config.tuning_targets) {
    currentConstants[t.name] = readConstant(t);
  }

  let bestDeviation = Infinity;
  let bestConstants = { ...currentConstants };
  const history: any[] = [];
  let noImprovementCount = 0;

  for (let iter = 1; iter <= config.max_iterations; iter++) {
    console.log(`\n=== Iteration ${iter} ===`);
    
    // Write out the current constants to the files just to be sure
    for (const target of config.tuning_targets) {
        writeConstant(target, currentConstants[target.name]);
    }

    let stdout = "";
    try {
        console.log("Running benchmarks...");
        stdout = execSync(`npx tsx tools/benchmarkWorker.ts`, {
            encoding: "utf-8",
            maxBuffer: 50 * 1024 * 1024,
            stdio: ['pipe', 'pipe', 'ignore'] // ignore stderr to keep stdout clean
        });
    } catch (e: any) {
        if (e.stdout) {
            stdout = e.stdout.toString();
        } else {
            console.error("Failed to run benchmarks", e);
            break;
        }
    }
    
    let results: any[] = [];
    try {
      results = parseJSONFromOutput(stdout);
    } catch (err) {
      console.error("Failed to parse benchmark results. Attempting fallback extraction.");
      // Fallback: look for lines that look like total deviation. Wait, autoTuner needs to calculate deviation itself.
      // tools/benchmarkWorker.ts actually outputs JSON. We can write a specific wrapper if needed.
      break;
    }

    let totalDeviation = 0;
    const classDeviations: Record<string, number> = {};
    let signalsFixed = 0;
    let signalsRemaining = 0;

    for (const r of results) {
      for (const fr of r.fieldResults) {
        if (fr.field.startsWith("tag:") || fr.field.startsWith("warning:")) {
          if (fr.pass) signalsFixed++;
          else signalsRemaining++;
        } else {
          // Compute deviation
          let dev = 0;
          if (!fr.pass) {
            if (fr.field === "overall") {
              const match = fr.expected.match(/\[([\d.-]+),\s*([\d.-]+)\]/);
              const actualScore = parseFloat(fr.actual);
              if (match && !isNaN(actualScore)) {
                const min = parseFloat(match[1]);
                const max = parseFloat(match[2]);
                if (actualScore < min) dev = actualScore - min;
                else if (actualScore > max) dev = actualScore - max;
              } else if (!isNaN(parseFloat(fr.expected))) {
                 dev = actualScore - parseFloat(fr.expected);
              }
            } else {
              const actualMatch = fr.actual.match(/\(([\d.-]+)\)/);
              if (actualMatch) {
                const actualScore = parseFloat(actualMatch[1]);
                const expectedBands: Record<string, [number, number]> = {
                  very_low: [0, 20],
                  low: [0, 35],
                  medium: [25, 65],
                  high: [55, 100],
                  very_high: [75, 100],
                };
                const band = expectedBands[fr.expected];
                if (band) {
                  if (actualScore < band[0]) dev = actualScore - band[0];
                  else if (actualScore > band[1]) dev = actualScore - band[1];
                }
              }
            }
          }

          const absDev = Math.abs(dev);
          totalDeviation += absDev;
          
          let fieldClass = "Overall";
          if (fr.field === "cleansing") fieldClass = "Cleansing";
          if (fr.field === "buildup") fieldClass = "Buildup";
          if (fr.field === "protein") fieldClass = "Protein";
          if (fr.field === "moisture") fieldClass = "Moisture";
          if (fr.field === "smoothing") fieldClass = "Smoothing";
          if (fr.field === "repairSupport") fieldClass = "BondRepair";
          if (fr.field === "lightweightFeel") fieldClass = "LightweightFeel";
          
          classDeviations[fieldClass] = (classDeviations[fieldClass] || 0) + absDev;
        }
      }
    }

    console.log(`Total Deviation: ${totalDeviation.toFixed(2)}`);
    for (const [cls, val] of Object.entries(classDeviations)) {
        if (val > 0) {
            console.log(`  ${cls}: ${val.toFixed(2)}`);
        }
    }
    console.log(`Signals Fixed: ${signalsFixed}, Remaining: ${signalsRemaining}`);
    
    history.push({
      iteration: iter,
      totalDeviation,
      classDeviations,
      signalsFixed,
      signalsRemaining,
      constants: { ...currentConstants }
    });

    let improved = false;
    if (totalDeviation < bestDeviation) {
      bestDeviation = totalDeviation;
      bestConstants = { ...currentConstants };
      improved = true;
      noImprovementCount = 0;
    } else {
      noImprovementCount++;
      // Rollback to best if things got worse
      console.log(`  Deviation increased. Rolling back to best constants.`);
      for (const target of config.tuning_targets) {
        currentConstants[target.name] = bestConstants[target.name];
        writeConstant(target, currentConstants[target.name]);
      }
    }

    if (totalDeviation < config.thresholds.max_score_deviation) {
      console.log(`\nConvergence threshold reached!`);
      break;
    }

    if (noImprovementCount >= 5) {
      console.log(`\nNo improvement for 5 iterations. Halting.`);
      break;
    }

    // Compute Delta Updates
    for (const target of config.tuning_targets) {
      // Find class dev to use for gradient
      const targetClass = target.classes?.[0] || "Overall";
      const currentDev = classDeviations[targetClass] || totalDeviation;

      let move = 0;
      
      if (history.length >= 2) {
        const last = history[history.length - 1];
        const prev = history[history.length - 2];
        
        const lastVal = last.constants[target.name];
        const prevVal = prev.constants[target.name];
        
        const lastDev = last.classDeviations[targetClass] || last.totalDeviation;
        const prevDev = prev.classDeviations[targetClass] || prev.totalDeviation;

        const valDiff = lastVal - prevVal;
        const devDiff = lastDev - prevDev;

        if (Math.abs(valDiff) > 0.0001) {
          const grad = devDiff / valDiff;
          move = -config.learning_rate * grad;
        } else {
          move = (Math.random() > 0.5 ? 1 : -1) * config.learning_rate;
        }
      } else {
        move = (Math.random() > 0.5 ? 1 : -1) * config.learning_rate;
      }

      // Clip move
      const maxMove = (target.bounds[1] - target.bounds[0]) * 0.1;
      if (move > maxMove) move = maxMove;
      if (move < -maxMove) move = -maxMove;
      
      if (Math.abs(move) < 0.005) {
         move = (Math.random() > 0.5 ? 1 : -1) * 0.01;
      }

      // Reduce move size if we haven't improved recently to "fine tune"
      if (noImprovementCount > 0) {
        move = move * (0.5 ** noImprovementCount);
      }

      let newVal = currentConstants[target.name] + move;
      
      if (newVal < target.bounds[0]) newVal = target.bounds[0];
      if (newVal > target.bounds[1]) newVal = target.bounds[1];

      currentConstants[target.name] = newVal;
      console.log(`  Target: ${target.name} -> ${newVal.toFixed(3)} (Move: ${move.toFixed(3)})`);
    }
  }

  console.log(`\nRestoring best constants (Total Deviation: ${bestDeviation.toFixed(2)})`);
  for (const target of config.tuning_targets) {
    writeConstant(target, bestConstants[target.name]);
  }

  // Final Reporting
  let finalResults: any[] = [];
  try {
      let stdout = execSync(`npx tsx tools/benchmarkWorker.ts`, { encoding: "utf-8", maxBuffer: 50 * 1024 * 1024, stdio: ['pipe', 'pipe', 'ignore'] });
      finalResults = parseJSONFromOutput(stdout);
  } catch (err) {}

  const finalReport = {
    totalDeviation: bestDeviation,
    perClassDeviation: history.length > 0 ? history[history.length - 1].classDeviations : {},
    signalsFixed: history.length > 0 ? history[history.length - 1].signalsFixed : 0,
    signalsRemaining: history.length > 0 ? history[history.length - 1].signalsRemaining : 0,
    results: finalResults,
    history
  };

  fs.writeFileSync(REPORT_JSON, JSON.stringify(finalReport, null, 2));

  let mdContent = `# Scientific Tuning Report\n\n`;
  mdContent += `**Best Total Deviation:** ${bestDeviation.toFixed(2)}\n`;
  mdContent += `**Signals Fixed:** ${finalReport.signalsFixed} | **Signals Remaining:** ${finalReport.signalsRemaining}\n\n`;
  mdContent += `## Per-Class Deviations (Final)\n`;
  for (const [cls, dev] of Object.entries(finalReport.perClassDeviation)) {
    mdContent += `- **${cls}:** ${(dev as number).toFixed(2)}\n`;
  }
  
  mdContent += `\n## Final Constants\n`;
  for (const [k, v] of Object.entries(bestConstants)) {
    mdContent += `- \`${k}\`: ${v.toFixed(3)}\n`;
  }

  fs.writeFileSync(REPORT_MD, mdContent);
  fs.writeFileSync(DIAGNOSTICS_PATH, JSON.stringify(history, null, 2));

  console.log(`Reports generated in benchmarks/`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
