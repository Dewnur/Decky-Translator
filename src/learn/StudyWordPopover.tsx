import { useLayoutEffect, useRef } from "react";
import type { RefObject } from "react";

interface StudyWordPopoverProps {
    anchor: RefObject<HTMLButtonElement>;
    translation: string;
    targetLanguage: string;
}

export function StudyWordPopover({ anchor, translation, targetLanguage }: StudyWordPopoverProps) {
    const popup = useRef<HTMLDivElement>(null);

    useLayoutEffect(() => {
        const word = anchor.current;
        const bubble = popup.current;
        const container = bubble?.parentElement;
        const scroller = word?.closest(".dlt-study-text");
        if (!container || !word || !bubble || !scroller) return;

        const position = () => {
            const frame = container.getBoundingClientRect();
            const token = word.getBoundingClientRect();
            const visibleText = scroller.getBoundingClientRect();
            if (token.bottom <= visibleText.top || token.top >= visibleText.bottom) {
                bubble.style.visibility = "hidden";
                return;
            }

            const center = token.left + token.width / 2 - frame.left;
            const width = bubble.offsetWidth;
            const left = Math.max(0, Math.min(center - width / 2, frame.width - width));
            bubble.style.left = `${left}px`;
            bubble.style.top = `${Math.max(token.top, visibleText.top) - frame.top - 7}px`;
            bubble.style.setProperty("--dlt-arrow", `${Math.max(6, Math.min(center - left, width - 6))}px`);
            bubble.style.visibility = "visible";
        };

        position();
        scroller.addEventListener("scroll", position);
        window.addEventListener("resize", position);
        return () => {
            scroller.removeEventListener("scroll", position);
            window.removeEventListener("resize", position);
        };
    });

    return (
        <div ref={popup} className="dlt-study-popover" aria-live="polite" lang={targetLanguage}>
            <span dir="auto">{translation}</span>
        </div>
    );
}
