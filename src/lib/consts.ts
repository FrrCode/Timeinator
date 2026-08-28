/**
 * Site-level constants — the canonical URL, the document title, and the social
 * card copy. These feed both the React app and the `%SITE_*%` placeholders in
 * `index.html`, so the deployment's identity is stated in exactly one place.
 *
 * Self-hosting? Don't edit this file: override any of it at build time with the
 * matching `VITE_SITE_*` environment variable (see `.env.example`).
 */

export const SITE_DEFAULTS = {
	name: "Timeinator",
	/** Under a home-screen icon, where there is room for ~12 characters. */
	shortName: "Timeinator",
	/** Browser chrome and the installed app's splash screen. */
	themeColor: "#2196f3",
	backgroundColor: "#ffffff",
	/** Origin the build is published under. No trailing slash. */
	url: "https://timeinator.frrcode.com",
	title:
		"Timeinator - Time Converter and World Clock. Pick best time. Compare timezones.",
	/** Shorter headline for link previews, where the full title gets clipped. */
	ogTitle: "Timeinator - Convert Time",
	description: "Easy time convertion. Compare time across timezones.",
	/** Absolute URL, or a path resolved against `url`. */
	ogImage: "/og-image.jpeg",
} as const;

export type SiteConfig = {
	name: string;
	shortName: string;
	themeColor: string;
	backgroundColor: string;
	url: string;
	title: string;
	ogTitle: string;
	description: string;
	/** Always absolute: scrapers reject relative image URLs. */
	ogImage: string;
};

/**
 * Overlay `VITE_SITE_*` overrides onto the defaults.
 *
 * Takes the environment as an argument rather than reading it directly, because
 * `vite.config.ts` resolves this in Node from `loadEnv()` while the browser
 * bundle resolves it from `import.meta.env`.
 */
export function resolveSite(
	env: Record<string, string | undefined> | undefined,
): SiteConfig {
	const url = (env?.VITE_SITE_URL || SITE_DEFAULTS.url).replace(/\/+$/, "");
	const ogImage = env?.VITE_SITE_OG_IMAGE || SITE_DEFAULTS.ogImage;

	return {
		name: env?.VITE_SITE_NAME || SITE_DEFAULTS.name,
		shortName: env?.VITE_SITE_SHORT_NAME || SITE_DEFAULTS.shortName,
		themeColor: env?.VITE_SITE_THEME_COLOR || SITE_DEFAULTS.themeColor,
		backgroundColor:
			env?.VITE_SITE_BACKGROUND_COLOR || SITE_DEFAULTS.backgroundColor,
		url,
		title: env?.VITE_SITE_TITLE || SITE_DEFAULTS.title,
		ogTitle: env?.VITE_SITE_OG_TITLE || SITE_DEFAULTS.ogTitle,
		description: env?.VITE_SITE_DESCRIPTION || SITE_DEFAULTS.description,
		ogImage: /^https?:\/\//.test(ogImage) ? ogImage : `${url}${ogImage}`,
	};
}

export const SITE = resolveSite(import.meta.env);
