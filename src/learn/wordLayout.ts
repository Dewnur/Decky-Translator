export const LEARN_WORD_LAYOUTS = [
    { label: "Below the original", data: "row" },
    { label: "Tooltip above the word", data: "popover" },
    { label: "Translation under each word", data: "interlinear" },
] as const;

export type LearnWordLayout = typeof LEARN_WORD_LAYOUTS[number]["data"];

export const DEFAULT_LEARN_WORD_LAYOUT: LearnWordLayout = "interlinear";

export function parseLearnWordLayout(value: unknown): LearnWordLayout {
    return LEARN_WORD_LAYOUTS.find(layout => layout.data === value)?.data ?? DEFAULT_LEARN_WORD_LAYOUT;
}
