import {
	type Interval,
	type Kind,
	type Mark,
	mergeIntervals,
	normalizeMarks,
	subtractIntervals,
} from "./intervals.ts";

export type PaintOperation = "apply" | "clear";

function toMarks(participantId: string, intervals: Interval[], kind: Kind) {
	return intervals.map(
		(interval): Mark => ({ participantId, kind, ...interval }),
	);
}

/**
 * One participant's marks after a drag stroke.
 *
 * Applying a kind removes the other kind underneath rather than stacking on
 * top of it, so a cell always answers exactly one question. Doing that here
 * rather than only on the server is what keeps the grid honest during the
 * half-second before the save lands.
 */
export function applyPaint({
	mine,
	participantId,
	painted,
	kind,
	operation,
}: {
	mine: Mark[];
	participantId: string;
	painted: Interval[];
	kind: Kind;
	operation: PaintOperation;
}): Mark[] {
	const stroke = mergeIntervals(painted);
	if (stroke.length === 0) {
		return normalizeMarks(mine);
	}

	const other: Kind = kind === "busy" ? "preferred" : "busy";
	const ownOf = (wanted: Kind) =>
		mine.filter((existing) => existing.kind === wanted);

	if (operation === "clear") {
		return normalizeMarks([
			...toMarks(participantId, subtractIntervals(ownOf(kind), stroke), kind),
			...toMarks(participantId, subtractIntervals(ownOf(other), stroke), other),
		]);
	}

	return normalizeMarks([
		...toMarks(
			participantId,
			mergeIntervals([...ownOf(kind), ...stroke]),
			kind,
		),
		...toMarks(participantId, subtractIntervals(ownOf(other), stroke), other),
	]);
}
