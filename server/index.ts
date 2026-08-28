import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { createApp } from "./app.ts";
import { databasePath, openDatabase } from "./db.ts";

const app = createApp(openDatabase(databasePath()));

// In development Vite serves the client and proxies /api here, so `dist/` does
// not exist and neither handler ever matches. In production they serve the
// built app, with the catch-all making a hard refresh of /pick/<id> work.
app.use("/*", serveStatic({ root: "./dist" }));
app.get("*", serveStatic({ path: "./dist/index.html" }));

const port = Number(process.env.PORT ?? 4002);
serve({ fetch: app.fetch, port }, (info) => {
	console.log(`Timeinator server listening on http://localhost:${info.port}`);
});
