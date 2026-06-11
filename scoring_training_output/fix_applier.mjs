/**
 * fix_applier.mjs
 * Phase 5 + Phase 6:
 *   - Generates proposed_fixes.md from diagnosis results
 *   - Copies affected scoring files into modified_files/
 *   - Applies the proposed constant changes to copied files only
 */

import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const SCORING_DIR = path.join(ROOT, "scoringlogic+database", "scoring");

// ── Proposed fixes registry ────────────────────────────────────────────────────
// Each entry maps a diagnosis id → a list of { file, search, replace, description }
function buildFixPlan(diagnoses, analysisStats) {
  const fixes = [];

  for (const diag of diagnoses) {
    if (diag.id === "protein_overrating") {
      if (diag.avgError > 15) {
        fixes.push({
          diagnosisId: diag.id,
          file: "proteinBalance.ts",
          description: "Reduce DAMAGED_PROTEIN_BONUS: 1.20 → 1.12",
          search: "const DAMAGED_PROTEIN_BONUS = 1.20;",
          replace: "const DAMAGED_PROTEIN_BONUS = 1.12; // tuned: was 1.20, reduced due to protein overrating pattern",
        });
        fixes.push({
          diagnosisId: diag.id,
          file: "proteinBalance.ts",
          description: "Reduce PROTEIN_HUMECTANT_SYNERGY_BONUS: 1.06 → 1.03",
          search: "const PROTEIN_HUMECTANT_SYNERGY_BONUS = 1.06;",
          replace: "const PROTEIN_HUMECTANT_SYNERGY_BONUS = 1.03; // tuned: was 1.06, reduced due to protein overrating pattern",
        });
      } else {
        fixes.push({
          diagnosisId: diag.id,
          file: "proteinBalance.ts",
          description: "Reduce PROTEIN_HUMECTANT_SYNERGY_BONUS: 1.06 → 1.04",
          search: "const PROTEIN_HUMECTANT_SYNERGY_BONUS = 1.06;",
          replace: "const PROTEIN_HUMECTANT_SYNERGY_BONUS = 1.04; // tuned: was 1.06, mild reduction",
        });
      }
    }

    if (diag.id === "harsh_surfactant_underrating") {
      if (Math.abs(diag.avgError) > 15) {
        fixes.push({
          diagnosisId: diag.id,
          file: "cleanserHarshness.ts",
          description: "Raise STRONG_DRY_SCALP_PENALTY: 0.78 → 0.84",
          search: "const STRONG_DRY_SCALP_PENALTY = 0.78;",
          replace: "const STRONG_DRY_SCALP_PENALTY = 0.84; // tuned: was 0.78, raised to reduce harsh surfactant underrating",
        });
        fixes.push({
          diagnosisId: diag.id,
          file: "cleanserHarshness.ts",
          description: "Raise STRONG_DAMAGED_PENALTY: 0.82 → 0.87",
          search: "const STRONG_DAMAGED_PENALTY = 0.82;",
          replace: "const STRONG_DAMAGED_PENALTY = 0.87; // tuned: was 0.82, raised to reduce harsh surfactant underrating",
        });
      } else {
        fixes.push({
          diagnosisId: diag.id,
          file: "cleanserHarshness.ts",
          description: "Raise STRONG_DRY_SCALP_PENALTY: 0.78 → 0.82",
          search: "const STRONG_DRY_SCALP_PENALTY = 0.78;",
          replace: "const STRONG_DRY_SCALP_PENALTY = 0.82; // tuned: was 0.78, mild raise",
        });
      }
    }

    if (diag.id === "silicone_overrating") {
      fixes.push({
        diagnosisId: diag.id,
        file: "builtupAnalysis.ts",
        description: "Increase buildup risk for silicones — lower BUILDUP_SILICONE_WEIGHT if present, otherwise documented",
        search: null, // Structural change - documented only
        replace: null,
        documentedOnly: true,
        note:
          "builtupAnalysis.ts: Add profile-aware multiplier for 2+ silicones on curly/coily hair. " +
          "Suggested: when curlPattern is curly or coily and siliconeCount >= 2, apply ×0.90 to formulationScore.",
      });
    }

    if (diag.id === "low_porosity_silicone_underrating") {
      fixes.push({
        diagnosisId: diag.id,
        file: "scoreFormulation.ts",
        description: "Raise MULTI_PENALTY_FLOOR: 0.35 → 0.40 for Silicone category",
        search: "const MULTI_PENALTY_FLOOR = 0.35;",
        replace: "const MULTI_PENALTY_FLOOR = 0.40; // tuned: was 0.35, raised to reduce low-porosity silicone underrating",
      });
    }

    if (diag.id === "conditioner_mask_overrating") {
      fixes.push({
        diagnosisId: diag.id,
        file: "scoreFormulation.ts",
        description: "Adjust active-weighted scoring: top-active 0.40→0.35, support 0.20→0.25",
        search: "  return topActive * 0.4 + topFiveAvg * 0.4 + supportAvg * 0.2;",
        replace:
          "  return topActive * 0.35 + topFiveAvg * 0.4 + supportAvg * 0.25; // tuned: reduced top-active dominance to fix conditioner/mask overrating",
      });
    }

    if (diag.id === "unresolved_inflation") {
      fixes.push({
        diagnosisId: diag.id,
        file: "scoreFormulation.ts",
        description: "Add unresolved-ratio confidence penalty when >25% ingredients unresolved",
        documentedOnly: true,
        note:
          "scoreFormulation.ts: After computing formulationScore, add: " +
          "const unresolvedRatio = unresolvedEntries.length / (hits.length + unresolvedEntries.length); " +
          "if (unresolvedRatio > 0.25) formulationScore *= (1 - 0.3 * unresolvedRatio);",
      });
    }
  }

  return fixes;
}

