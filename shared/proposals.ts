import {
	type Interval,
	intersects,
	type Mark,
	mergeIntervals,
} from "./intervals.ts";

/** Candidates start on the quarter hour: the finest grid zoom is 15 minutes. */
const STEP_SECONDS = 15 * 60;

export type Proposal = {
	start: number;
	end: number;
	/** Participants whose `preferred` marks fully cover the window. */
	preferredBy: string[];
	/** Participants with no mark of either kind touching the window. */
	silent: string[];
};

export type Blocker = {
	participantId: string;
	/** Windows somebody wanted that this participant's busy time ruled out. */
	blocked: number;
};

type FindProposalsInput = {
	marks: Mark[];
	participantIds: string[];
	lengthSeconds: number;
	limit?: number;
};

/** Every aligned window of `lengthSeconds` inside the union of preferred marks. */
function* candidateWindows(preferred: Mark[], lengthSeconds: number) {
	for (const region of mergeIntervals(preferred)) {
		const first = Math.ceil(region.start / STEP_SECONDS) * STEP_SECONDS;
		for (
			let start = first;
			start + lengthSeconds <= region.end;
			start += STEP_SECONDS
		) {
			yield { start, end: start + lengthSeconds } satisfies Interval;
		}
	}
}

/**
 * The windows worth suggesting, best first.
 *
 * A window is disqualified if any participant's `busy` mark intersects it at
 * all, and scored by how many participants' `preferred` marks fully cover it.
 * The asymmetry is the point: a fragment of busy ruins a meeting, a fragment of
 * preferred does not make one.
 */
export function findProposals({
	marks,
	participantIds,
	lengthSeconds,
	limit = 8,
}: FindProposalsInput): Proposal[] {
	if (lengthSeconds <= 0 || participantIds.length === 0) {
		return [];
	}

	const known = new Set(participantIds);
	const relevant = marks.filter((mark) => known.has(mark.participantId));
	const busy = relevant.filter((mark) => mark.kind === "busy");
	const preferred = relevant.filter((mark) => mark.kind === "preferred");
	if (preferred.length === 0) {
		return [];
	}

	// Merged up front: the cell loop would otherwise re-sort on every window.
	const perParticipant = participantIds.map((id) => ({
		id,
		preferred: mergeIntervals(
			preferred.filter((mark) => mark.participantId === id),
		),
		marked: mergeIntervals(
			relevant.filter((mark) => mark.participantId === id),
		),
	}));

	const scored: Proposal[] = [];
	// Candidates come only from inside the union of preferred marks: a window
	// that scores above zero lies wholly within someone's preferred interval, so
	// nothing is missed and the search stays bounded by what people marked.
	for (const window of candidateWindows(preferred, lengthSeconds)) {
		if (busy.some((mark) => intersects(mark, window))) {
			continue;
		}

		const preferredBy: string[] = [];
		const silent: string[] = [];
		for (const participant of perParticipant) {
			const prefers = participant.preferred.some(
				(interval) =>
					interval.start <= window.start && interval.end >= window.end,
			);
			if (prefers) {
				preferredBy.push(participant.id);
				continue;
			}
			const touched = participant.marked.some((interval) =>
				intersects(interval, window),
			);
			if (!touched) {
				silent.push(participant.id);
			}
		}

		if (preferredBy.length === 0) {
			continue;
		}
		scored.push({ start: window.start, end: window.end, preferredBy, silent });
	}

	scored.sort(
		(a, b) => b.preferredBy.length - a.preferredBy.length || a.start - b.start,
	);

	const chosen: Proposal[] = [];
	for (const proposal of scored) {
		if (chosen.length >= limit) {
			break;
		}
		// A near-identical window shifted by 15 minutes is not a second option.
		if (chosen.some((taken) => intersects(taken, proposal))) {
			continue;
		}
		chosen.push(proposal);
	}
	return chosen;
}

/**
 * Who to go and ask when nothing works.
 *
 * Counts, per participant, the windows somebody actually wanted that this
 * participant's busy time ruled out. An empty proposals list is otherwise a
 * dead end; this turns it into a name.
 */
export function findBlockers({
	marks,
	participantIds,
	lengthSeconds,
}: Omit<FindProposalsInput, "limit">): Blocker[] {
	if (lengthSeconds <= 0 || participantIds.length === 0) {
		return [];
	}

	const known = new Set(participantIds);
	const relevant = marks.filter((mark) => known.has(mark.participantId));
	const preferred = relevant.filter((mark) => mark.kind === "preferred");
	if (preferred.length === 0) {
		return [];
	}

	const perParticipant = participantIds.map((id) => ({
		id,
		busy: mergeIntervals(
			relevant.filter(
				(mark) => mark.participantId === id && mark.kind === "busy",
			),
		),
		preferred: mergeIntervals(
			preferred.filter((mark) => mark.participantId === id),
		),
	}));

	const blocked = new Map<string, number>();
	for (const window of candidateWindows(preferred, lengthSeconds)) {
		const wanted = perParticipant.some((participant) =>
			participant.preferred.some(
				(interval) =>
					interval.start <= window.start && interval.end >= window.end,
			),
		);
		if (!wanted) {
			continue;
		}
		for (const participant of perParticipant) {
			if (participant.busy.some((interval) => intersects(interval, window))) {
				blocked.set(participant.id, (blocked.get(participant.id) ?? 0) + 1);
			}
		}
	}

	return [...blocked]
		.map(([participantId, count]) => ({ participantId, blocked: count }))
		.sort((a, b) => b.blocked - a.blocked);
}
