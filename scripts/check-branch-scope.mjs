#!/usr/bin/env node
import { execSync } from "node:child_process";

const ALLOWED_PREFIXES = ["feat/forms/", "feat/assessment/", "feat/prediction/", "feat/shared/"];
const NEUTRAL_PREFIXES = ["docs/", ".githooks/", "scripts/", ".husky/"];
const NEUTRAL_FILES = new Set([
  "package.json",
  "pnpm-lock.yaml",
  ".env.example",
  "README.md",
  "supabase/config.toml",
]);

function run(command) {
  return execSync(command, { encoding: "utf8" }).trim();
}

function getCurrentBranch() {
  return run("git rev-parse --abbrev-ref HEAD");
}

function getStagedFiles() {
  const output = run("git diff --cached --name-only --diff-filter=ACMR");
  if (!output) {
    return [];
  }
  return output.split(/\r?\n/).map((value) => value.trim()).filter(Boolean);
}

function normalize(path) {
  return path.replace(/\\/g, "/");
}

function inferArea(branch) {
  if (branch.startsWith("feat/forms/")) return "forms";
  if (branch.startsWith("feat/assessment/")) return "assessment";
  if (branch.startsWith("feat/prediction/")) return "prediction";
  if (branch.startsWith("feat/shared/")) return "shared";
  return null;
}

function isNeutralPath(file) {
  const normalized = normalize(file);
  if (NEUTRAL_FILES.has(normalized)) {
    return true;
  }
  return NEUTRAL_PREFIXES.some((prefix) => normalized.startsWith(prefix));
}

function isFormsPath(file) {
  const normalized = normalize(file);
  return normalized.startsWith("src/pages/Form")
    || normalized.startsWith("src/components/forms/")
    || normalized.startsWith("src/services/form")
    || normalized === "src/lib/riskAssessmentTemplateHint.ts"
    || normalized.startsWith("supabase/functions/kosha-law-guides-form/");
}

function isAssessmentPath(file) {
  const normalized = normalize(file);
  return normalized.startsWith("src/contexts/AssessmentContext")
    || normalized.startsWith("src/components/layout/Step")
    || normalized.startsWith("src/pages/Assessment")
    || normalized.startsWith("src/pages/ProfileReview")
    || normalized.startsWith("src/pages/AnalysisResult")
    || normalized.startsWith("src/pages/EvidenceBoard")
    || normalized.startsWith("src/pages/MaterialsBoard")
    || normalized.startsWith("src/pages/ReportOutput")
    || normalized.startsWith("src/services/assessment")
    || normalized.startsWith("supabase/functions/kosha-law-guides-assessment/");
}

function isPredictionPath(file) {
  const normalized = normalize(file);
  return normalized.startsWith("src/pages/AccidentPrediction")
    || normalized.startsWith("src/services/prediction")
    || normalized.startsWith("src/services/predictionContextService");
}

function isAllowedForArea(area, file) {
  if (isNeutralPath(file)) {
    return true;
  }
  if (area === "forms") {
    return isFormsPath(file);
  }
  if (area === "assessment") {
    return isAssessmentPath(file);
  }
  if (area === "prediction") {
    return isPredictionPath(file);
  }
  if (area === "shared") {
    return true;
  }
  return false;
}

function fail(message) {
  console.error(`[hook] ${message}`);
  process.exit(1);
}

const branch = getCurrentBranch();
if (!ALLOWED_PREFIXES.some((prefix) => branch.startsWith(prefix))) {
  fail(`branch prefix must be one of: ${ALLOWED_PREFIXES.join(", ")} (current: ${branch})`);
}

const stagedFiles = getStagedFiles();
if (stagedFiles.length === 0) {
  process.exit(0);
}

const area = inferArea(branch);
if (!area) {
  fail(`unable to infer area from branch: ${branch}`);
}

const outOfScope = stagedFiles.filter((file) => !isAllowedForArea(area, file));
if (outOfScope.length > 0) {
  fail(
    `branch area "${area}" cannot stage these paths:\n${outOfScope.map((file) => `- ${file}`).join("\n")}\nUse feat/shared/* if cross-boundary changes are required.`,
  );
}
