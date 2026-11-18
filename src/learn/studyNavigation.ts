type PartPosition = Pick<DOMRect, "top" | "left" | "width">;

export function findVerticalStudyPart(
    positions: readonly PartPosition[],
    current: number,
    direction: -1 | 1,
): number {
    const origin = positions[current];
    if (!origin) return current;

    const rowTolerance = 1;
    let rowDistance = Infinity;
    for (const position of positions) {
        const distance = (position.top - origin.top) * direction;
        if (distance > rowTolerance && distance < rowDistance) rowDistance = distance;
    }
    if (rowDistance === Infinity) return current;

    let closest = current;
    let closestDistance = Infinity;
    const originCenter = origin.left + origin.width / 2;
    positions.forEach((position, index) => {
        const distance = (position.top - origin.top) * direction;
        if (distance <= rowTolerance || Math.abs(distance - rowDistance) > rowTolerance) return;
        const horizontalDistance = Math.abs(position.left + position.width / 2 - originCenter);
        if (horizontalDistance < closestDistance) {
            closest = index;
            closestDistance = horizontalDistance;
        }
    });
    return closest;
}
