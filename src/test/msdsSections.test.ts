import { describe, expect, it } from "vitest";
import * as fs from "fs";
import * as path from "path";
import { extractXmlItems } from "../../supabase/functions/_shared/data-go-xml";
import type { MsdsSectionItem } from "../../supabase/functions/_shared/msds-api";
import {
  normalizeHazardSection,
  normalizeFirstAidSection,
  normalizePpeSection,
  normalizeRegulationSection,
  buildMsdsSectionTree,
} from "../../supabase/functions/_shared/msds-sections";

function loadFixture(filename: string): string {
  const fixturePath = path.resolve(__dirname, "fixtures", filename);
  return fs.readFileSync(fixturePath, "utf-8");
}

describe("msds-sections normalization", () => {
  it("parses section 02 pictograms removing .gif suffix", () => {
    const xml = loadFixture("msds-toluene-02.xml");
    const rawItems = extractXmlItems(xml);
    const hazard = normalizeHazardSection(rawItems as unknown as MsdsSectionItem[]);

    expect(hazard.pictograms).toEqual(["GHS02", "GHS07", "GHS08"]);
  });

  it("parses section 02 signal word correctly as '위험'", () => {
    const xml = loadFixture("msds-toluene-02.xml");
    const rawItems = extractXmlItems(xml);
    const hazard = normalizeHazardSection(rawItems as unknown as MsdsSectionItem[]);

    expect(hazard.signalWord).toBe("위험");
  });

  it("parses section 02 H-codes including H225 text", () => {
    const xml = loadFixture("msds-toluene-02.xml");
    const rawItems = extractXmlItems(xml);
    const hazard = normalizeHazardSection(rawItems as unknown as MsdsSectionItem[]);

    expect(hazard.hCodes).toHaveLength(6);
    const h225 = hazard.hCodes.find((h) => h.code === "H225");
    expect(h225).toBeDefined();
    expect(h225?.text).toBe("고인화성 액체 및 증기");
  });

  it("parses section 02 P-code combination like P301+P310 correctly", () => {
    const xml = loadFixture("msds-toluene-02.xml");
    const rawItems = extractXmlItems(xml);
    const hazard = normalizeHazardSection(rawItems as unknown as MsdsSectionItem[]);

    const comboP = hazard.pCodes.response.find((p) => p.code === "P301+P310");
    expect(comboP).toBeDefined();
    expect(comboP?.text).toBe("삼켰다면: 즉시 독극물센터/의사의 진찰을 받으시오.");
  });

  it("fills all 4 PPE parts (respiratory, eye, hand, body) in section 08", () => {
    const xml = loadFixture("msds-toluene-08.xml");
    const rawItems = extractXmlItems(xml);
    const ppeSection = normalizePpeSection(rawItems as unknown as MsdsSectionItem[]);

    expect(ppeSection.ppe.respiratory.length).toBeGreaterThan(0);
    expect(ppeSection.ppe.eye.length).toBeGreaterThan(0);
    expect(ppeSection.ppe.hand.length).toBeGreaterThan(0);
    expect(ppeSection.ppe.body.length).toBeGreaterThan(0);
    expect(ppeSection.ppe.respiratory[0]).toContain("방독마스크");
  });

  it("removes leading empty elements from section 08 exposure limits", () => {
    const xml = loadFixture("msds-toluene-08.xml");
    const rawItems = extractXmlItems(xml);
    const ppeSection = normalizePpeSection(rawItems as unknown as MsdsSectionItem[]);

    expect(ppeSection.exposureLimits.domestic).toBe("TWA : 50ppm | STEL : 150ppm(허용기준)");
    expect(ppeSection.exposureLimits.acgih).toBe("TWA 20 ppm");
  });

  it("normalizes sentinel values like '자료없음' to null", () => {
    const xml = loadFixture("msds-toluene-02.xml");
    const rawItems = extractXmlItems(xml);
    const hazard = normalizeHazardSection(rawItems as unknown as MsdsSectionItem[]);

    expect(hazard.nfpa).toBeNull();
  });

  it("parses section 15 OSH act regulations with 4 or more items", () => {
    const xml = loadFixture("msds-toluene-15.xml");
    const rawItems = extractXmlItems(xml);
    const regSection = normalizeRegulationSection(rawItems as unknown as MsdsSectionItem[]);

    expect(regSection.oshAct.length).toBeGreaterThanOrEqual(4);
    expect(regSection.oshAct).toContain("작업환경측정대상물질 (측정주기 : 6개월)");
    expect(regSection.chemicalControlAct).toContain("사고대비물질");
  });

  it("does not include empty parent nodes (e.g. B04) as values in domain classifications", () => {
    const xml = loadFixture("msds-toluene-02.xml");
    const rawItems = extractXmlItems(xml);
    const hazard = normalizeHazardSection(rawItems as unknown as MsdsSectionItem[]);

    expect(hazard.classifications).not.toContain("");
    expect(hazard.classifications.length).toBe(6);
  });

  it("preserves unknown codes in MsdsSectionTree while keeping domain type clean", () => {
    const xml = loadFixture("msds-toluene-15.xml");
    const rawItems = extractXmlItems(xml);
    const tree = buildMsdsSectionTree(15, rawItems as unknown as MsdsSectionItem[]);

    // root node O
    expect(tree.nodes.length).toBeGreaterThan(0);
    const rootNode = tree.nodes.find((n) => n.code === "O");
    expect(rootNode).toBeDefined();

    // unknown node UNKNOWN_999 is present in children of O
    const unknownChild = rootNode?.children.find((c) => c.code === "UNKNOWN_999");
    expect(unknownChild).toBeDefined();
    expect(unknownChild?.detail).toEqual(["알 수 없는 규제 내용"]);
  });
});
