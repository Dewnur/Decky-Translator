import type { TextRegion } from "../TextRecognizer";

export function findInitialStudyRegion(regions: readonly TextRegion[], width: number, height: number): number {
    if (width <= 0 || height <= 0) return 0;

    let bestIndex = 0;
    let bestScore = Infinity;

    regions.forEach(({ rect, text, isDialog }, index) => {
        if (rect.right <= rect.left || rect.bottom <= rect.top) return;
        const x = (rect.left + rect.right) / (2 * width);
        const y = (rect.top + rect.bottom) / (2 * height);
        if (x < 0 || x > 1 || y < 0.60 || y > 1) return;

        // Favor the lower center of the frame and longer lines over short HUD labels.
        const shortLabel = !isDialog && text.trim().split(/\s+/).length < 3;
        const score = Math.abs(y - 0.83) + 0.85 * Math.abs(x - 0.5) + (shortLabel ? 0.22 : 0);
        if (score < bestScore) {
            bestIndex = index;
            bestScore = score;
        }
    });

    return bestIndex;
}
