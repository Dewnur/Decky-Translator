import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "../Input";
import type { Input } from "../Input";
import type { TextRegion } from "../TextRecognizer";
import { segmentText } from "./segmentText";
import type { StudySegment } from "./segmentText";
import { findInitialStudyRegion } from "./subtitlePriority";
import { useStudyTranslation } from "./useStudyTranslation";
import { translateStudyTexts } from "./studyTranslationCache";
import { StudyWordPopover } from "./StudyWordPopover";
import { findVerticalStudyPart } from "./studyNavigation";
import type { LearnWordLayout } from "./wordLayout";
import type { PhraseView } from "../phrases/phraseSegments";

export interface LearnControls {
    dismiss: () => void;
    subscribeToStudyButtons: Input['subscribeToStudyButtons'];
    translateRegions: (regions: TextRegion[], targetLanguage: string) => Promise<string[]>;
}

interface LearnOverlayProps extends LearnControls {
    regions: TextRegion[];
    targetLanguage: string;
    wordLayout: LearnWordLayout;
    phraseView: PhraseView | null;
    widthFactor: number;
    heightFactor: number;
    imageHeight: number;
    captureWidth: number;
    captureHeight: number;
}

function findSelectedPartIndex(parts: readonly StudySegment[], start: number): number {
    return Math.max(0, parts.findIndex(part => part.start <= start && start < part.start + part.text.length));
}

