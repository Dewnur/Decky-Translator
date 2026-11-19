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
    extractions: PhraseExtraction[] | null;
}

export function splitPhrases(text: string, matches: readonly PhraseMatch[]) {
    // Python ranges count Unicode code points. The UI positions count UTF-16 units.
    const chars = Array.from(text);
    const parts: Array<{ start: number; text: string; phrase?: PhraseMatch }> = [];
    let cursor = 0;
    let offset = 0;

    function append(value: string, phrase?: PhraseMatch) {
        if (!value) return;
        parts.push({ start: offset, text: value, phrase });
        offset += value.length;
    }

    for (const match of matches.slice(0, 2)) {
        const { start, end, surface } = match;
        if (!Number.isInteger(start) || !Number.isInteger(end) || start < cursor || end <= start || end > chars.length) continue;
        const value = chars.slice(start, end).join("");
        if (value !== surface) continue;
        append(chars.slice(cursor, start).join(""));
        append(value, match);
        cursor = end;
    }
    append(chars.slice(cursor).join(""));
    return parts;
}
