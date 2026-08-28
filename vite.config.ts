import { fileURLToPath, URL } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv, type Plugin } from "vite";
import { VitePWA } from "vite-plugin-pwa";
import { resolveSite, type SiteConfig } from "./src/lib/consts";

/** Values land inside double-quoted HTML attributes. */
function escapeAttribute(value: string) {
	return value
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;");
}

/** Fills the `%SITE_*%` placeholders in index.html from `src/lib/consts.ts`. */
function siteMeta(site: SiteConfig): Plugin {
	const values: Record<string, string> = {
		"%SITE_NAME%": site.name,
		"%SITE_URL%": site.url,
		"%SITE_TITLE%": site.title,
		"%SITE_OG_TITLE%": site.ogTitle,
		"%SITE_DESCRIPTION%": site.description,
		"%SITE_OG_IMAGE%": site.ogImage,
		"%SITE_THEME_COLOR%": site.themeColor,
	};

	return {
		name: "timeinator:site-meta",
		transformIndexHtml(html) {
			return html.replace(/%SITE_[A-Z_]+%/g, (token) => {
				const value = values[token];
				if (value === undefined) {
					throw new Error(`Unknown site placeholder ${token} in index.html`);
				}
				return escapeAttribute(value);
			});
		},
	};
}

/** Installable-app metadata, from the same site config as the meta tags. */
function pwa(site: SiteConfig) {
	return VitePWA({
		registerType: "autoUpdate",
		includeAssets: ["favicon.ico", "favicon.svg", "apple-touch-icon.png"],
		manifest: {
			name: site.name,
			short_name: site.shortName,
			description: site.description,
			theme_color: site.themeColor,
			background_color: site.backgroundColor,
			display: "standalone",
			start_url: "/",
			scope: "/",
			icons: [
				{ src: "/icon-192.png", sizes: "192x192", type: "image/png" },
				{ src: "/icon-512.png", sizes: "512x512", type: "image/png" },
				{
					src: "/icon-maskable-512.png",
					sizes: "512x512",
					type: "image/png",
					purpose: "maskable",
				},
			],
		},
		workbox: {
			// The social card is never needed offline, and it dwarfs everything else.
			globPatterns: ["**/*.{js,css,html,ico,svg}", "icon-*.png"],
			// Without this the SPA fallback answers API calls from the cache.
			navigateFallbackDenylist: [/^\/api\//],
		},
	});
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
	const site = resolveSite(loadEnv(mode, process.cwd(), "VITE_"));
	return {
		plugins: [react(), tailwindcss(), siteMeta(site), pwa(site)],
		resolve: {
			// `@/…` is what the shadcn registry emits; it has to resolve the same
			// way here as it does in tsconfig.json or the build and the editor
			// disagree about the same import.
			alias: {
				"@": fileURLToPath(new URL("./src", import.meta.url)),
			},
		},
		server: {
			// `pnpm dev` runs the API on 4002; the browser only ever sees 4001.
			proxy: { "/api": "http://localhost:4002" },
		},
	};
});
