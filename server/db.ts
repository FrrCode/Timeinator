import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";

/**
 * All times are UTC epoch seconds. `participants.id` is public and appears in
 * every response so the grid can label marks by name; `participants.token` is
 * the secret held by one browser and is never returned by a read endpoint.
 * Collapsing the two would let anyone who opened the poll edit anyone's marks.
 */
const SCHEMA = `
CREATE TABLE IF NOT EXISTS polls (
	id         TEXT PRIMARY KEY,
	title      TEXT NOT NULL DEFAULT '',
	created_at INTEGER NOT NULL,
	updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS participants (
	id         TEXT PRIMARY KEY,
	token      TEXT NOT NULL UNIQUE,
	poll_id    TEXT NOT NULL REFERENCES polls(id) ON DELETE CASCADE,
	name       TEXT NOT NULL,
	timezone   TEXT NOT NULL,
	avatar     TEXT NOT NULL DEFAULT '',
	created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS marks (
	id             INTEGER PRIMARY KEY,
	poll_id        TEXT NOT NULL REFERENCES polls(id) ON DELETE CASCADE,
	participant_id TEXT NOT NULL REFERENCES participants(id) ON DELETE CASCADE,
	start_s        INTEGER NOT NULL,
	end_s          INTEGER NOT NULL,
	kind           TEXT NOT NULL CHECK (kind IN ('busy', 'preferred'))
);

CREATE INDEX IF NOT EXISTS marks_poll ON marks (poll_id, start_s);
CREATE INDEX IF NOT EXISTS marks_participant ON marks (participant_id);
CREATE INDEX IF NOT EXISTS participants_poll ON participants (poll_id);
`;

/**
 * Schema changes that `CREATE TABLE IF NOT EXISTS` cannot make.
 *
 * That statement is a no-op against a database whose tables already exist, so
 * a column added after the first deployment has to be applied here or it only
 * ever appears on a fresh file. Each step checks before it acts, so running
 * this on every boot is free and running it twice is harmless.
 */
export function applyMigrations(db: DatabaseSync) {
	const columns = db
		.prepare("PRAGMA table_info(participants)")
		.all() as unknown as { name: string }[];

	if (!columns.some((column) => column.name === "avatar")) {
		// Existing rows get '', which the client reads as "no avatar chosen" and
		// falls back on. Backfilling from the name would guess at people who may
		// have renamed themselves already.
		db.exec(
			"ALTER TABLE participants ADD COLUMN avatar TEXT NOT NULL DEFAULT ''",
		);
	}
}

export function openDatabase(location: string) {
	if (location !== ":memory:") {
		mkdirSync(dirname(location), { recursive: true });
	}
	const db = new DatabaseSync(location);
	// WAL keeps a reader from blocking the writer; a memory database ignores it.
	db.exec("PRAGMA journal_mode = WAL");
	// Off by default in SQLite, and the ON DELETE CASCADEs depend on it.
	db.exec("PRAGMA foreign_keys = ON");
	db.exec(SCHEMA);
	applyMigrations(db);
	return db;
}

export function databasePath() {
	return resolve(process.env.DATA_DIR ?? "data", "timeinator.db");
}
