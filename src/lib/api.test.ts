import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError, createPoll, fetchPoll, saveMarks } from "./api.ts";

afterEach(() => {
	vi.unstubAllGlobals();
});

function stubFetch(status: number, body: unknown) {
	// The parameters are declared so `mock.calls` is a two-element tuple rather
	// than an empty one; the assertions below read the init argument.
	const fetchMock = vi.fn(
		async (_input: RequestInfo | URL, _init?: RequestInit) =>
			new Response(JSON.stringify(body), {
				status,
				headers: { "content-type": "application/json" },
			}),
	);
	vi.stubGlobal("fetch", fetchMock);
	return fetchMock;
}

function lastInit(fetchMock: ReturnType<typeof stubFetch>) {
	const init = fetchMock.mock.calls[0]?.[1];
	if (!init) {
		throw new Error("fetch was called without a request init");
	}
	return init;
}

describe("createPoll", () => {
	it("returns the new poll id", async () => {
		stubFetch(201, { pollId: "ABCDEFGHJKMN" });
		await expect(createPoll("Q3 sync")).resolves.toBe("ABCDEFGHJKMN");
	});

	it("posts the title", async () => {
		const fetchMock = stubFetch(201, { pollId: "ABCDEFGHJKMN" });
		await createPoll("Q3 sync");
		expect(JSON.parse(lastInit(fetchMock).body as string)).toEqual({
			title: "Q3 sync",
		});
	});
});

describe("fetchPoll", () => {
	it("throws an ApiError carrying the status", async () => {
		stubFetch(404, { error: "Poll not found" });
		await expect(fetchPoll("ZZZZZZZZZZZZ")).rejects.toMatchObject({
			status: 404,
			message: "Poll not found",
		});
		await expect(fetchPoll("ZZZZZZZZZZZZ")).rejects.toBeInstanceOf(ApiError);
	});
});

describe("saveMarks", () => {
	it("sends the token in the X-Participant header", async () => {
		const fetchMock = stubFetch(200, { marks: [] });
		await saveMarks("ABCDEFGHJKMN", "deadbeef", []);
		const headers = lastInit(fetchMock).headers as Record<string, string>;
		expect(headers["X-Participant"]).toBe("deadbeef");
	});

	it("strips participantId from the payload it sends", async () => {
		const fetchMock = stubFetch(200, { marks: [] });
		await saveMarks("ABCDEFGHJKMN", "deadbeef", [
			{
				participantId: "me",
				start: 1_000_000_000,
				end: 1_000_003_600,
				kind: "busy",
			},
		]);
		expect(JSON.parse(lastInit(fetchMock).body as string)).toEqual({
			marks: [{ start: 1_000_000_000, end: 1_000_003_600, kind: "busy" }],
		});
	});
});
