import assert from "node:assert/strict";
import { computeDiff, validateResume } from "../src/lib/optimize";

console.log("Running optimization verification checks...\n");

function check(name: string, fn: () => void) {
  try {
    fn();
    console.log(`  ok  ${name}`);
  } catch (error) {
    console.error(`  FAIL  ${name}`);
    console.error(error);
    process.exitCode = 1;
  }
}

// 1. Validation checks
check("validateResume flags extreme truncation", () => {
  const orig = "A".repeat(1000);
  const rev = "A".repeat(200);
  const result = validateResume(orig, rev);
  assert.equal(result.passed, false);
  assert.ok(result.warnings.some((w) => w.includes("significantly shorter")));
});

check("validateResume detects bracketed customization placeholders", () => {
  const orig = "Lead engineer at Acme. Managed projects.";
  const rev = "Lead engineer at Acme. [Led team of 5 delivering X% compliance in enterprise governance].";
  const result = validateResume(orig, rev);
  assert.equal(result.passed, true);
  assert.ok(result.injectedPlaceholders.length > 0);
  assert.ok(result.injectedPlaceholders[0].includes("Led team of 5 delivering X% compliance"));
});

check("validateResume accepts balanced revisions", () => {
  const orig = "Senior Data Analyst at TechCorp. Built dashboards.";
  const rev = "Senior Analytics Engineer at TechCorp. Architected enterprise semantic models and automated reporting.";
  const result = validateResume(orig, rev);
  assert.equal(result.passed, true);
  assert.equal(result.warnings.length, 0);
});

// 2. Diff computation checks
check("computeDiff detects unmodified lines", () => {
  const orig = "Line 1\nLine 2";
  const rev = "Line 1\nLine 2";
  const diff = computeDiff(orig, rev);
  assert.equal(diff.length, 2);
  assert.equal(diff[0].type, "same");
  assert.equal(diff[1].type, "same");
});

check("computeDiff detects modified lines", () => {
  const orig = "Line 1\nOld Line\nLine 3";
  const rev = "Line 1\nNew Line\nLine 3";
  const diff = computeDiff(orig, rev);
  assert.ok(diff.some((d) => d.type === "modify" && d.text === "New Line" && d.originalText === "Old Line"));
});

check("computeDiff detects additions", () => {
  const orig = "Line 1\nLine 2";
  const rev = "Line 1\nAdded Line\nLine 2";
  const diff = computeDiff(orig, rev);
  assert.ok(diff.some((d) => d.type === "add" && d.text === "Added Line"));
});

console.log("\nAll optimization unit checks passed.");
