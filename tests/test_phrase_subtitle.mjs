import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";

function compile(path, imports = {}) {
    const file = new URL(path, import.meta.url);
    let { outputText } = ts.transpileModule(readFileSync(file, "utf8"), {
        compilerOptions: { module: ts.ModuleKind.ES2020, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.React },
    });
    for (const [specifier, url] of Object.entries(imports)) {
        outputText = outputText.replace(JSON.stringify(specifier), JSON.stringify(url));
    }
    return `data:text/javascript;base64,${Buffer.from(outputText).toString("base64")}`;
}

const phraseSegments = compile("../src/phrases/phraseSegments.ts");
const { findSubtitle } = await import(compile("../src/phrases/PhraseSubtitle.tsx", { "./phraseSegments": phraseSegments }));
const { reflowStudyText, segmentText } = await import(compile("../src/learn/segmentText.ts", { "../phrases/phraseSegments": phraseSegments }));

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

test("groups a recognized expression into one selectable item and keeps punctuation", () => {
    const text = "Calm down, Skelly.";
    const segments = segmentText(text, true, extraction.phrases);
    assert.deepEqual(segments.filter(part => part.selectable).map(part => part.text), ["Calm down", "Skelly"]);
    assert.equal(segments[0].phrase.canonical, "calm down");
    assert.equal(segments.map(part => part.text).join(""), text);
    assert.deepEqual(segmentText(text, true).filter(part => part.selectable).map(part => part.text),
        ["Calm", "down", "Skelly"]);
    assert.ok(segmentText(text, false, extraction.phrases).every(part => !part.phrase));
});

test("keeps original Unicode offsets, spaces and line breaks in a grouped expression", () => {
    const text = "👋 I can figure  this\nout, then.";
    const surface = "figure  this\nout";
    const start = Array.from(text.slice(0, text.indexOf("figure"))).length;
    const phrases = [{ start, end: start + surface.length, surface, canonical: "figure out" }];
    const segments = segmentText(text, true, phrases);
    const group = segments.find(part => part.phrase);
    assert.equal(group.text, surface);
    assert.equal(group.start, text.indexOf("figure"));
    assert.equal(segments.map(part => part.text).join(""), text);
    assert.ok(segments.every(part => text.slice(part.start, part.start + part.text.length) === part.text));
});

test("reflows OCR line breaks for display while preserving paragraphs and phrase spacing", () => {
    assert.equal(reflowStudyText("Every enemy has a defense gauge.\r\n You can deplete it by parrying,\nkicking."),
        "Every enemy has a defense gauge. You can deplete it by parrying, kicking.");
    assert.equal(reflowStudyText("У каждого врага есть шкала.\n \nОна уменьшается\nпри парировании."),
        "У каждого врага есть шкала.\n\nОна уменьшается при парировании.");
    assert.equal(reflowStudyText("figure  this\nout"), "figure  this out");
});
