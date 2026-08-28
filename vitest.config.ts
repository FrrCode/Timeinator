import { fileURLToPath, URL } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
	// Only the React transform. Deliberately not extending vite.config.ts: that
	// one loads Tailwind and the PWA plugin, which have nothing to do with these
	// tests and would generate a service worker on every run.
	plugins: [react()],
	resolve: {
		alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
	},
	test: {
		include: [
			"shared/**/*.test.ts",
			"server/**/*.test.ts",
			"src/**/*.test.ts",
			"src/**/*.test.tsx",
		],
		environment: "node",
	},
});
