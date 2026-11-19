import { splitPhrases } from "../phrases/phraseSegments";
import type { PhraseMatch } from "../phrases/phraseSegments";

export interface StudySegment {
    start: number;
    text: string;
    selectable: boolean;
    phrase?: PhraseMatch;
}

export function reflowStudyText(text: string): string {
    return text.replace(/\r\n?/g, "\n").replace(/[ \t]*\n(?:[ \t]*\n)*[ \t]*/g, lineBreaks =>
        lineBreaks.indexOf("\n") === lineBreaks.lastIndexOf("\n") ? " " : "\n\n",
    );
}

export function segmentText(text: string, words: boolean, matches: readonly PhraseMatch[] = []): StudySegment[] {
    if (!words || !matches.length) return segmentPlainText(text, words);

    return splitPhrases(text, matches).flatMap(({ start, text, phrase }) => {
        if (phrase) return [{ start, text, selectable: true, phrase }];
        return segmentPlainText(text, true).map(segment => ({ ...segment, start: start + segment.start }));
    });
}

function segmentPlainText(text: string, words: boolean): StudySegment[] {
    const pattern = words
        ? /[\p{L}\p{M}\p{N}]+(?:['’-][\p{L}\p{M}\p{N}]+)*/gu
        : /[^.!?,;:…\r\n]+[.!?,;:…]*/gu;
    const segments: StudySegment[] = [];
    let end = 0;

    for (const match of text.matchAll(pattern)) {
        const value = match[0].trim();
        if (!/[\p{L}\p{N}]/u.test(value)) continue;
        const start = match.index! + match[0].indexOf(value);
        if (start > end) segments.push({ start: end, text: text.slice(end, start), selectable: false });
        segments.push({ start, text: value, selectable: true });
        end = start + value.length;
    }

    if (end < text.length) segments.push({ start: end, text: text.slice(end), selectable: false });
    return segments;
}
