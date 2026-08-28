import { beforeEach, describe, expect, it } from "vitest";
import { createApp } from "./app.ts";
import { openDatabase } from "./db.ts";

let app: ReturnType<typeof createApp>;

beforeEach(() => {
	app = createApp(openDatabase(":memory:"));
});

/** `Response.json()` is `unknown`; the tests know the shapes they asked for. */
async function readJson<T>(response: Response): Promise<T> {
	return (await response.json()) as T;
}

type Snapshot = {
	poll: { id: string; title: string; updatedAt: number };
	participants: { id: string; name: string; timezone: string }[];
	marks: { participantId: string; start: number; end: number; kind: string }[];
};

async function createPoll(title?: string) {
	const response = await app.request("/api/polls", {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify(title === undefined ? {} : { title }),
	});
	return { response, body: await readJson<{ pollId: string }>(response) };
}

describe("POST /api/polls", () => {
	it("mints a 12-character Crockford base32 id", async () => {
		const { response, body } = await createPoll("Q3 sync");
		expect(response.status).toBe(201);
		expect(body.pollId).toMatch(/^[0-9A-HJKMNP-TV-Z]{12}$/);
	});

	it("gives two polls different ids", async () => {
		const first = await createPoll();
		const second = await createPoll();
		expect(first.body.pollId).not.toBe(second.body.pollId);
	});

	it("accepts an empty body and defaults the title", async () => {
		const { body } = await createPoll();
		const read = await app.request(`/api/polls/${body.pollId}`);
		expect((await readJson<Snapshot>(read)).poll.title).toBe("");
	});

	it("rejects a title over 100 characters", async () => {
		const { response } = await createPoll("x".repeat(101));
		expect(response.status).toBe(400);
	});
});

describe("GET /api/polls/:id", () => {
	it("returns an empty poll", async () => {
		const { body } = await createPoll("Q3 sync");
		const response = await app.request(`/api/polls/${body.pollId}`);
		expect(response.status).toBe(200);
		expect(await readJson<Snapshot>(response)).toEqual({
			poll: {
				id: body.pollId,
				title: "Q3 sync",
				updatedAt: expect.any(Number),
			},
			participants: [],
			marks: [],
		});
	});

	it("404s on an unknown id", async () => {
		const response = await app.request("/api/polls/ZZZZZZZZZZZZ");
		expect(response.status).toBe(404);
	});
});

describe("GET /api/polls/:id/version", () => {
	it("returns the poll's updatedAt", async () => {
		const { body } = await createPoll();
		const response = await app.request(`/api/polls/${body.pollId}/version`);
		expect(response.status).toBe(200);
		expect((await readJson<{ updatedAt: number }>(response)).updatedAt).toEqual(
			expect.any(Number),
		);
	});

	it("404s on an unknown id", async () => {
		const response = await app.request("/api/polls/ZZZZZZZZZZZZ/version");
		expect(response.status).toBe(404);
	});
});