export function LearnOverlay({
    regions, targetLanguage, wordLayout, phraseView, widthFactor, heightFactor, imageHeight, captureWidth, captureHeight,
    dismiss, subscribeToStudyButtons, translateRegions,
}: LearnOverlayProps) {
    const [selection, setSelection] = useState(() => ({
        region: findInitialStudyRegion(regions, captureWidth, captureHeight),
        partStart: 0,
        words: true,
    }));
    const requests = useRef(new Map<string, Promise<string>>());
    const studyText = useRef<HTMLDivElement>(null);
    const selectedPart = useRef<HTMLButtonElement>(null);

    const region = regions[selection.region];
    const phraseMatches = phraseView?.extractions?.find(extraction => extraction.text === region.text)?.phrases;
    const segments = useMemo(() => segmentText(region.text, selection.words, phraseMatches), [region.text, selection.words, phraseMatches]);
    const parts = useMemo(() => segments.filter(segment => segment.selectable), [segments]);
    const sources = useMemo(() => [...new Set(parts.map(part => part.text))], [parts]);
    const targetConfigured = !!targetLanguage && targetLanguage !== 'en';
    const selectedIndex = findSelectedPartIndex(parts, selection.partStart);
    const selectedSegment = parts[selectedIndex];
    const selectedWord = selection.words ? selectedSegment?.text : undefined;
    const activeLayout = selection.words ? wordLayout : undefined;
    const panelAtTop = (region.rect.top + region.rect.bottom) * heightFactor / 2 > imageHeight / 2;

    const requestTexts = useCallback((texts: readonly string[]) =>
        translateStudyTexts(requests.current, targetLanguage, texts,
            missing => translateRegions(missing.map(text => ({ ...region, text })), targetLanguage)),
    [region, targetLanguage, translateRegions]);

    const requestText = useCallback(async (text: string) => {
        const [translation] = await requestTexts([text]);
        return translation;
    }, [requestTexts]);

    const requestWords = useCallback(async (words: readonly string[]) => {
        const translations = await requestTexts(words);
        return new Map(words.map((word, index) => [word, translations[index]]));
    }, [requestTexts]);

    const blockTranslation = useStudyTranslation(targetConfigured ? region.text : null, requestText, 120);
    const canTranslateWords = targetConfigured && blockTranslation.value.status === "ready" && phraseView?.extractions !== null;
    const wordTranslation = useStudyTranslation(
        canTranslateWords && activeLayout !== "interlinear" ? selectedWord ?? null : null,
        requestText,
        250,
    );
    const interlinearTranslation = useStudyTranslation(
        canTranslateWords && activeLayout === "interlinear" && sources.length ? sources : null,
        requestWords,
        180,
    );
    const individualWordVisible = !!selectedWord && targetConfigured && blockTranslation.value.status !== "error";
    const showPopover = individualWordVisible && activeLayout === "popover";
    const showGlosses = targetConfigured && activeLayout === "interlinear";
    const interlinearError = showGlosses && interlinearTranslation.value.status === "error"
        ? interlinearTranslation.value.message : null;
    const failedTranslation = blockTranslation.value.status === "error" ? blockTranslation
        : interlinearError ? interlinearTranslation
        : individualWordVisible && activeLayout !== "interlinear" && wordTranslation.value.status === "error"
            ? wordTranslation : null;

    function selectRegion(index: number) {
        setSelection(previous => ({ ...previous, region: index, partStart: 0 }));
    }

    function moveRegion(delta: number) {
        if (regions.length < 2) return;
        setSelection(previous => ({
            ...previous,
            region: (previous.region + delta + regions.length) % regions.length,
            partStart: 0,
        }));
    }

    function movePart(delta: -1 | 1, vertical = false) {
        if (!parts.length) return;
        const positions = vertical
            ? Array.from(studyText.current?.querySelectorAll("button") ?? [], button => button.getBoundingClientRect())
            : [];
        setSelection(previous => {
            if (previous.region !== selection.region || previous.words !== selection.words) return previous;
            const current = findSelectedPartIndex(parts, previous.partStart);
            const next = vertical
                ? findVerticalStudyPart(positions, current, delta)
                : Math.max(0, Math.min(current + delta, parts.length - 1));
            return next === current ? previous : { ...previous, partStart: parts[next].start };
        });
    }

    function toggleWords() {
        setSelection(previous => ({ ...previous, words: !previous.words, partStart: 0 }));
    }

    function translationText(value: typeof blockTranslation.value, source: string): string {
        switch (value.status) {
            case "loading": return "Translating…";
            case "error": return value.message;
            case "ready": return distinctTranslation(value.data, source) || "No distinct translation returned.";
        }
    }

    function distinctTranslation(text: string | undefined, source: string): string | undefined {
        return text && text !== source.trim() ? text : undefined;
    }

    function glossFor(word: string): string {
        if (blockTranslation.value.status === "error" || interlinearTranslation.value.status === "error") return "—";
        if (interlinearTranslation.value.status === "loading") return "…";
        return distinctTranslation(interlinearTranslation.value.data.get(word), word) ?? "—";
    }

    const handleButton = useRef<(button: Button) => void>(() => {});
    handleButton.current = button => {
        switch (button) {
            case Button.L1: moveRegion(-1); break;
            case Button.R1: moveRegion(1); break;
            case Button.DPAD_UP: movePart(-1, true); break;
            case Button.DPAD_DOWN: movePart(1, true); break;
            case Button.DPAD_LEFT: movePart(-1); break;
            case Button.DPAD_RIGHT: movePart(1); break;
            case Button.A: failedTranslation?.retry(); break;
            case Button.X: toggleWords(); break;
        }
    };

    useEffect(() => subscribeToStudyButtons((button, pressed) => {
        if (pressed) handleButton.current(button);
    }), [subscribeToStudyButtons]);

    useEffect(() => {
        selectedPart.current?.scrollIntoView?.({ block: "nearest", inline: "nearest" });
    }, [selection.region, selectedIndex, selectedSegment, activeLayout, interlinearTranslation.value.status]);

    let partIndex = 0;
    return (
        <>
            <style>{`
                .dlt-study { --dlt-selection: #9ed1ff; --dlt-selection-fill: #24486d; }
                .dlt-study button { font: inherit; color: inherit; cursor: pointer; }
                .dlt-study button:focus-visible, .dlt-study-region:focus-visible {
                    outline: 2px solid white;
                    outline-offset: 2px;
                }
                .dlt-study-actions { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }
                .dlt-study-actions button {
                    background: #243247; border: 1px solid #62748c; border-radius: 4px; padding: 5px 8px;
                }
                .dlt-study-text { max-height: 13vh; overflow-y: auto; white-space: pre-wrap; line-height: 1.55; }
                .dlt-study-text button {
                    background: transparent; padding: 0 2px; border: 1px solid transparent; border-radius: 4px;
                    vertical-align: top;
                }
                .dlt-study-text[data-layout] button { border-bottom-color: #62748c; }
                .dlt-study-text button[aria-pressed="true"] {
                    color: var(--dlt-selection); background: var(--dlt-selection-fill);
                    border-color: var(--dlt-selection);
                }
                .dlt-study-text[data-glosses="true"] { max-height: 19vh; }
                .dlt-study-text[data-glosses="true"] button {
                    display: inline-flex; flex-direction: column; align-items: center;
                    vertical-align: top; max-width: 100%; white-space: normal; padding: 2px 4px;
                    background: #172638; margin-bottom: 3px;
                }
                .dlt-study-text[data-glosses="true"] button[aria-pressed="true"] { background: var(--dlt-selection-fill); }
                .dlt-study-gloss { color: #bdcddd; font-size: 0.78em; line-height: 1.25; }
                .dlt-study-text button[aria-pressed="true"] .dlt-study-gloss { color: var(--dlt-selection); }
                .dlt-study-text[data-layout] button[data-phrase] {
                    color: #211900; background: #ffd84d; border-color: #ffd84d;
                }
                .dlt-study-text[data-layout] button[data-phrase] .dlt-study-gloss { color: #493805; }
                .dlt-study-text button[data-phrase] .dlt-study-source { white-space: pre-wrap; }
                .dlt-study-text[data-layout] button[data-phrase][aria-pressed="true"] {
                    box-shadow: inset 0 0 0 2px #5b4100;
                }
                .dlt-study-original { position: relative; }
                .dlt-study-original[data-popover="true"] { padding-top: 3.3em; }
                .dlt-study-popover {
                    position: absolute; transform: translateY(-100%); z-index: 2; visibility: hidden;
                    box-sizing: border-box; width: max-content; max-width: min(17em, 100%);
                    padding: 3px 7px; border: 1px solid var(--dlt-selection); border-radius: 4px;
                    color: var(--dlt-selection); background: #1d3855; pointer-events: none;
                }
                .dlt-study-popover > span { display: block; max-height: 2.4em; overflow: hidden; }
                .dlt-study-popover::after {
                    content: ""; position: absolute; bottom: -4px; left: var(--dlt-arrow);
                    width: 6px; height: 6px; transform: translateX(-50%) rotate(45deg);
                    background: #1d3855; border-right: 1px solid var(--dlt-selection);
                    border-bottom: 1px solid var(--dlt-selection);
                }
                .dlt-study-caption { color: #bdcddd; font-size: 0.75em; }
                .dlt-study-word { margin-top: 6px; padding-left: 8px; border-left: 2px solid var(--dlt-selection); }
                .dlt-study-word-pair {
                    display: flex; align-items: baseline; flex-wrap: wrap; gap: 6px; color: var(--dlt-selection);
                }
                .dlt-study-word-pair strong { background: var(--dlt-selection-fill); padding: 0 4px; border-radius: 4px; }
                .dlt-study-translation {
                    margin-top: 8px; padding-top: 6px; border-top: 1px solid #354559;
                }
                .dlt-study-translation-text { max-height: 14vh; overflow-y: auto; white-space: pre-wrap; }
            `}</style>
            {regions.map(({ rect }, index) => (
                <button
                    key={index}
                    type="button"
                    className="dlt-study-region"
                    aria-label={`Text block ${index + 1}`}
                    aria-pressed={index === selection.region}
                    onClick={() => selectRegion(index)}
                    style={{
                        position: "absolute", boxSizing: "border-box", padding: 0,
                        left: rect.left * widthFactor, top: rect.top * heightFactor,
                        width: (rect.right - rect.left) * widthFactor,
                        height: (rect.bottom - rect.top) * heightFactor,
                        border: index === selection.region ? "2px solid #9ed1ff" : "1px solid #ffffff70",
                        background: "transparent", cursor: "pointer",
                    }}
                />
            ))}
            <section aria-label="Learn English"
                className="dlt-study"
                style={{
                    position: "absolute", zIndex: 1, left: "50%", transform: "translateX(-50%)",
                    ...(panelAtTop ? { top: "8px" } : { bottom: "8px" }),
                    width: "min(660px, 96vw)", maxWidth: "96%", boxSizing: "border-box",
                    background: "#101923", color: "#f2f6fc", border: "1px solid #62748c",
                    borderRadius: 6, padding: "8px 12px", fontSize: "clamp(14px, 2vh, 20px)",
                }}
            >
                <div className="dlt-study-actions">
                    <button type="button" disabled={regions.length < 2} onClick={() => moveRegion(-1)} aria-label="Previous block">L1</button>
                    <span>{selection.region + 1} / {regions.length}</span>
                    <button type="button" disabled={regions.length < 2} onClick={() => moveRegion(1)} aria-label="Next block">R1</button>
                    <button type="button" aria-pressed={selection.words} onClick={toggleWords}>
                        {selection.words ? "Words" : "Phrases"}
                    </button>
                    {failedTranslation && <button type="button" onClick={failedTranslation.retry}>Retry translation</button>}
                    <button type="button" onClick={dismiss}>Close</button>
                </div>
                <div style={{ marginTop: 8, overflowWrap: "anywhere" }}>
                    <div className="dlt-study-original" data-popover={showPopover}>
                        {showGlosses && <div className="dlt-study-caption">{phraseMatches?.length ? "Words and expressions" : "Words on their own"}</div>}
                        <div ref={studyText} lang="en" className="dlt-study-text" data-layout={activeLayout} data-glosses={showGlosses}>
                            {segments.map(segment => {
                                if (!segment.selectable) return <span key={segment.start}>{segment.text}</span>;
                                const index = partIndex++;
                                const selected = index === selectedIndex;
                                return (
                                    <button key={segment.start} type="button" aria-pressed={selected}
                                        data-phrase={segment.phrase?.canonical}
                                        ref={selected ? selectedPart : undefined}
                                        onClick={() => setSelection(previous => ({ ...previous, partStart: segment.start }))}>
                                        <span className="dlt-study-source">{segment.text}</span>
                                        {showGlosses && (
                                            <span className="dlt-study-gloss" lang={targetLanguage} dir="auto">{glossFor(segment.text)}</span>
                                        )}
                                    </button>
                                );
                            })}
                        </div>
                        {showPopover && selectedWord && (
                            <StudyWordPopover anchor={selectedPart} targetLanguage={targetLanguage}
                                translation={translationText(wordTranslation.value, selectedWord)} />
                        )}
                    </div>
                    {individualWordVisible && activeLayout === "row" && selectedWord && (
                        <div className="dlt-study-word">
                            <div className="dlt-study-caption">{selectedSegment?.phrase ? "Expression on its own" : "Word on its own"}</div>
                            <div className="dlt-study-word-pair" aria-live="polite">
                                <strong lang="en">{selectedWord}</strong>
                                <span aria-hidden="true">→</span>
                                <span lang={targetLanguage} dir="auto">{translationText(wordTranslation.value, selectedWord)}</span>
                            </div>
                        </div>
                    )}
                    {interlinearError && <div role="alert" className="dlt-study-caption">{interlinearError}</div>}
                    <div className="dlt-study-translation">
                        <div className="dlt-study-caption">Translation</div>
                        <div aria-live="polite" className="dlt-study-translation-text" lang={targetConfigured ? targetLanguage : undefined} dir="auto">
                            {targetConfigured ? translationText(blockTranslation.value, region.text)
                                : "Choose a translation language other than English in the Translation tab."}
                        </div>
                    </div>
                </div>
                <div style={{ marginTop: 6, fontSize: "0.78em", color: "#bdcddd" }}>
                    <div>L1/R1 Blocks · D-pad / Left stick Move · X Words/Phrases{failedTranslation ? " · A Retry" : ""} · B Close</div>
                </div>
            </section>
        </>
    );
}
