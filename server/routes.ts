import type { DatabaseSync } from "node:sqlite";
import { Hono } from "hono";
import { avatarFor } from "../shared/identity.ts";
import { type Mark, normalizeMarks } from "../shared/intervals.ts";
import { newId, newToken } from "./ids.ts";

const MAX_TITLE_LENGTH = 100;
const MAX_NAME_LENGTH = 40;
/** One or two glyphs. Long enough for an emoji with a modifier, short enough
 *  that nothing else fits. */
const MAX_AVATAR_LENGTH = 8;
const MAX_PARTICIPANTS = 50;
const MAX_RAW_MARKS = 2000;
const MAX_STORED_MARKS = 500;
/** 2000-01-01 and 2100-01-01: anything outside is a bug, not a booking. */
const EARLIEST_SECOND = 946_684_800;
const LATEST_SECOND = 4_102_444_800;
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 10;

type PollRow = {
	id: string;
	title: string;
	created_at: number;
	updated_at: number;
};

type ParticipantRow = {
	id: string;
	poll_id: string;
	name: string;
	timezone: string;
	avatar: string;
};

type MarkRow = {
	participant_id: string;
	start_s: number;
	end_s: number;
	kind: "busy" | "preferred";
};

/**
 * Poll creations per client address, so an open endpoint cannot be farmed.
 *
 * Owned by the app instance rather than the module: there is exactly one app in
 * production, and making it per-instance keeps a test's limiter from leaking
 * into the next test's.
 */
function createRateLimiter() {
	const recent = new Map<string, number[]>();

	return function rateLimited(key: string) {
		const now = Date.now();
		const fresh = (recent.get(key) ?? []).filter(
			(at) => now - at < RATE_LIMIT_WINDOW_MS,
		);
		recent.set(key, fresh);
		if (fresh.length >= RATE_LIMIT_MAX) {
			return true;
		}
		fresh.push(now);
		return false;
	};
}

export function nowSeconds() {
	return Math.floor(Date.now() / 1000);
}

export function findPoll(db: DatabaseSync, id: string) {
	return db.prepare("SELECT * FROM polls WHERE id = ?").get(id) as
		| PollRow
		| undefined;
}

/** Every write touches the poll, so the cheap `version` poll means something. */
export function touchPoll(db: DatabaseSync, pollId: string) {
	db.prepare("UPDATE polls SET updated_at = ? WHERE id = ?").run(
		nowSeconds(),
		pollId,
	);
}

/**
 * The caller's participant row, or null.
 *
 * The poll id is part of the lookup rather than checked afterwards, so a token
 * belonging to another poll is indistinguishable from one that does not exist.
 */
export function requireParticipant(
	db: DatabaseSync,
	pollId: string,
	token: string | undefined,
) {
	if (!token) {
		return null;
	}
	const row = db
		.prepare("SELECT * FROM participants WHERE token = ? AND poll_id = ?")
		.get(token, pollId) as (ParticipantRow & { token: string }) | undefined;
	return row ?? null;
}

/** A zone is usable if `Intl` will format with it. No allowlist to maintain. */
function isUsableTimezone(timezone: unknown): timezone is string {
	if (typeof timezone !== "string" || timezone.length === 0) {
		return false;
	}
	try {
		new Intl.DateTimeFormat("en-US", { timeZone: timezone });
		return true;
	} catch {
		return false;
	}
}

function publicParticipant(row: ParticipantRow) {
	return {
		id: row.id,
		name: row.name,
		timezone: row.timezone,
		avatar: row.avatar,
	};
}

