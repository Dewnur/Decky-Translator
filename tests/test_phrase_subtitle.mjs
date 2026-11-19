import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";

const file = new URL("../src/phrases/PhraseSubtitle.tsx", import.meta.url);
const { outputText } = ts.transpileModule(readFileSync(file, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.ES2020, jsx: ts.JsxEmit.React },
});
const { findSubtitle } = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString("base64")}`);

const subtitle = {
    text: "Calm down!",
    rect: { left: 535, top: 638, right: 745, bottom: 690 },
    isDialog: false,
};
const extraction = {
    text: subtitle.text,
    phrases: [{ start: 0, end: 9, surface: "Calm down", canonical: "calm down", translation: "успокоиться" }],
};

test("selects a short subtitle once an expression is found", () => {
    const hudLabel = { ...subtitle, text: "Main menu" };
    const candidates = [hudLabel, subtitle];
    assert.equal(findSubtitle({ candidates, extractions: [] }, 1280, 800), undefined);
    assert.equal(findSubtitle({ candidates, extractions: [extraction] }, 1280, 800), subtitle);
});

test("keeps matches outside the subtitle area out of selection", () => {
    const candidates = [{ ...subtitle, rect: { ...subtitle.rect, top: 30, bottom: 60 } }];
    assert.equal(findSubtitle({ candidates, extractions: [extraction] }, 1280, 800), undefined);
});
