import type { DatabaseSync } from "node:sqlite";
import { Hono } from "hono";
import { createRoutes } from "./routes.ts";

export function createApp(db: DatabaseSync) {
	const app = new Hono();
	app.route("/api", createRoutes(db));
	// Terminates the namespace: without this, an unmatched /api path would fall
	// through to the SPA catch-all in server/index.ts and answer a fetch() with
	// an HTML page and a 200.
	app.all("/api/*", (context) => context.json({ error: "Not found" }, 404));
	return app;
}
