import { useCallback, useState } from "react";

/**
 * Who this browser is, for one poll.
 *
 * There is no login: the server mints an opaque token on the first mark and
 * this keeps it. The key is scoped to the poll, so opening a second poll does
 * not silently inherit the first one's identity. Clearing site data or
 * switching browsers makes you a new participant, which is why the page offers
 * a visible way to start over rather than leaving it a mystery.
 */
type StoredParticipant = {
	token: string;
	participantId: string;
};

function storageKey(pollId: string) {
	return `timeinator.participant.${pollId}`;
}

function read(pollId: string): StoredParticipant | null {
	try {
		const raw = window.localStorage.getItem(storageKey(pollId));
		if (!raw) {
			return null;
		}
		const parsed = JSON.parse(raw) as Partial<StoredParticipant>;
		if (!parsed.token || !parsed.participantId) {
			return null;
		}
		return { token: parsed.token, participantId: parsed.participantId };
	} catch {
		// Private mode, a disabled store, or something else wrote this key.
		return null;
	}
}

export function useParticipant(pollId: string) {
	const [stored, setStored] = useState(() => read(pollId));

	const remember = useCallback(
		(next: StoredParticipant) => {
			try {
				window.localStorage.setItem(storageKey(pollId), JSON.stringify(next));
			} catch {
				// Not fatal: the session keeps working, it just won't survive a reload.
			}
			setStored(next);
		},
		[pollId],
	);

	const forget = useCallback(() => {
		try {
			window.localStorage.removeItem(storageKey(pollId));
		} catch {
			// Nothing to do — the state below is what the page actually reads.
		}
		setStored(null);
	}, [pollId]);

	return {
		token: stored?.token ?? null,
		participantId: stored?.participantId ?? null,
		remember,
		forget,
	};
}
