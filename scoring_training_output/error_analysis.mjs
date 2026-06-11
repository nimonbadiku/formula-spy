/**
 * error_analysis.mjs
 * Phase 3 + Phase 4: Compare expected vs actual scores,
 * classify errors, and diagnose root causes.
 */

// ── Phase 3: Error classification ────────────────────────────────────────────

export function classifyError(actualScore, expectedScore) {
  if (actualScore === null) return "engine_error";
  const error = actualScore - expectedScore;
  if (error >= 10)  return "overrated";
  if (error <= -10) return "underrated";
  return "correct";
}

export function analyzeErrors(results) {
  const valid = results.filter((r) => r.actualScore !== null && r.error === null);
  const failed = results.filter((r) => r.actualScore === null || r.error !== null);

  const classified = valid.map((r) => {
    const error = r.actualScore - r.expectedScore;
    return {
      ...r,
      error,
      absError: Math.abs(error),
      classification: classifyError(r.actualScore, r.expectedScore),
    };
  });

  const overrated  = classified.filter((r) => r.classification === "overrated");
  const underrated = classified.filter((r) => r.classification === "underrated");
  const correct    = classified.filter((r) => r.classification === "correct");

  const totalValid = classified.length;
  const avgError = totalValid > 0
    ? classified.reduce((s, r) => s + r.error, 0) / totalValid
    : 0;
  const avgAbsError = totalValid > 0
    ? classified.reduce((s, r) => s + r.absError, 0) / totalValid
    : 0;
  const maxOverrate  = overrated.length  > 0 ? Math.max(...overrated.map((r) => r.error)) : 0;
  const maxUnderrate = underrated.length > 0 ? Math.min(...underrated.map((r) => r.error)) : 0;

  return {
    totalCases: results.length,
    validCases: totalValid,
    failedCases: failed.length,
    overratedCount: overrated.length,
    underratedCount: underrated.length,
    correctCount: correct.length,
    overratedPct: totalValid > 0 ? ((overrated.length / totalValid) * 100).toFixed(1) : "0.0",
    underratedPct: totalValid > 0 ? ((underrated.length / totalValid) * 100).toFixed(1) : "0.0",
    correctPct: totalValid > 0 ? ((correct.length / totalValid) * 100).toFixed(1) : "0.0",
    avgError: +avgError.toFixed(2),
    avgAbsError: +avgAbsError.toFixed(2),
    maxOverrate: +maxOverrate.toFixed(2),
    maxUnderrate: +maxUnderrate.toFixed(2),
    stabilized: avgAbsError < 5 && overrated.length <= 3 && underrated.length <= 3,
    classified,
    failed,
  };
}

// ── Phase 4: Root cause diagnosis ─────────────────────────────────────────────

/**
 * Groups errors by scoring module based on:
 *   - Which ingredient categories are dominant in the product
 *   - Which heuristic warnings fired
 *   - Which profile characteristics correlate with errors
 */
