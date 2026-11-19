import type { TextRegion } from "../TextRecognizer";

export const STUDY_PANEL_MARGIN = 8;

export function placeStudyPanel(rect: TextRegion["rect"], width: number, height: number) {
    const clearance = STUDY_PANEL_MARGIN + 12;
    const frameWidth = Math.max(0, width - 2 * STUDY_PANEL_MARGIN);
    const maxHeight = Math.min(height * 0.60, Math.max(0, height - 2 * STUDY_PANEL_MARGIN));
    const freeLeft = Math.max(0, Math.min(width, rect.left) - clearance);
    const freeRight = Math.max(0, width - Math.max(0, rect.right) - clearance);
    const freeTop = Math.max(0, Math.min(height, rect.top) - clearance);
    const freeBottom = Math.max(0, height - Math.max(0, rect.bottom) - clearance);
    const sideSpace = Math.max(freeLeft, freeRight);
    const verticalSpace = Math.max(freeTop, freeBottom);
    const offCenter = Math.abs((rect.left + rect.right - width) / 2) > width * 0.10;
    const minimumHeight = Math.min(148, maxHeight);

    if (sideSpace >= Math.min(300, width * 0.4) && (offCenter || verticalSpace < minimumHeight)) {
        return {
            side: freeLeft >= freeRight ? "left" as const : "right" as const,
            width: Math.min(sideSpace, 460),
            maxHeight,
        };
    }

    return {
        side: freeTop >= freeBottom ? "top" as const : "bottom" as const,
        width: Math.min(frameWidth, 740),
        maxHeight: Math.min(maxHeight, Math.max(minimumHeight, verticalSpace)),
    };
}
