import { beforeEach, describe, expect, it } from "vitest";
import { createApp } from "./app.ts";
import { openDatabase } from "./db.ts";

let app: ReturnType<typeof createApp>;

beforeEach(() => {
	app = createApp(openDatabase(":memory:"));
});

describe("the API namespace", () => {
	it("404s an unknown /api path as JSON, never as the SPA shell", async () => {
		const response = await app.request("/api/nonsense");
		expect(response.status).toBe(404);
		expect(response.headers.get("content-type")).toContain("application/json");
	});

	it("404s an unknown method on a known path", async () => {
		const response = await app.request("/api/polls", { method: "DELETE" });
		expect(response.status).toBe(404);
		expect(response.headers.get("content-type")).toContain("application/json");
	});
});

describe("GET /api/health", () => {
	it("reports ok and touches the database", async () => {
		const response = await app.request("/api/health");
		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({ status: "ok", polls: 0 });
	});

	it("counts the polls it can see", async () => {
		await app.request("/api/polls", { method: "POST" });
		const body = (await (await app.request("/api/health")).json()) as {
			polls: number;
		};
		expect(body.polls).toBe(1);
	});

	it("reports unhealthy when the database is gone", async () => {
		const db = openDatabase(":memory:");
		const isolated = createApp(db);
		// A closed handle is the shape of the failure that matters: the process is
		// up and answering, but it cannot reach its own storage.
		db.close();
		const response = await isolated.request("/api/health");
		expect(response.status).toBe(503);
		expect(await response.json()).toMatchObject({ status: "error" });
	});
});
