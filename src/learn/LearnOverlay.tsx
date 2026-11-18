import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "../Input";
import type { Input } from "../Input";
import type { TextRegion } from "../TextRecognizer";
import { segmentText } from "./segmentText";
import { findInitialStudyRegion } from "./subtitlePriority";
import { useStudyTranslation } from "./useStudyTranslation";

export interface LearnControls {
    dismiss: () => void;
    subscribeToButtonPresses: Input['subscribeToButtonPresses'];
    translateRegion: (region: TextRegion, targetLanguage: string) => Promise<string>;
}

interface LearnOverlayProps extends LearnControls {
    regions: TextRegion[];
    targetLanguage: string;
    widthFactor: number;
    heightFactor: number;
    imageHeight: number;
    captureWidth: number;
    captureHeight: number;
}

export function LearnOverlay({
    regions, targetLanguage, widthFactor, heightFactor, imageHeight, captureWidth, captureHeight,
    dismiss, subscribeToButtonPresses, translateRegion,
}: LearnOverlayProps) {
    const [selection, setSelection] = useState(() => ({
        region: findInitialStudyRegion(regions, captureWidth, captureHeight),
        part: 0,
        words: false,
    }));
    const requests = useRef(new Map<string, Promise<string>>());
    const selectedPart = useRef<HTMLButtonElement>(null);

    const region = regions[selection.region];
    const segments = useMemo(() => segmentText(region.text, selection.words), [region.text, selection.words]);
    const parts = segments.filter(segment => segment.selectable);
    const targetConfigured = !!targetLanguage && targetLanguage !== 'en';
    const selectedWord = selection.words ? parts[selection.part]?.text : undefined;
    const panelAtTop = (region.rect.top + region.rect.bottom) * heightFactor / 2 > imageHeight / 2;

    const request = useCallback((text: string) => {
        const key = JSON.stringify([targetLanguage, text]);
        const existing = requests.current.get(key);
        if (existing) return existing;

        const pending = translateRegion({ ...region, text }, targetLanguage)
            .then(translated => {
                if (!translated || translated === text.trim()) requests.current.delete(key);
                return translated;
            })
            .catch(error => {
                requests.current.delete(key);
                throw error;
            });
        requests.current.set(key, pending);
        return pending;
    }, [region, targetLanguage, translateRegion]);

    const blockTranslation = useStudyTranslation(targetConfigured ? region.text : null, request, 120);
    const wordTranslation = useStudyTranslation(
        blockTranslation.value.status === "ready" ? selectedWord ?? null : null,
        request,
        250,
    );
    const failedTranslation = blockTranslation.value.status === "error" ? blockTranslation
        : selectedWord && wordTranslation.value.status === "error" ? wordTranslation : null;

    function selectRegion(index: number) {
        setSelection(previous => ({ ...previous, region: index, part: 0 }));
    }

    function moveRegion(delta: number) {
        setSelection(previous => ({
            ...previous,
            region: (previous.region + delta + regions.length) % regions.length,
            part: 0,
        }));
    }

    function movePart(delta: number) {
        if (!parts.length) return;
        setSelection(previous => ({ ...previous, part: (previous.part + delta + parts.length) % parts.length }));
    }

    function toggleWords() {
        setSelection(previous => ({ ...previous, words: !previous.words, part: 0 }));
    }

    function translationText(value: typeof blockTranslation.value, source: string): string {
        switch (value.status) {
            case "loading": return "Translating…";
            case "error": return value.message;
            case "ready": return value.text && value.text !== source.trim()
                ? value.text : "No distinct translation returned.";
        }
    }

    const handleButton = useRef<(button: Button) => void>(() => {});
    handleButton.current = button => {
        switch (button) {
            case Button.DPAD_UP: moveRegion(-1); break;
            case Button.DPAD_DOWN: moveRegion(1); break;
            case Button.DPAD_LEFT: movePart(-1); break;
            case Button.DPAD_RIGHT: movePart(1); break;
            case Button.A: failedTranslation?.retry(); break;
            case Button.B: dismiss(); break;
            case Button.X: toggleWords(); break;
        }
    };

    useEffect(() => subscribeToButtonPresses(button => handleButton.current(button)), [subscribeToButtonPresses]);

    useEffect(() => {
        selectedPart.current?.scrollIntoView?.({ block: "nearest", inline: "nearest" });
    }, [selection.region, selection.part, selection.words]);

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
                }
                .dlt-study-text[data-words="true"] button { border-bottom-color: #62748c; }
                .dlt-study-text[data-words] button[aria-pressed="true"] {
                    color: var(--dlt-selection); background: var(--dlt-selection-fill);
                    border-color: var(--dlt-selection);
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
                    <button type="button" onClick={() => moveRegion(-1)} aria-label="Previous block">↑</button>
                    <span>{selection.region + 1} / {regions.length}</span>
                    <button type="button" onClick={() => moveRegion(1)} aria-label="Next block">↓</button>
                    <button type="button" aria-pressed={selection.words} onClick={toggleWords}>
                        {selection.words ? "Words" : "Phrases"}
                    </button>
                    {failedTranslation && <button type="button" onClick={failedTranslation.retry}>Retry translation</button>}
                    <button type="button" onClick={dismiss}>Close</button>
                </div>
                <div style={{ marginTop: 8, overflowWrap: "anywhere" }}>
                    <div lang="en" className="dlt-study-text" data-words={selection.words}>
                        {segments.map(segment => {
                            if (!segment.selectable) return <span key={segment.start}>{segment.text}</span>;
                            const index = partIndex++;
                            const selected = index === selection.part;
                            return (
                                <button key={segment.start} type="button" aria-pressed={selected}
                                    ref={selected ? selectedPart : undefined}
                                    onClick={() => setSelection(previous => ({ ...previous, part: index }))}>
                                    {segment.text}
                                </button>
                            );
                        })}
                    </div>
                    {selectedWord && targetConfigured && blockTranslation.value.status !== "error" && (
                        <div className="dlt-study-word">
                            <div className="dlt-study-caption">Word on its own</div>
                            <div className="dlt-study-word-pair" aria-live="polite">
                                <strong lang="en">{selectedWord}</strong>
                                <span aria-hidden="true">→</span>
                                <span lang={targetLanguage} dir="auto">{translationText(wordTranslation.value, selectedWord)}</span>
                            </div>
                        </div>
                    )}
                    <div className="dlt-study-translation">
                        <div className="dlt-study-caption">Translation</div>
                        <div aria-live="polite" className="dlt-study-translation-text" lang={targetConfigured ? targetLanguage : undefined} dir="auto">
                            {targetConfigured ? translationText(blockTranslation.value, region.text)
                                : "Choose a translation language other than English in the Translation tab."}
                        </div>
                    </div>
                </div>
                <div style={{ marginTop: 6, fontSize: "0.78em", color: "#bdcddd" }}>
                    <div>↑↓ Blocks · ←→ Text · X Words/Phrases{failedTranslation ? " · A Retry" : ""} · B Close</div>
                </div>
            </section>
        </>
    );
}
