import { DatabaseSync } from "node:sqlite";
import { beforeEach, describe, expect, it } from "vitest";
import { createApp } from "./app.ts";
import { applyMigrations, openDatabase } from "./db.ts";

let app: ReturnType<typeof createApp>;

beforeEach(() => {
	app = createApp(openDatabase(":memory:"));
});

async function readJson<T>(response: Response): Promise<T> {
	return (await response.json()) as T;
}

type Joined = {
	participant: {
		id: string;
		name: string;
		timezone: string;
		avatar: string;
	};
	token: string;
};

type Snapshot = {
	participants: { id: string; name: string; timezone: string }[];
};

async function newPoll() {
	const response = await app.request("/api/polls", { method: "POST" });
	return (await readJson<{ pollId: string }>(response)).pollId;
}

async function join(pollId: string, name: string, timezone = "Europe/Berlin") {
	const response = await app.request(`/api/polls/${pollId}/participants`, {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify({ name, timezone }),
	});
	return { response, body: await readJson<Joined>(response) };
}

async function version(pollId: string) {
	const response = await app.request(`/api/polls/${pollId}/version`);
	return (await readJson<{ updatedAt: number }>(response)).updatedAt;
}

describe("POST /api/polls/:id/participants", () => {
	it("mints a participant and a 32-character token", async () => {
		const pollId = await newPoll();
		const { response, body } = await join(pollId, "Petr");
		expect(response.status).toBe(201);
		expect(body.participant).toEqual({
			id: expect.any(String),
			name: "Petr",
			timezone: "Europe/Berlin",
			// No animal in "Petr", so it falls back rather than guessing.
			avatar: "🙂",
		});
		expect(body.token).toMatch(/^[0-9a-f]{32}$/);
	});

	it("keeps the token out of the poll snapshot", async () => {
		const pollId = await newPoll();
		const { body } = await join(pollId, "Petr");
		const snapshot = await readJson<Snapshot>(
			await app.request(`/api/polls/${pollId}`),
		);
		expect(JSON.stringify(snapshot)).not.toContain(body.token);
		expect(snapshot.participants).toEqual([body.participant]);
	});

	it("bumps the poll's version", async () => {
		const pollId = await newPoll();
		const before = await version(pollId);
		await join(pollId, "Petr");
		expect(await version(pollId)).toBeGreaterThanOrEqual(before);
	});

	it("trims the name and rejects an empty one", async () => {
		const pollId = await newPoll();
		expect((await join(pollId, "  Petr  ")).body.participant.name).toBe("Petr");
		expect((await join(pollId, "   ")).response.status).toBe(400);
	});

	it("rejects a name over 40 characters", async () => {
		const pollId = await newPoll();
		expect((await join(pollId, "x".repeat(41))).response.status).toBe(400);
	});

	it("rejects an unusable time zone", async () => {
		const pollId = await newPoll();
		const { response } = await join(pollId, "Petr", "Mars/Olympus_Mons");
		expect(response.status).toBe(400);
	});

	it("404s on an unknown poll", async () => {
		const { response } = await join("ZZZZZZZZZZZZ", "Petr");
		expect(response.status).toBe(404);
	});

	it("refuses the 51st participant", async () => {
		const pollId = await newPoll();
		for (let index = 0; index < 50; index += 1) {
			expect((await join(pollId, `P${index}`)).response.status).toBe(201);
		}
		expect((await join(pollId, "P50")).response.status).toBe(429);
	});
});

