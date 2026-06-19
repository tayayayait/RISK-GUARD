import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";

function getOptimizeDepsIncludes(): string[] {
  const configPath = resolve(process.cwd(), "vite.config.ts");
  const source = ts.createSourceFile(
    configPath,
    readFileSync(configPath, "utf8"),
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );

  let includes: string[] = [];
  const visit = (node: ts.Node) => {
    if (
      ts.isPropertyAssignment(node)
      && node.name.getText(source) === "include"
      && ts.isArrayLiteralExpression(node.initializer)
      && ts.isPropertyAssignment(node.parent.parent)
      && node.parent.parent.name.getText(source) === "optimizeDeps"
    ) {
      includes = node.initializer.elements
        .filter(ts.isStringLiteral)
        .map((element) => element.text);
    }
    ts.forEachChild(node, visit);
  };

  visit(source);
  return includes;
}

describe("Vite dependency optimization", () => {
  it("pre-bundles the Gemini SDK used by lazy-loaded prediction routes", () => {
    expect(getOptimizeDepsIncludes()).toContain("@google/generative-ai");
  });
});
