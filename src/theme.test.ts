import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * Guards a collision that is silent and easy to reintroduce.
 *
 * `shadcn init` appends a `@theme inline` block that maps `--color-primary` to
 * `--primary` and `--color-border` to `--border`. It lands after this app's own
 * `@theme`, so it wins for every component, not just the vendored ones — which
 * once replaced saga-blue with a neutral palette across the whole app and made
 * the top nav look like it had vanished.
 *
 * The fix is to point shadcn's tokens at this app's palette. These assertions
 * fail if a future `shadcn add` resets them.
 */
const css = readFileSync(new URL("./index.css", import.meta.url), "utf8");

/** The value of `name` inside the `:root` block. */
function rootValue(name: string) {
	const root = css.slice(css.indexOf(":root {"));
	const match = root.match(new RegExp(`(?<![-\\w])--${name}:\\s*([^;]+);`));
	return match?.[1]?.trim();
}

describe("the shadcn theme bridge", () => {
	it("maps shadcn's primary onto saga-blue", () => {
		expect(rootValue("primary")).toBe("#2196f3");
	});

	it("maps shadcn's border onto the saga border", () => {
		expect(rootValue("border")).toBe("#ced4da");
	});

	it("maps shadcn's focus ring onto the saga highlight", () => {
		expect(rootValue("ring")).toBe("#a6d5fa");
	});

	it("still declares the app's own tokens", () => {
		for (const token of [
			"--color-text:",
			"--color-text-secondary:",
			"--color-preferred:",
			"--color-busy:",
			"--radius-saga:",
		]) {
			expect(css).toContain(token);
		}
	});
});
