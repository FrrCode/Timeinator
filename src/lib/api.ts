import type { Kind } from "../../shared/intervals.ts";

export type ApiParticipant = {
	id: string;
	name: string;
	timezone: string;
	/** Emoji, assigned at join and kept through renames. */
	avatar: string;
};

export type ApiMark = {
	participantId: string;
	start: number;
	end: number;
	kind: Kind;
};

export type PollSnapshot = {
	poll: { id: string; title: string; updatedAt: number };
	participants: ApiParticipant[];
	marks: ApiMark[];
};

/** Carries the status so callers can tell "no such poll" from "network down". */
export class ApiError extends Error {
	readonly status: number;

	constructor(status: number, message: string) {
		super(message);
		this.name = "ApiError";
		this.status = status;
	}
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
	const response = await fetch(`/api${path}`, init);
	const body = (await response.json().catch(() => ({}))) as {
		error?: unknown;
	};
	if (!response.ok) {
		throw new ApiError(
			response.status,
			typeof body.error === "string" ? body.error : "Something went wrong",
		);
	}
	return body as T;
}

function json(body: unknown, token?: string): RequestInit {
	return {
		headers: {
			"Content-Type": "application/json",
			...(token ? { "X-Participant": token } : {}),
		},
		body: JSON.stringify(body),
	};
}

export async function createPoll(title = "") {
	const body = await request<{ pollId: string }>("/polls", {
		method: "POST",
		...json({ title }),
	});
	return body.pollId;
}

export function fetchPoll(pollId: string) {
	return request<PollSnapshot>(`/polls/${pollId}`);
}

export async function fetchVersion(pollId: string) {
	const body = await request<{ updatedAt: number }>(`/polls/${pollId}/version`);
	return body.updatedAt;
}

export function joinPoll(
	pollId: string,
	name: string,
	timezone: string,
	avatar: string,
) {
	return request<{ participant: ApiParticipant; token: string }>(
		`/polls/${pollId}/participants`,
		{ method: "POST", ...json({ name, timezone, avatar }) },
	);
}

export async function updateParticipant(
	pollId: string,
	token: string,
	patch: { name?: string; timezone?: string },
) {
	const body = await request<{ participant: ApiParticipant }>(
		`/polls/${pollId}/participants/me`,
		{ method: "PATCH", ...json(patch, token) },
	);
	return body.participant;
}

export async function saveMarks(
	pollId: string,
	token: string,
	marks: ApiMark[],
) {
	// `participantId` is the server's to assign; sending it back would only
	// invite a client into deciding whose marks these are.
	const payload = marks.map(({ start, end, kind }) => ({ start, end, kind }));
	const body = await request<{ marks: ApiMark[] }>(`/polls/${pollId}/marks`, {
		method: "PUT",
		...json({ marks: payload }, token),
	});
	return body.marks;
}
