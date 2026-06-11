import * as fs from 'fs';
import * as path from 'path';

// Fix for __dirname in ES modules
import { fileURLToPath } from 'url';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const benchmarksDir = path.join(__dirname, '../benchmarks');

function findJsonFiles(dir: string, fileList: string[] = []): string[] {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const filePath = path.join(dir, file);
    if (fs.statSync(filePath).isDirectory()) {
      findJsonFiles(filePath, fileList);
    } else if (file.endsWith('.json')) {
      fileList.push(filePath);
    }
  }
  return fileList;
}

const ignoreFiles = [
  'tuning.config.json',
  'scientific_report.json',
  'tuning_diagnostics.json',
  'benchmark-baseline.json',
  'benchmark-resume-snapshot.json'
];

interface BenchmarkEntry {
  name?: any;
  ingredients?: any;
  expected?: any;
  [key: string]: any;
}

interface InvalidEntry {
  file: string;
  index: number;
  missing_keys: string[];
  suggested_fix: string;
}

const allJsonFiles = findJsonFiles(benchmarksDir).filter(file => !ignoreFiles.includes(path.basename(file)));

const report: InvalidEntry[] = [];
let totalFilesScanned = 0;
let totalEntries = 0;
let totalInvalidEntries = 0;
let totalDuplicates = 0;

const seenProducts = new Map<string, { file: string, index: number }>();

for (const filePath of allJsonFiles) {
  totalFilesScanned++;
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    const data = JSON.parse(content);
    
    // Data can be an array of entries or a single entry
    const entries: any[] = Array.isArray(data) ? data : (data.products || data.probes || data.entries || [data]);
    
    // In some cases, ranking sets or contradiction sets have a wrapper object. Let's try to extract array
    let actualEntries: any[] = [];
    if (Array.isArray(entries)) {
        actualEntries = entries;
    } else if (typeof entries === 'object') {
        for (const val of Object.values(entries)) {
            if (Array.isArray(val)) {
                actualEntries = actualEntries.concat(val);
            } else if (typeof val === 'object' && val !== null) {
                 actualEntries.push(val);
            }
        }
    }
    
    // If we still didn't find entries or it's a wrapper, let's just parse what we can
    // It's safer to check each object if it has 'ingredients'
    let entriesToScan: any[] = [];
    
    function extractEntries(obj: any) {
        if (!obj || typeof obj !== 'object') return;
        if (Array.isArray(obj)) {
            for (const item of obj) extractEntries(item);
        } else {
            if (obj.ingredients && Array.isArray(obj.ingredients)) {
                entriesToScan.push(obj);
            } else {
                for (const val of Object.values(obj)) {
                    extractEntries(val);
                }
            }
        }
    }
    
    extractEntries(data);

    // If entriesToScan is empty but data is an array, we should still evaluate it because maybe it's just missing ingredients
    if (entriesToScan.length === 0 && Array.isArray(data)) {
        entriesToScan = data;
    } else if (entriesToScan.length === 0 && Array.isArray(data.products)) {
        entriesToScan = data.products;
    }

    let index = 0;
    for (const entry of entriesToScan) {
      if (typeof entry !== 'object' || entry === null) {
          report.push({
            file: path.relative(benchmarksDir, filePath),
            index,
            missing_keys: ['malformed_object'],
            suggested_fix: 'Remove or replace malformed object'
          });
          totalInvalidEntries++;
          totalEntries++;
          index++;
          continue;
      }
      totalEntries++;
      const missingKeys: string[] = [];
      let fixSuggestions: string[] = [];

      if (!entry.name || typeof entry.name !== 'string' || entry.name.trim() === '') {
        missingKeys.push('name');
        fixSuggestions.push(`Add name: "UNKNOWN_PRODUCT_${path.basename(filePath)}_${index}"`);
      } else {
        // Check duplicate
        const key = entry.name.toLowerCase().trim();
        if (seenProducts.has(key)) {
            const prev = seenProducts.get(key)!;
            report.push({
                file: path.relative(benchmarksDir, filePath),
                index,
                missing_keys: ['DUPLICATE'],
                suggested_fix: `Duplicate of product in ${prev.file} at index ${prev.index}. Merge or remove.`
            });
            totalDuplicates++;
        } else {
            seenProducts.set(key, { file: path.relative(benchmarksDir, filePath), index });
        }
      }

      if (!entry.ingredients || !Array.isArray(entry.ingredients) || entry.ingredients.length === 0) {
        missingKeys.push('ingredients');
        fixSuggestions.push(`Add ingredients: []`);
      }

      if (!entry.expected || typeof entry.expected !== 'object') {
        missingKeys.push('expected');
        fixSuggestions.push(`Add expected: {"score": 50, "signals": []}`);
      } else {
        if (typeof entry.expected.score !== 'number' || entry.expected.score < 0 || entry.expected.score > 100) {
            missingKeys.push('expected.score');
            fixSuggestions.push(`Add expected.score between 0-100`);
        }
        if (!entry.expected.signals || !Array.isArray(entry.expected.signals)) {
            missingKeys.push('expected.signals');
            fixSuggestions.push(`Add expected.signals: []`);
        }
      }

      if (missingKeys.length > 0) {
        report.push({
          file: path.relative(benchmarksDir, filePath),
          index,
          missing_keys: missingKeys,
          suggested_fix: fixSuggestions.join(' | ')
        });
        totalInvalidEntries++;
      }

      index++;
    }

  } catch (err: any) {
    report.push({
      file: path.relative(benchmarksDir, filePath),
      index: -1,
      missing_keys: ['JSON_PARSE_ERROR'],
      suggested_fix: err.message
    });
    totalInvalidEntries++;
  }
}

fs.writeFileSync('benchmark_validation_report.json', JSON.stringify(report, null, 2));

const fileInvalidCounts = new Map<string, number>();
for (const issue of report) {
    if (issue.missing_keys.includes('DUPLICATE')) continue; // don't count duplicate as invalid for top 10 if we want
    fileInvalidCounts.set(issue.file, (fileInvalidCounts.get(issue.file) || 0) + 1);
}

const top10 = Array.from(fileInvalidCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);

console.log('--- BENCHMARK VALIDATION SUMMARY ---');
console.log(`Total files scanned: ${totalFilesScanned}`);
console.log(`Total entries: ${totalEntries}`);
console.log(`Total invalid entries: ${totalInvalidEntries}`);
console.log(`Total duplicates: ${totalDuplicates}`);
console.log('');
console.log('Top 10 files with most invalid entries:');
for (const [file, count] of top10) {
    console.log(`- ${file}: ${count} invalid entries`);
}