export function diagnoseRootCauses(analysis) {
  const { classified } = analysis;
  const overrated  = classified.filter((r) => r.classification === "overrated");
  const underrated = classified.filter((r) => r.classification === "underrated");

  const diagnoses = [];

  // ── Helper: count occurrences ──────────────────────────────────────────────
  function countBy(cases, fn) {
    const counts = {};
    for (const c of cases) {
      const key = fn(c);
      if (key != null) counts[key] = (counts[key] || 0) + 1;
    }
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);
  }

  function avgErrorFor(cases, fn) {
    const groups = {};
    for (const c of cases) {
      const key = fn(c);
      if (key == null) continue;
      if (!groups[key]) groups[key] = [];
      groups[key].push(c.error);
    }
    return Object.entries(groups).map(([key, errs]) => ({
      key,
      count: errs.length,
      avgError: +(errs.reduce((s, e) => s + e, 0) / errs.length).toFixed(2),
    })).sort((a, b) => Math.abs(b.avgError) - Math.abs(a.avgError));
  }

  // ── Diagnosis 1: Protein-related overrating ────────────────────────────────
  const proteinOverrated = overrated.filter(
    (r) => (r.highlights?.proteins?.length || 0) >= 1
  );
  if (proteinOverrated.length >= 2) {
    const avgErr = proteinOverrated.reduce((s, r) => s + r.error, 0) / proteinOverrated.length;
    diagnoses.push({
      id: "protein_overrating",
      module: "proteinBalance.ts",
      severity: avgErr > 15 ? "high" : "medium",
      affectedCount: proteinOverrated.length,
      avgError: +avgErr.toFixed(2),
      description:
        `${proteinOverrated.length} protein-containing products scored ` +
        `${avgErr.toFixed(1)} points above expected on average. ` +
        `Protein bonus modifiers (DAMAGED_PROTEIN_BONUS, PROTEIN_HUMECTANT_SYNERGY_BONUS) ` +
        `may be too generous or the stacking penalty (PROTEIN_STACK_PENALTY) too weak.`,
      proposedFix: avgErr > 15
        ? "Reduce DAMAGED_PROTEIN_BONUS from 1.20 to 1.12. Reduce PROTEIN_HUMECTANT_SYNERGY_BONUS from 1.06 to 1.03."
        : "Reduce PROTEIN_HUMECTANT_SYNERGY_BONUS from 1.06 to 1.04.",
    });
  }

  // ── Diagnosis 2: Harsh surfactant underrating ──────────────────────────────
  const harshUnderrated = underrated.filter(
    (r) => (r.highlights?.harshSurfactants?.length || 0) >= 1
      && (r.productCategory === "shampoo" || r.productCategory === "gentle_shampoo")
  );
  if (harshUnderrated.length >= 2) {
    const avgErr = harshUnderrated.reduce((s, r) => s + r.error, 0) / harshUnderrated.length;
    diagnoses.push({
      id: "harsh_surfactant_underrating",
      module: "cleanserHarshness.ts",
      severity: Math.abs(avgErr) > 15 ? "high" : "medium",
      affectedCount: harshUnderrated.length,
      avgError: +avgErr.toFixed(2),
      description:
        `${harshUnderrated.length} shampoos with harsh surfactants scored ` +
        `${Math.abs(avgErr).toFixed(1)} points below expected. ` +
        `STRONG_DRY_SCALP_PENALTY (${0.78}) or STRONG_DAMAGED_PENALTY (${0.82}) ` +
        `may be too harsh, reducing even oily-hair profiles unnecessarily.`,
      proposedFix: Math.abs(avgErr) > 15
        ? "Raise STRONG_DRY_SCALP_PENALTY from 0.78 to 0.84. Raise STRONG_DAMAGED_PENALTY from 0.82 to 0.87."
        : "Raise STRONG_DRY_SCALP_PENALTY from 0.78 to 0.82.",
    });
  }

  // ── Diagnosis 3: Silicone-heavy overrating ────────────────────────────────
  const siliconeOverrated = overrated.filter(
    (r) => (r.highlights?.silicones?.length || 0) >= 2
  );
  if (siliconeOverrated.length >= 2) {
    const avgErr = siliconeOverrated.reduce((s, r) => s + r.error, 0) / siliconeOverrated.length;
    diagnoses.push({
      id: "silicone_overrating",
      module: "builtupAnalysis.ts",
      severity: avgErr > 15 ? "high" : "medium",
      affectedCount: siliconeOverrated.length,
      avgError: +avgErr.toFixed(2),
      description:
        `${siliconeOverrated.length} silicone-heavy products scored ` +
        `${avgErr.toFixed(1)} points above expected. ` +
        `Buildup risk penalties for heavy silicones may be insufficient ` +
        `for curly/coily profiles.`,
      proposedFix:
        "In builtupAnalysis.ts: increase buildup score weight for 'Silicone' category ingredients " +
        "on curlPattern=curly/coily profiles. Consider adding a 0.90 multiplier for 2+ silicones.",
    });
  }

  // ── Diagnosis 4: Low-porosity silicone underrating ────────────────────────
  const lowPorSilUnderrated = underrated.filter(
    (r) =>
      r.engineProfile?.porosity === "low" &&
      (r.highlights?.silicones?.length || 0) >= 1
  );
  if (lowPorSilUnderrated.length >= 2) {
    const avgErr = lowPorSilUnderrated.reduce((s, r) => s + r.error, 0) / lowPorSilUnderrated.length;
    diagnoses.push({
      id: "low_porosity_silicone_underrating",
      module: "advancedProfileModifiers.ts / molecularWeightHeuristics.ts",
      severity: Math.abs(avgErr) > 12 ? "high" : "low",
      affectedCount: lowPorSilUnderrated.length,
      avgError: +avgErr.toFixed(2),
      description:
        `${lowPorSilUnderrated.length} low-porosity profiles with silicones scored ` +
        `${Math.abs(avgErr).toFixed(1)} points below expected. ` +
        `Low-porosity penalty for silicones may be stacking excessively ` +
        `(molecular weight + buildup + advanced profile = triple penalty).`,
      proposedFix:
        "The MULTI_PENALTY_FLOOR=0.35 in scoreFormulation.ts should catch this. " +
        "If still underrating, raise MULTI_PENALTY_FLOOR from 0.35 to 0.40 for Silicone category.",
    });
  }

  // ── Diagnosis 5: Protein-sensitive underrating ────────────────────────────
  const protSensUnderrated = underrated.filter(
    (r) =>
      r.engineProfile?.proteinSensitivity === true &&
      (r.highlights?.proteins?.length || 0) === 0
  );
  if (protSensUnderrated.length >= 2) {
    const avgErr = protSensUnderrated.reduce((s, r) => s + r.error, 0) / protSensUnderrated.length;
    diagnoses.push({
      id: "protein_sensitive_no_protein_underrating",
      module: "proteinBalance.ts",
      severity: "low",
      affectedCount: protSensUnderrated.length,
      avgError: +avgErr.toFixed(2),
      description:
        `${protSensUnderrated.length} protein-sensitive profiles with protein-free products ` +
        `scored ${Math.abs(avgErr).toFixed(1)} points below expected. ` +
        `Protein-sensitivity flag may be penalizing even non-protein products ` +
        `due to unrelated ingredient interactions.`,
      proposedFix:
        "Review profileProductGating.ts isProteinRelevant() — ensure protein modifiers " +
        "are fully suppressed when no protein ingredients are present.",
    });
  }

  // ── Diagnosis 6: Conditioner/mask overrating ──────────────────────────────
  const conditionerOverrated = overrated.filter(
    (r) =>
      r.productCategory === "conditioner" || r.productCategory === "mask"
  );
  if (conditionerOverrated.length >= 3) {
    const avgErr = conditionerOverrated.reduce((s, r) => s + r.error, 0) / conditionerOverrated.length;
    const byPorosity = avgErrorFor(conditionerOverrated, (r) => r.engineProfile?.porosity);
    diagnoses.push({
      id: "conditioner_mask_overrating",
      module: "formulationBalance.ts / scoreIngredient.ts",
      severity: avgErr > 12 ? "high" : "medium",
      affectedCount: conditionerOverrated.length,
      avgError: +avgErr.toFixed(2),
      description:
        `${conditionerOverrated.length} conditioner/mask products overrated by ` +
        `${avgErr.toFixed(1)} pts average. ` +
        `Porosity breakdown: ${byPorosity.map((b) => `${b.key}(${b.avgError})`).join(", ")}. ` +
        `The active-weighted scoring model heavily weights high-scoring conditioning agents ` +
        `(fatty alcohols, proteins) causing systemic overrating.`,
      proposedFix:
        "In scoreFormulation.ts: reduce computeActiveWeightedScore top-active weight from 0.40 " +
        "to 0.35 and increase support weight from 0.20 to 0.25. This reduces the dominance " +
        "of single high-scoring ingredients.",
    });
  }

  // ── Diagnosis 7: Unresolved ingredient ratio inflating scores ────────────
  const highUnresolvedOverrated = overrated.filter(
    (r) => r.unresolvedCount > 3
  );
  if (highUnresolvedOverrated.length >= 2) {
    const avgErr = highUnresolvedOverrated.reduce((s, r) => s + r.error, 0) / highUnresolvedOverrated.length;
    diagnoses.push({
      id: "unresolved_inflation",
      module: "scoreFormulation.ts (unresolved handling)",
      severity: "medium",
      affectedCount: highUnresolvedOverrated.length,
      avgError: +avgErr.toFixed(2),
      description:
        `${highUnresolvedOverrated.length} overrated cases have ${">"}3 unresolved ingredients. ` +
        `Unresolved ingredients contribute 0 score and are excluded from active-weighted ` +
        `scoring, which inflates the effective score of resolved ingredients.`,
      proposedFix:
        "Apply a confidence penalty when unresolvedCount / totalIngredients > 0.25. " +
        "Suggested: multiply formulationScore by (1 - 0.3 * unresolvedRatio) when ratio > 0.25.",
    });
  }

  // ── Diagnosis 8: Scalp condition mismatch ────────────────────────────────
  const scalpUnderrated = underrated.filter(
    (r) => r.scalpCondition === "sensitive" && r.engineProfile?.scalpSensitivity === true
  );
  if (scalpUnderrated.length >= 2) {
    const avgErr = scalpUnderrated.reduce((s, r) => s + r.error, 0) / scalpUnderrated.length;
    diagnoses.push({
      id: "scalp_sensitivity_overpenalty",
      module: "advancedProfileModifiers.ts / cleanserHarshness.ts",
      severity: "low",
      affectedCount: scalpUnderrated.length,
      avgError: +avgErr.toFixed(2),
      description:
        `${scalpUnderrated.length} sensitive-scalp profiles underrated by ${Math.abs(avgErr).toFixed(1)} pts. ` +
        `Scalp sensitivity may be stacking with cleanser harshness penalties.`,
      proposedFix:
        "Ensure MILD_SENSITIVE_SCALP_BONUS (1.08) in cleanserHarshness.ts is actually " +
        "offsetting the scalp sensitivity penalty from advancedProfileModifiers.ts. " +
        "Consider adding an explicit cap: max combined scalp penalty = ×0.75.",
    });
  }

  // ── Summary stats by module ────────────────────────────────────────────────
  const byProductCategory = avgErrorFor(classified, (r) => r.productCategory);
  const byHairType = avgErrorFor(classified, (r) => r.hairType);
  const byPorosity = avgErrorFor(classified, (r) => r.engineProfile?.porosity);
  const byScalpCondition = avgErrorFor(classified, (r) => r.scalpCondition);

  return {
    diagnoses,
    patterns: {
      byProductCategory,
      byHairType,
      byPorosity,
      byScalpCondition,
    },
  };
}