// ── Apply a single text replacement to a file string ─────────────────────────
function applyTextReplace(content, search, replace) {
  if (!search || !replace) return { content, applied: false };
  if (content.includes(search)) {
    return { content: content.replace(search, replace), applied: true };
  }
  // Try trimmed match in case of whitespace differences
  const lines = content.split("\n");
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].trim() === search.trim()) {
      lines[i] = lines[i].replace(lines[i].trim(), replace.trim());
      return { content: lines.join("\n"), applied: true };
    }
  }
  return { content, applied: false };
}

// ── Phase 6: Apply fixes to copied files ─────────────────────────────────────
export function applyFixes(diagnoses, analysisStats, iterationDir) {
  const fixPlan = buildFixPlan(diagnoses, analysisStats);
  const modDir = path.join(iterationDir, "modified_files");
  fs.mkdirSync(modDir, { recursive: true });

  const appliedFixes = [];
  const copiedFiles = new Set();

  for (const fix of fixPlan) {
    if (fix.documentedOnly) {
      appliedFixes.push({ ...fix, status: "documented_only" });
      continue;
    }
    if (!fix.search || !fix.replace) {
      appliedFixes.push({ ...fix, status: "skipped_no_search" });
      continue;
    }

    const srcFile = path.join(SCORING_DIR, fix.file);
    const dstFile = path.join(modDir, fix.file);

    // Copy original to modified_files/ if not already copied this iteration
    if (!copiedFiles.has(fix.file)) {
      if (!fs.existsSync(srcFile)) {
        appliedFixes.push({ ...fix, status: "source_not_found" });
        continue;
      }
      fs.copyFileSync(srcFile, dstFile);
      copiedFiles.add(fix.file);
    }

    // Apply the replacement to the copied file
    const content = fs.readFileSync(dstFile, "utf-8");
    const { content: newContent, applied } = applyTextReplace(
      content,
      fix.search,
      fix.replace
    );

    if (applied) {
      fs.writeFileSync(dstFile, newContent, "utf-8");
      appliedFixes.push({ ...fix, status: "applied" });
    } else {
      appliedFixes.push({ ...fix, status: "search_not_found" });
    }
  }

  return { appliedFixes, modDir, copiedFiles: [...copiedFiles] };
}

// ── Phase 5: Format proposed fixes as Markdown ───────────────────────────────
export function formatProposedFixes(diagnoses, analysisStats, appliedFixes, iteration) {
  const lines = [
    `# Proposed Scoring Fixes — Iteration ${iteration}`,
    ``,
    `Generated from ${diagnoses.length} diagnosed error pattern(s).`,
    `Avg absolute error entering this iteration: **${analysisStats.avgAbsError}**`,
    ``,
  ];

  for (const diag of diagnoses) {
    lines.push(`## ${diag.id} (${diag.module})`);
    lines.push(`**Severity:** ${diag.severity} | **Affected cases:** ${diag.affectedCount} | **Avg error:** ${diag.avgError > 0 ? "+" : ""}${diag.avgError}`);
    lines.push(``);
    lines.push(`**Diagnosis:** ${diag.description}`);
    lines.push(``);
    lines.push(`**Proposed fix:** ${diag.proposedFix}`);
    lines.push(``);

    const relatedFixes = appliedFixes.filter((f) => f.diagnosisId === diag.id);
    if (relatedFixes.length > 0) {
      lines.push(`**Applied changes:**`);
      for (const f of relatedFixes) {
        const icon = f.status === "applied" ? "✅" : f.status === "documented_only" ? "📋" : "⚠️";
        lines.push(`- ${icon} \`${f.file}\`: ${f.description} (status: ${f.status})`);
        if (f.note) lines.push(`  - _Note: ${f.note}_`);
      }
      lines.push(``);
    }
  }

  if (diagnoses.length === 0) {
    lines.push(`_No significant error patterns detected. No fixes needed._`);
    lines.push(``);
  }

  lines.push(`---`);
  lines.push(`_All changes applied only to copies in \`modified_files/\`. Original scoring files unchanged._`);

  return lines.join("\n");
}
