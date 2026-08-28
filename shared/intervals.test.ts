import { describe, expect, it } from "vitest";
import {
	covers,
	intersects,
	mergeIntervals,
	normalizeMarks,
	subtractIntervals,
} from "./intervals.ts";

/** Epoch seconds from an ISO string, so the tests read as times. */
function s(iso: string) {
	return Date.parse(iso) / 1000;
}

describe("mergeIntervals", () => {
	it("returns an empty list unchanged", () => {
		expect(mergeIntervals([])).toEqual([]);
	});

	it("drops empty and inverted intervals", () => {
		expect(mergeIntervals([{ start: 10, end: 10 }])).toEqual([]);
		expect(mergeIntervals([{ start: 20, end: 10 }])).toEqual([]);
	});

	it("sorts and merges overlapping intervals", () => {
		expect(
			mergeIntervals([
				{ start: 30, end: 50 },
				{ start: 10, end: 40 },
			]),
		).toEqual([{ start: 10, end: 50 }]);
	});

	it("merges touching intervals, because the range is half-open", () => {
		expect(
			mergeIntervals([
				{ start: 10, end: 20 },
				{ start: 20, end: 30 },
			]),
		).toEqual([{ start: 10, end: 30 }]);
	});

	it("keeps a gap between disjoint intervals", () => {
		expect(
			mergeIntervals([
				{ start: 10, end: 20 },
				{ start: 30, end: 40 },
			]),
		).toEqual([
			{ start: 10, end: 20 },
			{ start: 30, end: 40 },
		]);
	});

	it("swallows an interval contained in another", () => {
		expect(
			mergeIntervals([
				{ start: 10, end: 100 },
				{ start: 40, end: 50 },
			]),
		).toEqual([{ start: 10, end: 100 }]);
	});

	it("does not mutate its input", () => {
		const input = [{ start: 10, end: 20 }];
		mergeIntervals(input);
		expect(input).toEqual([{ start: 10, end: 20 }]);
	});
});

describe("subtractIntervals", () => {
	it("punches a hole in the middle", () => {
		expect(
			subtractIntervals([{ start: 0, end: 100 }], [{ start: 40, end: 60 }]),
		).toEqual([
			{ start: 0, end: 40 },
			{ start: 60, end: 100 },
		]);
	});

	it("trims a leading overlap", () => {
		expect(
			subtractIntervals([{ start: 0, end: 100 }], [{ start: 0, end: 40 }]),
		).toEqual([{ start: 40, end: 100 }]);
	});

	it("removes an interval that is fully covered", () => {
		expect(
			subtractIntervals([{ start: 10, end: 20 }], [{ start: 0, end: 100 }]),
		).toEqual([]);
	});

	it("leaves a non-overlapping interval alone", () => {
		expect(
			subtractIntervals([{ start: 0, end: 10 }], [{ start: 10, end: 20 }]),
		).toEqual([{ start: 0, end: 10 }]);
	});

	it("applies every cut, not just the first", () => {
		expect(
			subtractIntervals(
				[{ start: 0, end: 100 }],
				[
					{ start: 10, end: 20 },
					{ start: 60, end: 70 },
				],
			),
		).toEqual([
			{ start: 0, end: 10 },
			{ start: 20, end: 60 },
			{ start: 70, end: 100 },
		]);
	});
});

describe("intersects", () => {
	it("is false for touching intervals", () => {
		expect(intersects({ start: 0, end: 10 }, { start: 10, end: 20 })).toBe(
			false,
		);
	});

	it("is true for a one-second overlap", () => {
		expect(intersects({ start: 0, end: 11 }, { start: 10, end: 20 })).toBe(
			true,
		);
	});
});

describe("covers", () => {
	it("requires full containment, not mere overlap", () => {
		const window = {
			start: s("2026-09-02T10:00:00Z"),
			end: s("2026-09-02T11:00:00Z"),
		};
		expect(
			covers(
				[
					{
						start: s("2026-09-02T09:00:00Z"),
						end: s("2026-09-02T12:00:00Z"),
					},
				],
				window,
			),
		).toBe(true);
		expect(
			covers(
				[
					{
						start: s("2026-09-02T10:30:00Z"),
						end: s("2026-09-02T12:00:00Z"),
					},
				],
				window,
			),
		).toBe(false);
	});

	it("counts coverage across intervals that merge into one", () => {
		const window = { start: 0, end: 100 };
		expect(
			covers(
				[
					{ start: 0, end: 50 },
					{ start: 50, end: 100 },
				],
				window,
			),
		).toBe(true);
	});

	it("does not count coverage across a gap", () => {
		expect(
			covers(
				[
					{ start: 0, end: 40 },
					{ start: 60, end: 100 },
				],
				{ start: 0, end: 100 },
			),
		).toBe(false);
	});
});

describe("normalizeMarks", () => {
	it("merges a participant's touching intervals of the same kind", () => {
		expect(
			normalizeMarks([
				{ participantId: "a", start: 0, end: 100, kind: "preferred" },
				{ participantId: "a", start: 100, end: 200, kind: "preferred" },
			]),
		).toEqual([{ participantId: "a", start: 0, end: 200, kind: "preferred" }]);
	});

	it("keeps different participants apart", () => {
		expect(
			normalizeMarks([
				{ participantId: "a", start: 0, end: 100, kind: "preferred" },
				{ participantId: "b", start: 0, end: 100, kind: "preferred" },
			]),
		).toEqual([
			{ participantId: "a", start: 0, end: 100, kind: "preferred" },
			{ participantId: "b", start: 0, end: 100, kind: "preferred" },
		]);
	});

	it("lets busy win where a participant's own kinds overlap", () => {
		expect(
			normalizeMarks([
				{ participantId: "a", start: 0, end: 100, kind: "preferred" },
				{ participantId: "a", start: 40, end: 60, kind: "busy" },
			]),
		).toEqual([
			{ participantId: "a", start: 0, end: 40, kind: "preferred" },
			{ participantId: "a", start: 40, end: 60, kind: "busy" },
			{ participantId: "a", start: 60, end: 100, kind: "preferred" },
		]);
	});

	it("does not let one participant's busy touch another's preferred", () => {
		expect(
			normalizeMarks([
				{ participantId: "a", start: 0, end: 100, kind: "preferred" },
				{ participantId: "b", start: 40, end: 60, kind: "busy" },
			]),
		).toEqual([
			{ participantId: "a", start: 0, end: 100, kind: "preferred" },
			{ participantId: "b", start: 40, end: 60, kind: "busy" },
		]);
	});

	it("drops a preferred interval swallowed by busy", () => {
		expect(
			normalizeMarks([
				{ participantId: "a", start: 40, end: 60, kind: "preferred" },
				{ participantId: "a", start: 0, end: 100, kind: "busy" },
			]),
		).toEqual([{ participantId: "a", start: 0, end: 100, kind: "busy" }]);
	});

	it("is idempotent", () => {
		const once = normalizeMarks([
			{ participantId: "a", start: 0, end: 100, kind: "preferred" },
			{ participantId: "a", start: 40, end: 60, kind: "busy" },
			{ participantId: "a", start: 90, end: 140, kind: "preferred" },
		]);
		expect(normalizeMarks(once)).toEqual(once);
	});

	it("drops empty intervals", () => {
		expect(
			normalizeMarks([
				{ participantId: "a", start: 50, end: 50, kind: "busy" },
			]),
		).toEqual([]);
	});
});