describe("PATCH /api/polls/:id/participants/me", () => {
	function patch(pollId: string, token: string | null, body: unknown) {
		return app.request(`/api/polls/${pollId}/participants/me`, {
			method: "PATCH",
			headers: {
				"content-type": "application/json",
				...(token ? { "x-participant": token } : {}),
			},
			body: JSON.stringify(body),
		});
	}

	it("renames the caller", async () => {
		const pollId = await newPoll();
		const { body } = await join(pollId, "Petr");
		const response = await patch(pollId, body.token, { name: "Pyotr" });
		expect(response.status).toBe(200);
		expect((await readJson<Joined>(response)).participant.name).toBe("Pyotr");
	});

	it("changes the caller's time zone", async () => {
		const pollId = await newPoll();
		const { body } = await join(pollId, "Petr");
		const response = await patch(pollId, body.token, {
			timezone: "America/New_York",
		});
		expect((await readJson<Joined>(response)).participant.timezone).toBe(
			"America/New_York",
		);
	});

	it("401s without a token", async () => {
		const pollId = await newPoll();
		await join(pollId, "Petr");
		expect((await patch(pollId, null, { name: "X" })).status).toBe(401);
	});

	it("401s on an unrecognised token", async () => {
		const pollId = await newPoll();
		await join(pollId, "Petr");
		expect((await patch(pollId, "f".repeat(32), { name: "X" })).status).toBe(
			401,
		);
	});

	it("401s on a token from a different poll, giving nothing away", async () => {
		const mine = await newPoll();
		const theirs = await newPoll();
		const { body } = await join(theirs, "Anna");
		const response = await patch(mine, body.token, { name: "Hijacked" });
		expect(response.status).toBe(401);

		// And Anna is untouched over in her own poll.
		const snapshot = await readJson<Snapshot>(
			await app.request(`/api/polls/${theirs}`),
		);
		expect(snapshot.participants[0]?.name).toBe("Anna");
	});
});

describe("avatars", () => {
	it("stores the avatar sent at join and returns it", async () => {
		const pollId = await newPoll();
		const response = await app.request(`/api/polls/${pollId}/participants`, {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({
				name: "Brave Otter",
				timezone: "Europe/Berlin",
				avatar: "🦦",
			}),
		});
		expect((await readJson<Joined>(response)).participant.avatar).toBe("🦦");

		const snapshot = await readJson<{
			participants: { avatar: string }[];
		}>(await app.request(`/api/polls/${pollId}`));
		expect(snapshot.participants[0]?.avatar).toBe("🦦");
	});

	it("derives one from the name when none is sent", async () => {
		const pollId = await newPoll();
		const { body } = await join(pollId, "Swift Fox");
		expect(body.participant.avatar).toBe("🦊");
	});

	it("keeps the avatar when the name changes", async () => {
		const pollId = await newPoll();
		const { body } = await join(pollId, "Brave Otter");
		const response = await app.request(`/api/polls/${pollId}/participants/me`, {
			method: "PATCH",
			headers: {
				"content-type": "application/json",
				"x-participant": body.token,
			},
			body: JSON.stringify({ name: "Petr" }),
		});
		const patched = await readJson<Joined>(response);
		expect(patched.participant.name).toBe("Petr");
		expect(patched.participant.avatar).toBe("🦦");
	});

	it("rejects an avatar that is not a short glyph", async () => {
		const pollId = await newPoll();
		const response = await app.request(`/api/polls/${pollId}/participants`, {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({
				name: "Petr",
				timezone: "Europe/Berlin",
				avatar: "<script>alert(1)</script>",
			}),
		});
		expect(response.status).toBe(400);
	});
});

describe("the avatar migration", () => {
	it("adds the column to a database created before it existed", () => {
		const legacy = new DatabaseSync(":memory:");
		legacy.exec(`
			CREATE TABLE polls (
				id TEXT PRIMARY KEY, title TEXT NOT NULL DEFAULT '',
				created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
			);
			CREATE TABLE participants (
				id TEXT PRIMARY KEY, token TEXT NOT NULL UNIQUE,
				poll_id TEXT NOT NULL REFERENCES polls(id) ON DELETE CASCADE,
				name TEXT NOT NULL, timezone TEXT NOT NULL,
				created_at INTEGER NOT NULL
			);
		`);
		// The poll has to exist: participants carry a foreign key to it.
		legacy
			.prepare(
				"INSERT INTO polls (id, created_at, updated_at) VALUES ('x',0,0)",
			)
			.run();
		legacy
			.prepare(
				"INSERT INTO participants (id, token, poll_id, name, timezone, created_at) VALUES ('p','t','x','Old Owl','UTC',0)",
			)
			.run();

		applyMigrations(legacy);

		const columns = legacy
			.prepare("PRAGMA table_info(participants)")
			.all() as unknown as { name: string }[];
		expect(columns.map((column) => column.name)).toContain("avatar");
		// The row that predates the column survives with a usable default.
		const row = legacy
			.prepare("SELECT avatar FROM participants WHERE id = 'p'")
			.get() as { avatar: string };
		expect(row.avatar).toBe("");
	});

	it("is safe to run twice", () => {
		const db = openDatabase(":memory:");
		expect(() => applyMigrations(db)).not.toThrow();
	});
});
