import { beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../server/app.ts";
import { openDatabase } from "../server/db.ts";
import { findProposals } from "../shared/proposals.ts";
import { dayjs } from "./lib/dayjs.ts";

/**
 * The whole path, once: two people paint the same week from different zones
 * through the real API, and the proposal list is computed from what came back.
 *
 * Everything below it is unit-tested in isolation; this exists to catch the
 * seams — that a cell painted at a Berlin wall clock is stored as the instant a
 * New York viewer sees at their own wall clock, and that the pieces still agree
 * once the data has been through SQLite.
 */
let app: ReturnType<typeof createApp>;

beforeEach(() => {
	app = createApp(openDatabase(":memory:"));
});

const WEDNESDAY = "2026-09-02T12:00:00Z";

async function readJson<T>(response: Response): Promise<T> {
	return (await response.json()) as T;
}

/**
 * The 24 hour-long slots of that Wednesday, as the given zone sees them.
 *
 * Computed here from dayjs rather than borrowed from application code: the
 * point of the assertions below is that two zones agree on an instant, and a
 * test that derived both sides from the same helper could not tell.
 */
function hourCellsOnWednesday(timezone: string) {
	const dayStart = dayjs.tz(
		dayjs.utc(WEDNESDAY).tz(timezone).format("YYYY-MM-DD"),
		timezone,
	);
	return Array.from({ length: 24 }, (_, hour) => {
		const start = dayStart.add(hour, "hour");
		return {
			start: start.unix(),
			end: start.add(1, "hour").unix(),
		};
	});
}

async function join(pollId: string, name: string, timezone: string) {
	return readJson<{ participant: { id: string }; token: string }>(
		await app.request(`/api/polls/${pollId}/participants`, {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ name, timezone }),
		}),
	);
}

function paint(
	pollId: string,
	token: string,
	marks: { start: number; end: number; kind: string }[],
) {
	return app.request(`/api/polls/${pollId}/marks`, {
		method: "PUT",
		headers: { "content-type": "application/json", "x-participant": token },
		body: JSON.stringify({ marks }),
	});
}

describe("the Pick Time flow", () => {
	it("lines two zones up on one instant and ranks the survivor", async () => {
		const { pollId } = await readJson<{ pollId: string }>(
			await app.request("/api/polls", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ title: "Q3 sync" }),
			}),
		);

		const petr = await join(pollId, "Petr", "Europe/Berlin");
		const anna = await join(pollId, "Anna", "America/New_York");

		// Petr prefers 14:00 and 15:00 on the Berlin grid.
		const berlin = hourCellsOnWednesday("Europe/Berlin");
		await paint(
			pollId,
			petr.token,
			berlin.slice(14, 16).map((cell) => ({
				start: cell.start,
				end: cell.end,
				kind: "preferred",
			})),
		);

		// Anna prefers 08:00 and 09:00 on the New York grid — the same two hours —
		// then marks 09:00 busy, which should win over her own preference.
		const newYork = hourCellsOnWednesday("America/New_York");
		await paint(pollId, anna.token, [
			...newYork.slice(8, 10).map((cell) => ({
				start: cell.start,
				end: cell.end,
				kind: "preferred",
			})),
			...newYork.slice(9, 10).map((cell) => ({
				start: cell.start,
				end: cell.end,
				kind: "busy",
			})),
		]);

		const snapshot = await readJson<{
			participants: { id: string; name: string }[];
			marks: {
				participantId: string;
				start: number;
				end: number;
				kind: "busy" | "preferred";
			}[];
		}>(await app.request(`/api/polls/${pollId}`));

		// Petr's two adjacent hours merged into one row on the way in.
		const petrMarks = snapshot.marks.filter(
			(mark) => mark.participantId === petr.participant.id,
		);
		expect(petrMarks).toHaveLength(1);
		expect(petrMarks[0]?.end).toBe((petrMarks[0]?.start ?? 0) + 2 * 3600);

		// Anna's busy hour was subtracted from her own preferred block.
		const annaMarks = snapshot.marks.filter(
			(mark) => mark.participantId === anna.participant.id,
		);
		expect(annaMarks.map((mark) => mark.kind).sort()).toEqual([
			"busy",
			"preferred",
		]);

		// The zones agree on the instant: Anna's 08:00 New York is Petr's 14:00.
		expect(newYork[8]?.start).toBe(berlin[14]?.start);

		const found = findProposals({
			marks: snapshot.marks,
			participantIds: snapshot.participants.map((person) => person.id),
			lengthSeconds: 3600,
		});

		// 15:00 Berlin dies on Anna's busy hour; 14:00 survives, wanted by both.
		expect(found).toHaveLength(1);
		expect(found[0]?.start).toBe(berlin[14]?.start);
		expect(found[0]?.preferredBy).toHaveLength(2);
		expect(
			dayjs
				.unix(found[0]?.start ?? 0)
				.tz("Europe/Berlin")
				.format("HH:mm"),
		).toBe("14:00");
		expect(
			dayjs
				.unix(found[0]?.start ?? 0)
				.tz("America/New_York")
				.format("HH:mm"),
		).toBe("08:00");
	});
});
