import { useCallback, useEffect, useRef, useState } from "react";
import { fetchPoll, fetchVersion, type PollSnapshot } from "./api.ts";

const POLL_INTERVAL_MS = 10_000;

/**
 * The poll snapshot, kept roughly fresh.
 *
 * Other people's changes arrive by re-fetching rather than over a socket: the
 * cheap `/version` endpoint is checked on a timer and the full snapshot is
 * pulled only when it moved. Nothing polls while the tab is hidden.
 */
export function usePoll(pollId: string) {
	const [snapshot, setSnapshot] = useState<PollSnapshot | null>(null);
	const [error, setError] = useState<Error | null>(null);
	const [loading, setLoading] = useState(true);
	// A ref, not state: the timer reads it without re-subscribing every tick.
	const versionRef = useRef(0);

	const refresh = useCallback(async () => {
		try {
			const next = await fetchPoll(pollId);
			versionRef.current = next.poll.updatedAt;
			setSnapshot(next);
			setError(null);
		} catch (caught) {
			setError(caught as Error);
		} finally {
			setLoading(false);
		}
	}, [pollId]);

	useEffect(() => {
		setLoading(true);
		void refresh();
	}, [refresh]);

	useEffect(() => {
		async function check() {
			if (document.visibilityState !== "visible") {
				return;
			}
			try {
				const updatedAt = await fetchVersion(pollId);
				if (updatedAt !== versionRef.current) {
					await refresh();
				}
			} catch {
				// A dropped poll is not worth surfacing; the next tick tries again.
			}
		}

		const timer = window.setInterval(check, POLL_INTERVAL_MS);
		window.addEventListener("focus", check);
		return () => {
			window.clearInterval(timer);
			window.removeEventListener("focus", check);
		};
	}, [pollId, refresh]);

	return { snapshot, error, loading, refresh, setSnapshot };
}
