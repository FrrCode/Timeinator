/**
 * Interval arithmetic over absolute time, shared by the server (which
 * normalizes marks on write) and the browser (which ranks proposals from the
 * fetched snapshot). One copy, imported twice, is what keeps the two in
 * agreement about what "overlapping" means.
 *
 * Every bound is UTC epoch seconds, and every range is half-open: `[start,
 * end)`. Two intervals that touch therefore merge rather than overlap.
 */

export type Kind = "busy" | "preferred";

export type Interval = {
	start: number;
	end: number;
};

export type Mark = Interval & {
	participantId: string;
	kind: Kind;
};

/** Sorted, non-overlapping, with touching runs joined. Empty spans are dropped. */
export function mergeIntervals(intervals: Interval[]): Interval[] {
	const sorted = intervals
		.filter((interval) => interval.end > interval.start)
		.sort((a, b) => a.start - b.start);

	const merged: Interval[] = [];
	for (const interval of sorted) {
		const last = merged[merged.length - 1];
		// `<=` rather than `<`: half-open ranges that touch are one range.
		if (last && interval.start <= last.end) {
			last.end = Math.max(last.end, interval.end);
			continue;
		}
		merged.push({ start: interval.start, end: interval.end });
	}
	return merged;
}

/** Everything in `from` that no interval of `cut` covers. */
export function subtractIntervals(
	from: Interval[],
	cut: Interval[],
): Interval[] {
	let remaining = mergeIntervals(from);

	for (const hole of mergeIntervals(cut)) {
		const next: Interval[] = [];
		for (const piece of remaining) {
			if (hole.end <= piece.start || hole.start >= piece.end) {
				next.push(piece);
				continue;
			}
			if (piece.start < hole.start) {
				next.push({ start: piece.start, end: hole.start });
			}
			if (hole.end < piece.end) {
				next.push({ start: hole.end, end: piece.end });
			}
		}
		remaining = next;
	}
	return remaining;
}

export function intersects(a: Interval, b: Interval) {
	return a.start < b.end && b.start < a.end;
}

/** True when `window` sits entirely inside the union of `intervals`. */
export function covers(intervals: Interval[], window: Interval) {
	return mergeIntervals(intervals).some(
		(interval) => interval.start <= window.start && interval.end >= window.end,
	);
}

/**
 * The canonical form of a set of marks: per participant, same-kind intervals
 * are merged, and the two kinds are made mutually exclusive with `busy`
 * winning any overlap.
 *
 * The busy-wins rule is fixed rather than last-write-wins because the API
 * replaces a participant's whole mark set in one request, so a payload has no
 * ordering to appeal to. The client subtracts as it paints, which means this
 * rule only ever fires on a malformed or replayed payload — but it has to be
 * deterministic when it does.
 */
export function normalizeMarks(marks: Mark[]): Mark[] {
	const byParticipant = new Map<string, Mark[]>();
	for (const mark of marks) {
		const existing = byParticipant.get(mark.participantId);
		if (existing) {
			existing.push(mark);
		} else {
			byParticipant.set(mark.participantId, [mark]);
		}
	}

	const normalized: Mark[] = [];
	for (const [participantId, own] of byParticipant) {
		const busy = mergeIntervals(own.filter((mark) => mark.kind === "busy"));
		const preferred = subtractIntervals(
			own.filter((mark) => mark.kind === "preferred"),
			busy,
		);
		for (const interval of busy) {
			normalized.push({ participantId, kind: "busy", ...interval });
		}
		for (const interval of preferred) {
			normalized.push({ participantId, kind: "preferred", ...interval });
		}
	}

	return normalized.sort(
		(a, b) =>
			a.start - b.start ||
			a.participantId.localeCompare(b.participantId) ||
			a.kind.localeCompare(b.kind),
	);
}
