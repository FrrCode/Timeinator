import { beforeEach, describe, expect, it } from "vitest";
import { createApp } from "./app.ts";
import { openDatabase } from "./db.ts";

let app: ReturnType<typeof createApp>;

beforeEach(() => {
	app = createApp(openDatabase(":memory:"));
});

const MONDAY = Date.parse("2026-09-07T00:00:00Z") / 1000;
const HOUR = 3600;

async function readJson<T>(response: Response): Promise<T> {
	return (await response.json()) as T;
}

type ApiMark = {
	participantId: string;
	start: number;
	end: number;
	kind: string;
};

async function setUp() {
	const pollId = (
		await readJson<{ pollId: string }>(
			await app.request("/api/polls", { method: "POST" }),
		)
	).pollId;
	const joined = await readJson<{
		participant: { id: string };
		token: string;
	}>(
		await app.request(`/api/polls/${pollId}/participants`, {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ name: "Petr", timezone: "Europe/Berlin" }),
		}),
	);
	return { pollId, token: joined.token, me: joined.participant.id };
}

async function join(pollId: string, name: string) {
	return readJson<{ participant: { id: string }; token: string }>(
		await app.request(`/api/polls/${pollId}/participants`, {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ name, timezone: "Europe/Berlin" }),
		}),
	);
}

function put(pollId: string, token: string | null, marks: unknown) {
	return app.request(`/api/polls/${pollId}/marks`, {
		method: "PUT",
		headers: {
			"content-type": "application/json",
			...(token ? { "x-participant": token } : {}),
		},
		body: JSON.stringify({ marks }),
	});
}

async function snapshotMarks(pollId: string) {
	const snapshot = await readJson<{ marks: ApiMark[] }>(
		await app.request(`/api/polls/${pollId}`),
	);
	return snapshot.marks;
}

async function version(pollId: string) {
	return (
		await readJson<{ updatedAt: number }>(
			await app.request(`/api/polls/${pollId}/version`),
		)
	).updatedAt;
}

describe("PUT /api/polls/:id/marks", () => {
	it("stores and returns the caller's marks", async () => {
		const { pollId, token, me } = await setUp();
		const response = await put(pollId, token, [
			{ start: MONDAY + 9 * HOUR, end: MONDAY + 10 * HOUR, kind: "preferred" },
		]);
		expect(response.status).toBe(200);
		expect((await readJson<{ marks: ApiMark[] }>(response)).marks).toEqual([
			{
				participantId: me,
				start: MONDAY + 9 * HOUR,
				end: MONDAY + 10 * HOUR,
				kind: "preferred",
			},
		]);
	});

	it("normalizes before storing", async () => {
		const { pollId, token, me } = await setUp();
		const response = await put(pollId, token, [
			{ start: MONDAY, end: MONDAY + HOUR, kind: "preferred" },
			{ start: MONDAY + HOUR, end: MONDAY + 2 * HOUR, kind: "preferred" },
		]);
		expect((await readJson<{ marks: ApiMark[] }>(response)).marks).toEqual([
			{
				participantId: me,
				start: MONDAY,
				end: MONDAY + 2 * HOUR,
				kind: "preferred",
			},
		]);
	});

	it("replaces the previous set rather than adding to it", async () => {
		const { pollId, token } = await setUp();
		await put(pollId, token, [
			{ start: MONDAY, end: MONDAY + HOUR, kind: "preferred" },
		]);
		await put(pollId, token, [
			{ start: MONDAY + 5 * HOUR, end: MONDAY + 6 * HOUR, kind: "busy" },
		]);
		expect(await snapshotMarks(pollId)).toEqual([
			{
				participantId: expect.any(String),
				start: MONDAY + 5 * HOUR,
				end: MONDAY + 6 * HOUR,
				kind: "busy",
			},
		]);
	});

	it("accepts an empty set as a way to clear", async () => {
		const { pollId, token } = await setUp();
		await put(pollId, token, [
			{ start: MONDAY, end: MONDAY + HOUR, kind: "preferred" },
		]);
		expect((await put(pollId, token, [])).status).toBe(200);
		expect(await snapshotMarks(pollId)).toEqual([]);
	});

	it("leaves other participants' marks alone", async () => {
		const { pollId, token } = await setUp();
		const other = await join(pollId, "Anna");

		await put(pollId, token, [
			{ start: MONDAY, end: MONDAY + HOUR, kind: "preferred" },
		]);
		await put(pollId, other.token, [
			{ start: MONDAY, end: MONDAY + HOUR, kind: "busy" },
		]);

		expect(await snapshotMarks(pollId)).toHaveLength(2);
	});

	it("401s without a token", async () => {
		const { pollId } = await setUp();
		expect((await put(pollId, null, [])).status).toBe(401);
	});

	it("401s with another poll's token, touching nothing", async () => {
		const mine = await setUp();
		const theirs = await setUp();
		await put(theirs.pollId, theirs.token, [
			{ start: MONDAY, end: MONDAY + HOUR, kind: "preferred" },
		]);

		expect((await put(mine.pollId, theirs.token, [])).status).toBe(401);
		expect(await snapshotMarks(theirs.pollId)).toHaveLength(1);
	});

	it("rejects an inverted interval", async () => {
		const { pollId, token } = await setUp();
		const response = await put(pollId, token, [
			{ start: MONDAY + HOUR, end: MONDAY, kind: "preferred" },
		]);
		expect(response.status).toBe(400);
	});

	it("rejects a non-integer bound", async () => {
		const { pollId, token } = await setUp();
		expect(
			(
				await put(pollId, token, [
					{ start: MONDAY + 0.5, end: MONDAY + HOUR, kind: "busy" },
				])
			).status,
		).toBe(400);
	});

	it("rejects a time outside the supported range", async () => {
		const { pollId, token } = await setUp();
		expect(
			(await put(pollId, token, [{ start: 0, end: HOUR, kind: "busy" }]))
				.status,
		).toBe(400);
	});

	it("rejects an unknown kind", async () => {
		const { pollId, token } = await setUp();
		expect(
			(
				await put(pollId, token, [
					{ start: MONDAY, end: MONDAY + HOUR, kind: "maybe" },
				])
			).status,
		).toBe(400);
	});

	it("rejects an absurd number of raw marks", async () => {
		const { pollId, token } = await setUp();
		const many = Array.from({ length: 2001 }, (_, index) => ({
			start: MONDAY + index * 2 * HOUR,
			end: MONDAY + index * 2 * HOUR + HOUR,
			kind: "busy",
		}));
		expect((await put(pollId, token, many)).status).toBe(429);
	});

	it("leaves the previous set intact when the request is rejected", async () => {
		const { pollId, token } = await setUp();
		await put(pollId, token, [
			{ start: MONDAY, end: MONDAY + HOUR, kind: "preferred" },
		]);
		await put(pollId, token, [
			{ start: MONDAY + HOUR, end: MONDAY, kind: "preferred" },
		]);
		expect(await snapshotMarks(pollId)).toHaveLength(1);
	});

	it("bumps the poll's version", async () => {
		const { pollId, token } = await setUp();
		const before = await version(pollId);
		await put(pollId, token, [
			{ start: MONDAY, end: MONDAY + HOUR, kind: "preferred" },
		]);
		expect(await version(pollId)).toBeGreaterThanOrEqual(before);
	});
});
