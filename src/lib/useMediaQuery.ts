import { useEffect, useState } from "react";

/** Tracks a CSS media query, so layout can branch in JS as well as in classes. */
export function useMediaQuery(query: string) {
	const [matches, setMatches] = useState(
		() => window.matchMedia(query).matches,
	);

	useEffect(() => {
		const list = window.matchMedia(query);
		const onChange = () => setMatches(list.matches);
		// The query may have changed between render and effect.
		onChange();
		list.addEventListener("change", onChange);
		return () => list.removeEventListener("change", onChange);
	}, [query]);

	return matches;
}

/** Matches Tailwind's `md` breakpoint, where the desktop grid takes over. */
export const DESKTOP_QUERY = "(min-width: 768px)";
