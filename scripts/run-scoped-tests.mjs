#!/usr/bin/env node
import { spawnSync } from "node:child_process";

const ALLOWED_PREFIXES = ["feat/forms/", "feat/assessment/", "feat/prediction/", "feat/shared/"];

function run(command, args) {
  const result = spawnSync(command, args, { stdio: "inherit", shell: process.platform === "win32" });
  return result.status ?? 1;
}

function getBranch() {
  const result = spawnSync("git", ["rev-parse", "--abbrev-ref", "HEAD"], { encoding: "utf8" });
  if ((result.status ?? 1) !== 0) {
    process.exit(result.status ?? 1);
  }
  return result.stdout.trim();
}

function inferArea(branch) {
  if (branch.startsWith("feat/forms/")) return "forms";
  if (branch.startsWith("feat/assessment/")) return "assessment";
  if (branch.startsWith("feat/prediction/")) return "prediction";
  if (branch.startsWith("feat/shared/")) return "shared";
  return null;
}

function fail(message) {
  console.error(`[hook] ${message}`);
  process.exit(1);
}

const branch = getBranch();
if (!ALLOWED_PREFIXES.some((prefix) => branch.startsWith(prefix))) {
  fail(`branch prefix must be one of: ${ALLOWED_PREFIXES.join(", ")} (current: ${branch})`);
}

const area = inferArea(branch);
if (!area) {
  fail(`unable to infer area from branch: ${branch}`);
}

const testArgsByArea = {
  forms: ["test", "--", "src/test/formEditorInputFlow.test.tsx", "src/test/formEditorHistoryMode.test.tsx", "src/test/formServiceRiskLegalBasis.test.ts"],
  assessment: ["test", "--", "src/test/stateFlow.test.tsx", "src/test/evidenceStatus.test.tsx"],
  prediction: ["test", "--", "src/test/accidentPrediction.test.tsx", "src/test/predictionService.test.ts"],
  shared: ["test"],
};

const args = testArgsByArea[area];
if (!args) {
  fail(`unsupported area: ${area}`);
}

const status = run("pnpm", args);
if (status !== 0) {
  process.exit(status);
}
