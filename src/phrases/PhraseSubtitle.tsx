import type { TextRegion } from "../TextRecognizer";
import { splitPhrases } from "./phraseSegments";
import type { PhraseMatch, PhraseView } from "./phraseSegments";

export function findSubtitle({ candidates, extractions }: PhraseView, width: number, height: number): TextRegion | undefined {
    if (width <= 0 || height <= 0) return;
    const matchedTexts = new Set(extractions?.filter(extraction => extraction.phrases.length).map(extraction => extraction.text));
    let best: TextRegion | undefined;
    let bestScore = Infinity;
    for (const region of candidates) {
        const { rect, text, isDialog } = region;
        if (rect.right <= rect.left || rect.bottom <= rect.top) continue;
        if (!isDialog && !matchedTexts.has(text) && text.trim().split(/\s+/).length < 3) continue;
        const x = (rect.left + rect.right) / (2 * width);
        const y = (rect.top + rect.bottom) / (2 * height);
        if (x < 0.18 || x > 0.82 || y < 0.60 || y > 1) continue;
        const score = Math.abs(y - 0.83) + 0.85 * Math.abs(x - 0.5);
        if (score < bestScore) {
            best = region;
            bestScore = score;
        }
    }
    return best;
}

export function matchesSubtitle(region: TextRegion, subtitle: TextRegion): boolean {
    return region.text === subtitle.text && region.rect.left === subtitle.rect.left &&
        region.rect.top === subtitle.rect.top && region.rect.right === subtitle.rect.right &&
        region.rect.bottom === subtitle.rect.bottom;
}

interface Props {
    subtitle: TextRegion;
    matches: readonly PhraseMatch[];
    translation?: string;
    heightFactor: number;
    imageHeight: number;
}

export function PhraseSubtitle({ subtitle, matches, translation, heightFactor, imageHeight }: Props) {
    const fontSize = Math.max(15, Math.min(24, imageHeight * 0.033));
    const bottom = Math.max(0, imageHeight - subtitle.rect.bottom * heightFactor - fontSize * 2.8);
    return (
        <div style={{
            position: "absolute", bottom, left: "5%", right: "5%", zIndex: 2, pointerEvents: "none",
            textAlign: "center", lineHeight: 1.35, fontSize, color: "#fff", whiteSpace: "pre-wrap",
            overflowWrap: "anywhere", padding: "5px 10px", borderRadius: 6, background: "rgba(13, 18, 25, 0.94)",
        }}>
            <div lang="en">
                {splitPhrases(subtitle.text, matches).map((part, index) =>
                    part.phrase ? (
                        <span key={index} style={{ color: "#ffd84d" }} data-phrase={part.phrase.canonical}>{part.text}</span>
                    ) : part.text,
                )}
            </div>
            <div dir="auto" style={{ minHeight: "2.7em", color: "#f2f2f2" }}>{translation}</div>
        </div>
    );
}