// ── Phase 3: Format error report as Markdown ─────────────────────────────────

export function formatErrorReport(analysis, diagnosisResult, iteration) {
  const { classified, failed } = analysis;

  const lines = [
    `# Error Report — Iteration ${iteration}`,
    ``,
    `## Summary`,
    ``,
    `| Metric | Value |`,
    `|--------|-------|`,
    `| Total cases | ${analysis.totalCases} |`,
    `| Valid runs | ${analysis.validCases} |`,
    `| Failed runs | ${analysis.failedCases} |`,
    `| Overrated (actual > expected + 10) | ${analysis.overratedCount} (${analysis.overratedPct}%) |`,
    `| Underrated (actual < expected − 10) | ${analysis.underratedCount} (${analysis.underratedPct}%) |`,
    `| Correct (within ±10) | ${analysis.correctCount} (${analysis.correctPct}%) |`,
    `| Avg error (actual − expected) | ${analysis.avgError} |`,
    `| Avg absolute error | ${analysis.avgAbsError} |`,
    `| Max overrate | +${analysis.maxOverrate} |`,
    `| Max underrate | ${analysis.maxUnderrate} |`,
    `| Stabilized | ${analysis.stabilized ? "✅ YES" : "❌ NO"} |`,
    ``,
    `## Error Distribution by Product Category`,
    ``,
    `| Category | Count | Avg Error |`,
    `|----------|-------|-----------|`,
    ...diagnosisResult.patterns.byProductCategory.map(
      (b) => `| ${b.key} | ${b.count} | ${b.avgError > 0 ? "+" : ""}${b.avgError} |`
    ),
    ``,
    `## Error Distribution by Hair Type`,
    ``,
    `| Hair Type | Count | Avg Error |`,
    `|-----------|-------|-----------|`,
    ...diagnosisResult.patterns.byHairType.map(
      (b) => `| ${b.key} | ${b.count} | ${b.avgError > 0 ? "+" : ""}${b.avgError} |`
    ),
    ``,
    `## Error Distribution by Porosity`,
    ``,
    `| Porosity | Count | Avg Error |`,
    `|----------|-------|-----------|`,
    ...diagnosisResult.patterns.byPorosity.map(
      (b) => `| ${b.key} | ${b.count} | ${b.avgError > 0 ? "+" : ""}${b.avgError} |`
    ),
    ``,
    `## Top Overrated Cases`,
    ``,
    `| Case ID | Expected | Actual | Error | Product | Hair Type |`,
    `|---------|----------|--------|-------|---------|-----------|`,
    ...classified
      .filter((r) => r.classification === "overrated")
      .sort((a, b) => b.error - a.error)
      .slice(0, 15)
      .map(
        (r) =>
          `| ${r.id} | ${r.expectedScore} | ${r.actualScore?.toFixed(1)} | +${r.error.toFixed(1)} | ${r.productName} | ${r.hairType} |`
      ),
    ``,
    `## Top Underrated Cases`,
    ``,
    `| Case ID | Expected | Actual | Error | Product | Hair Type |`,
    `|---------|----------|--------|-------|---------|-----------|`,
    ...classified
      .filter((r) => r.classification === "underrated")
      .sort((a, b) => a.error - b.error)
      .slice(0, 15)
      .map(
        (r) =>
          `| ${r.id} | ${r.expectedScore} | ${r.actualScore?.toFixed(1)} | ${r.error.toFixed(1)} | ${r.productName} | ${r.hairType} |`
      ),
    ``,
    `## Failed Cases`,
    ``,
    failed.length === 0
      ? `_No failures._`
      : failed
          .slice(0, 10)
          .map((r) => `- **${r.id}**: ${r.error}`)
          .join("\n"),
  ];

  return lines.join("\n");
}
