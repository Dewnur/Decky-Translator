import type { TextRegion } from "../TextRecognizer";

export interface PhraseMatch {
    start: number;
    end: number;
    surface: string;
    canonical: string;
    translation: string;
}

export interface PhraseExtraction {
    text: string;
    phrases: PhraseMatch[];
}

export interface PhraseView {
    candidates: readonly TextRegion[];
    extractions: PhraseExtraction[];
}

export function findSubtitle(candidates: readonly TextRegion[], width: number, height: number): TextRegion | undefined {
    if (width <= 0 || height <= 0) return;
    let best: TextRegion | undefined;
    let bestScore = Infinity;
    for (const region of candidates) {
        const { rect, text, isDialog } = region;
        if (rect.right <= rect.left || rect.bottom <= rect.top || (!isDialog && text.trim().split(/\s+/).length < 3)) continue;
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

export function splitPhrases(text: string, matches: readonly PhraseMatch[]) {
    // Python indices count Unicode code points. String.slice would count UTF-16 units.
    const chars = Array.from(text);
    const parts: Array<{ text: string; phrase?: PhraseMatch }> = [];
    let cursor = 0;
    for (const match of matches.slice(0, 2)) {
        const { start, end, surface } = match;
        if (!Number.isInteger(start) || !Number.isInteger(end) || start < cursor || end <= start || end > chars.length) continue;
        const phrase = chars.slice(start, end).join("");
        if (phrase !== surface) continue;
        if (start > cursor) parts.push({ text: chars.slice(cursor, start).join("") });
        parts.push({ text: phrase, phrase: match });
        cursor = end;
    }
    if (cursor < chars.length) parts.push({ text: chars.slice(cursor).join("") });
    return parts;
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
