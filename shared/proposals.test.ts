import { describe, expect, it } from "vitest";
import type { Mark } from "./intervals.ts";
import { findBlockers, findProposals } from "./proposals.ts";

function s(iso: string) {
	return Date.parse(iso) / 1000;
}

const HOUR = 3600;

function preferred(participantId: string, from: string, to: string): Mark {
	return { participantId, start: s(from), end: s(to), kind: "preferred" };
}

function busy(participantId: string, from: string, to: string): Mark {
	return { participantId, start: s(from), end: s(to), kind: "busy" };
}

describe("findProposals", () => {
	it("returns nothing when nobody marked a preference", () => {
		expect(
			findProposals({
				marks: [busy("a", "2026-09-02T09:00:00Z", "2026-09-02T17:00:00Z")],
				participantIds: ["a"],
				lengthSeconds: HOUR,
			}),
		).toEqual([]);
	});

	it("finds a window inside a single preferred interval", () => {
		const found = findProposals({
			marks: [preferred("a", "2026-09-02T10:00:00Z", "2026-09-02T11:00:00Z")],
			participantIds: ["a"],
			lengthSeconds: HOUR,
		});
		expect(found).toEqual([
			{
				start: s("2026-09-02T10:00:00Z"),
				end: s("2026-09-02T11:00:00Z"),
				preferredBy: ["a"],
				silent: [],
			},
		]);
	});

	it("does not propose a window longer than the preferred interval", () => {
		expect(
			findProposals({
				marks: [preferred("a", "2026-09-02T10:00:00Z", "2026-09-02T11:00:00Z")],
				participantIds: ["a"],
				lengthSeconds: 2 * HOUR,
			}),
		).toEqual([]);
	});

	it("ranks a window both people prefer above one only a prefers", () => {
		const found = findProposals({
			marks: [
				preferred("a", "2026-09-02T10:00:00Z", "2026-09-02T11:00:00Z"),
				preferred("a", "2026-09-03T10:00:00Z", "2026-09-03T11:00:00Z"),
				preferred("b", "2026-09-03T10:00:00Z", "2026-09-03T11:00:00Z"),
			],
			participantIds: ["a", "b"],
			lengthSeconds: HOUR,
		});
		expect(found[0]?.start).toBe(s("2026-09-03T10:00:00Z"));
		expect(found[0]?.preferredBy).toEqual(["a", "b"]);
		expect(found[1]?.start).toBe(s("2026-09-02T10:00:00Z"));
		expect(found[1]?.preferredBy).toEqual(["a"]);
		expect(found[1]?.silent).toEqual(["b"]);
	});

	it("lets any busy overlap disqualify a window", () => {
		expect(
			findProposals({
				marks: [
					preferred("a", "2026-09-02T10:00:00Z", "2026-09-02T11:00:00Z"),
					// Fifteen minutes of collision is enough.
					busy("b", "2026-09-02T10:45:00Z", "2026-09-02T11:30:00Z"),
				],
				participantIds: ["a", "b"],
				lengthSeconds: HOUR,
			}),
		).toEqual([]);
	});

	it("allows a busy interval that merely touches the window", () => {
		const found = findProposals({
			marks: [
				preferred("a", "2026-09-02T10:00:00Z", "2026-09-02T11:00:00Z"),
				busy("b", "2026-09-02T11:00:00Z", "2026-09-02T12:00:00Z"),
			],
			participantIds: ["a", "b"],
			lengthSeconds: HOUR,
		});
		expect(found).toHaveLength(1);
		expect(found[0]?.silent).toEqual(["b"]);
	});

	it("suppresses a lower-scoring window that overlaps a chosen one", () => {
		const found = findProposals({
			marks: [
				preferred("a", "2026-09-02T10:00:00Z", "2026-09-02T12:00:00Z"),
				preferred("b", "2026-09-02T10:00:00Z", "2026-09-02T11:00:00Z"),
			],
			participantIds: ["a", "b"],
			lengthSeconds: HOUR,
		});
		// 10:00-11:00 scores 2 and is chosen; 10:15, 10:30, 10:45 overlap it.
		expect(found[0]).toEqual({
			start: s("2026-09-02T10:00:00Z"),
			end: s("2026-09-02T11:00:00Z"),
			preferredBy: ["a", "b"],
			silent: [],
		});
		// b's preferred only *touches* 11:00, so b has said nothing about the
		// second window — silent, not objecting.
		expect(found[1]).toEqual({
			start: s("2026-09-02T11:00:00Z"),
			end: s("2026-09-02T12:00:00Z"),
			preferredBy: ["a"],
			silent: ["b"],
		});
		expect(found).toHaveLength(2);
	});

	it("steps candidates on 15-minute boundaries", () => {
		const found = findProposals({
			marks: [preferred("a", "2026-09-02T10:00:00Z", "2026-09-02T12:00:00Z")],
			participantIds: ["a"],
			lengthSeconds: 30 * 60,
			limit: 10,
		});
		// Non-overlapping suppression leaves 10:00, 10:30, 11:00, 11:30.
		expect(found.map((proposal) => proposal.start)).toEqual([
			s("2026-09-02T10:00:00Z"),
			s("2026-09-02T10:30:00Z"),
			s("2026-09-02T11:00:00Z"),
			s("2026-09-02T11:30:00Z"),
		]);
	});

	it("aligns candidates to the quarter hour even from a ragged start", () => {
		const found = findProposals({
			marks: [preferred("a", "2026-09-02T10:07:00Z", "2026-09-02T11:30:00Z")],
			participantIds: ["a"],
			lengthSeconds: HOUR,
		});
		expect(found[0]?.start).toBe(s("2026-09-02T10:15:00Z"));
	});

	it("honours the limit", () => {
		const found = findProposals({
			marks: [preferred("a", "2026-09-02T00:00:00Z", "2026-09-03T00:00:00Z")],
			participantIds: ["a"],
			lengthSeconds: HOUR,
			limit: 3,
		});
		expect(found).toHaveLength(3);
	});

	it("ignores marks from participants not in the list", () => {
		const found = findProposals({
			marks: [
				preferred("a", "2026-09-02T10:00:00Z", "2026-09-02T11:00:00Z"),
				preferred("ghost", "2026-09-02T10:00:00Z", "2026-09-02T11:00:00Z"),
			],
			participantIds: ["a"],
			lengthSeconds: HOUR,
		});
		expect(found[0]?.preferredBy).toEqual(["a"]);
	});

	it("still lets a removed participant's busy mark disqualify nothing", () => {
		const found = findProposals({
			marks: [
				preferred("a", "2026-09-02T10:00:00Z", "2026-09-02T11:00:00Z"),
				busy("ghost", "2026-09-02T10:00:00Z", "2026-09-02T11:00:00Z"),
			],
			participantIds: ["a"],
			lengthSeconds: HOUR,
		});
		expect(found).toHaveLength(1);
	});
});

