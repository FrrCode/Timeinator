import { describe, expect, it } from "vitest";
import type { Mark } from "./intervals.ts";
import { applyPaint } from "./paint.ts";

const ME = "me";

function mark(start: number, end: number, kind: Mark["kind"]): Mark {
	return { participantId: ME, start, end, kind };
}

describe("applyPaint", () => {
	it("adds a preferred interval to an empty set", () => {
		expect(
			applyPaint({
				mine: [],
				participantId: ME,
				painted: [{ start: 0, end: 100 }],
				kind: "preferred",
				operation: "apply",
			}),
		).toEqual([mark(0, 100, "preferred")]);
	});

	it("merges a stroke that touches an existing interval of the same kind", () => {
		expect(
			applyPaint({
				mine: [mark(0, 100, "preferred")],
				participantId: ME,
				painted: [{ start: 100, end: 200 }],
				kind: "preferred",
				operation: "apply",
			}),
		).toEqual([mark(0, 200, "preferred")]);
	});

	it("subtracts from the other kind rather than layering on top", () => {
		expect(
			applyPaint({
				mine: [mark(0, 100, "preferred")],
				participantId: ME,
				painted: [{ start: 40, end: 60 }],
				kind: "busy",
				operation: "apply",
			}),
		).toEqual([
			mark(0, 40, "preferred"),
			mark(40, 60, "busy"),
			mark(60, 100, "preferred"),
		]);
	});

	it("clears both kinds under the stroke", () => {
		expect(
			applyPaint({
				mine: [mark(0, 50, "preferred"), mark(50, 100, "busy")],
				participantId: ME,
				painted: [{ start: 25, end: 75 }],
				kind: "preferred",
				operation: "clear",
			}),
		).toEqual([mark(0, 25, "preferred"), mark(75, 100, "busy")]);
	});

	it("clears everything when the stroke covers it all", () => {
		expect(
			applyPaint({
				mine: [mark(0, 100, "busy")],
				participantId: ME,
				painted: [{ start: 0, end: 100 }],
				kind: "busy",
				operation: "clear",
			}),
		).toEqual([]);
	});

	it("joins a stroke made of several adjacent cells", () => {
		expect(
			applyPaint({
				mine: [],
				participantId: ME,
				painted: [
					{ start: 0, end: 50 },
					{ start: 50, end: 100 },
				],
				kind: "busy",
				operation: "apply",
			}),
		).toEqual([mark(0, 100, "busy")]);
	});

	it("is a no-op for an empty stroke", () => {
		const mine = [mark(0, 100, "preferred")];
		expect(
			applyPaint({
				mine,
				participantId: ME,
				painted: [],
				kind: "busy",
				operation: "apply",
			}),
		).toEqual(mine);
	});
});