export function createRoutes(db: DatabaseSync) {
	const routes = new Hono();
	const rateLimited = createRateLimiter();

	routes.post("/polls", async (context) => {
		const address =
			context.req.header("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
		if (rateLimited(address)) {
			return context.json({ error: "Too many polls created" }, 429);
		}

		// An empty body is normal: the intro page creates an untitled poll.
		const body = await context.req.json().catch(() => ({}));
		const title = typeof body.title === "string" ? body.title.trim() : "";
		if (title.length > MAX_TITLE_LENGTH) {
			return context.json({ error: "Title is too long" }, 400);
		}

		const id = newId();
		const at = nowSeconds();
		db.prepare(
			"INSERT INTO polls (id, title, created_at, updated_at) VALUES (?, ?, ?, ?)",
		).run(id, title, at, at);
		return context.json({ pollId: id }, 201);
	});

	// Pinged by the container healthcheck and by the deploy script, so it has to
	// fail when the process is up but useless — a bare `{ ok: true }` that never
	// touches SQLite would report healthy through a lost or unwritable volume.
	routes.get("/health", (context) => {
		try {
			const row = db.prepare("SELECT count(*) AS n FROM polls").get() as {
				n: number;
			};
			return context.json({ status: "ok", polls: row.n });
		} catch (error) {
			return context.json(
				{ status: "error", error: (error as Error).message },
				503,
			);
		}
	});

	routes.get("/polls/:id", (context) => {
		const poll = findPoll(db, context.req.param("id"));
		if (!poll) {
			return context.json({ error: "Poll not found" }, 404);
		}

		// Note the explicit column list: `token` must never leave the server.
		const participants = db
			.prepare(
				"SELECT id, poll_id, name, timezone, avatar FROM participants WHERE poll_id = ? ORDER BY created_at",
			)
			.all(poll.id) as unknown as ParticipantRow[];

		const marks = db
			.prepare(
				"SELECT participant_id, start_s, end_s, kind FROM marks WHERE poll_id = ? ORDER BY start_s",
			)
			.all(poll.id) as unknown as MarkRow[];

		return context.json({
			poll: { id: poll.id, title: poll.title, updatedAt: poll.updated_at },
			participants: participants.map(publicParticipant),
			marks: marks.map((row) => ({
				participantId: row.participant_id,
				start: row.start_s,
				end: row.end_s,
				kind: row.kind,
			})),
		});
	});

	routes.get("/polls/:id/version", (context) => {
		const poll = findPoll(db, context.req.param("id"));
		if (!poll) {
			return context.json({ error: "Poll not found" }, 404);
		}
		return context.json({ updatedAt: poll.updated_at });
	});

	routes.post("/polls/:id/participants", async (context) => {
		const poll = findPoll(db, context.req.param("id"));
		if (!poll) {
			return context.json({ error: "Poll not found" }, 404);
		}

		const body = await context.req.json().catch(() => ({}));
		const name = typeof body.name === "string" ? body.name.trim() : "";
		if (name.length === 0 || name.length > MAX_NAME_LENGTH) {
			return context.json({ error: "Give yourself a name" }, 400);
		}
		if (!isUsableTimezone(body.timezone)) {
			return context.json({ error: "Unknown time zone" }, 400);
		}
		// Derived here only at birth: from now on it is stored, so renaming
		// yourself to something with no animal in it keeps the avatar you had.
		const avatar =
			body.avatar === undefined ? avatarFor(name) : String(body.avatar);
		if (avatar.length === 0 || avatar.length > MAX_AVATAR_LENGTH) {
			return context.json({ error: "Unusable avatar" }, 400);
		}

		const count = db
			.prepare("SELECT count(*) AS n FROM participants WHERE poll_id = ?")
			.get(poll.id) as { n: number };
		if (count.n >= MAX_PARTICIPANTS) {
			return context.json({ error: "This poll is full" }, 429);
		}

		const id = newId();
		const token = newToken();
		db.prepare(
			"INSERT INTO participants (id, token, poll_id, name, timezone, avatar, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
		).run(id, token, poll.id, name, body.timezone, avatar, nowSeconds());
		touchPoll(db, poll.id);

		return context.json(
			{
				participant: { id, name, timezone: body.timezone, avatar },
				token,
			},
			201,
		);
	});

	routes.patch("/polls/:id/participants/me", async (context) => {
		const pollId = context.req.param("id");
		const me = requireParticipant(
			db,
			pollId,
			context.req.header("x-participant"),
		);
		if (!me) {
			return context.json({ error: "Not your poll" }, 401);
		}

		const body = await context.req.json().catch(() => ({}));
		let { name, timezone } = me;

		if (body.name !== undefined) {
			const trimmed = typeof body.name === "string" ? body.name.trim() : "";
			if (trimmed.length === 0 || trimmed.length > MAX_NAME_LENGTH) {
				return context.json({ error: "Give yourself a name" }, 400);
			}
			name = trimmed;
		}
		if (body.timezone !== undefined) {
			if (!isUsableTimezone(body.timezone)) {
				return context.json({ error: "Unknown time zone" }, 400);
			}
			timezone = body.timezone;
		}

		db.prepare(
			"UPDATE participants SET name = ?, timezone = ? WHERE id = ?",
		).run(name, timezone, me.id);
		touchPoll(db, pollId);

		return context.json({
			participant: publicParticipant({ ...me, name, timezone }),
		});
	});

	routes.put("/polls/:id/marks", async (context) => {
		const pollId = context.req.param("id");
		const me = requireParticipant(
			db,
			pollId,
			context.req.header("x-participant"),
		);
		if (!me) {
			return context.json({ error: "Not your poll" }, 401);
		}

		const body = await context.req.json().catch(() => ({}));
		const raw: unknown = body.marks;
		if (!Array.isArray(raw)) {
			return context.json({ error: "Expected a list of marks" }, 400);
		}
		if (raw.length > MAX_RAW_MARKS) {
			return context.json({ error: "Too many marks" }, 429);
		}

		const incoming: Mark[] = [];
		for (const entry of raw) {
			const { start, end, kind } = entry ?? {};
			const usable =
				Number.isSafeInteger(start) &&
				Number.isSafeInteger(end) &&
				end > start &&
				start >= EARLIEST_SECOND &&
				end <= LATEST_SECOND &&
				(kind === "busy" || kind === "preferred");
			if (!usable) {
				// Reject the whole paint rather than apply half of it.
				return context.json({ error: "Unusable mark" }, 400);
			}
			incoming.push({ participantId: me.id, start, end, kind });
		}

		const normalized = normalizeMarks(incoming);
		if (normalized.length > MAX_STORED_MARKS) {
			return context.json({ error: "Too many marks" }, 429);
		}

		db.exec("BEGIN");
		try {
			db.prepare("DELETE FROM marks WHERE participant_id = ?").run(me.id);
			const insert = db.prepare(
				"INSERT INTO marks (poll_id, participant_id, start_s, end_s, kind) VALUES (?, ?, ?, ?, ?)",
			);
			for (const mark of normalized) {
				insert.run(pollId, me.id, mark.start, mark.end, mark.kind);
			}
			db.prepare("UPDATE polls SET updated_at = ? WHERE id = ?").run(
				nowSeconds(),
				pollId,
			);
			db.exec("COMMIT");
		} catch (error) {
			db.exec("ROLLBACK");
			throw error;
		}

		return context.json({ marks: normalized });
	});

	return routes;
}