describe("findBlockers", () => {
	it("is empty when nobody wanted anything", () => {
		expect(
			findBlockers({
				marks: [busy("a", "2026-09-02T09:00:00Z", "2026-09-02T17:00:00Z")],
				participantIds: ["a"],
				lengthSeconds: HOUR,
			}),
		).toEqual([]);
	});

	it("is empty when nothing is blocked", () => {
		expect(
			findBlockers({
				marks: [preferred("a", "2026-09-02T10:00:00Z", "2026-09-02T11:00:00Z")],
				participantIds: ["a"],
				lengthSeconds: HOUR,
			}),
		).toEqual([]);
	});

	it("names the participant whose busy time kills a wanted window", () => {
		expect(
			findBlockers({
				marks: [
					preferred("a", "2026-09-02T10:00:00Z", "2026-09-02T11:00:00Z"),
					busy("b", "2026-09-02T10:30:00Z", "2026-09-02T11:00:00Z"),
				],
				participantIds: ["a", "b"],
				lengthSeconds: HOUR,
			}),
		).toEqual([{ participantId: "b", blocked: 1 }]);
	});

	it("ranks the worse blocker first", () => {
		const blockers = findBlockers({
			marks: [
				preferred("a", "2026-09-02T10:00:00Z", "2026-09-02T14:00:00Z"),
				// b is out all afternoon; c only clips the first window.
				busy("b", "2026-09-02T10:00:00Z", "2026-09-02T14:00:00Z"),
				busy("c", "2026-09-02T10:00:00Z", "2026-09-02T10:15:00Z"),
			],
			participantIds: ["a", "b", "c"],
			lengthSeconds: HOUR,
		});
		expect(blockers[0]?.participantId).toBe("b");
		expect(blockers[1]?.participantId).toBe("c");
		expect(blockers[0]?.blocked).toBeGreaterThan(blockers[1]?.blocked ?? 0);
	});
});
