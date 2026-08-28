/**
 * Regenerates the README screenshots.
 *
 * Drives the system Chromium through playwright-core, which ships no browser of
 * its own — the point being that this needs nothing installed beyond a browser
 * you already have. Run it against a built app:
 *
 *     pnpm build && pnpm screenshots
 *
 * It starts its own server on a spare port against a throwaway database, seeds a
 * poll so the Pick a time shots have something to show, and writes into
 * docs/screenshots/.
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { chromium, type Page } from "playwright-core";
import { createApp } from "../server/app.ts";
import { openDatabase } from "../server/db.ts";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = resolve(ROOT, "docs/screenshots");
const PORT = 4321;
const BASE = `http://127.0.0.1:${PORT}`;

/** Zones with enough spread that the heat map shows all three tones at once. */
const ZONES = [
	"Europe/Berlin",
	"America/New_York",
	"America/Los_Angeles",
	"Asia/Tokyo",
];

const WATCH = ZONES.map((zone) => `watch=${encodeURIComponent(zone)}`).join(
	"&",
);

/** The system browser. playwright-core ships none, which is the point. */
function findChromium() {
	if (process.env.CHROMIUM_PATH) {
		return process.env.CHROMIUM_PATH;
	}
	const known = [
		"/usr/bin/chromium",
		"/usr/bin/chromium-browser",
		"/usr/bin/google-chrome",
		"/usr/bin/google-chrome-stable",
		"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
	].find((path) => existsSync(path));
	if (known) {
		return known;
	}
	for (const name of ["chromium", "google-chrome", "chrome"]) {
		try {
			return execFileSync("command", ["-v", name], {
				shell: true,
				encoding: "utf8",
			}).trim();
		} catch {
			// Not on PATH under this name; try the next.
		}
	}
	return undefined;
}

const EXECUTABLE = findChromium();

/**
 * Make an emoji font visible to this run only.
 *
 * Participants are identified by an emoji avatar, so a machine with no emoji
 * font renders the shots full of tofu boxes — which look like a bug in the app
 * rather than a missing font. Rather than install anything, this points
 * fontconfig at a font that is already on disk, for this process alone.
 */
function emojiFontConfig(): string | undefined {
	try {
		if (
			execFileSync("fc-list", [":charset=1f600"], { encoding: "utf8" }).trim()
		) {
			return undefined; // Already available system-wide.
		}
	} catch {
		// No fontconfig tooling; fall through and try anyway.
	}

	const dirs = [
		process.env.EMOJI_FONT_DIR,
		"/usr/share/fonts/noto-color-emoji",
		"/opt/zen-browser-bin/fonts",
		"/opt/android-studio/plugins/design-tools/resources/layoutlib/data/fonts",
	].filter((dir): dir is string => Boolean(dir) && existsSync(dir as string));

	if (dirs.length === 0) {
		console.warn(
			"  ! No emoji font found. Avatars will render as boxes.\n" +
				"    Install one (e.g. noto-fonts-emoji) or set EMOJI_FONT_DIR.",
		);
		return undefined;
	}

	const file = resolve(tmpdir(), `timeinator-fonts-${process.pid}.conf`);
	writeFileSync(
		file,
		`<?xml version="1.0"?><!DOCTYPE fontconfig SYSTEM "fonts.dtd"><fontconfig>
  <include ignore_missing="yes">/etc/fonts/fonts.conf</include>
${dirs.map((dir) => `  <dir>${dir}</dir>`).join("\n")}
</fontconfig>`,
	);
	console.log(`  · emoji font from ${dirs[0]}`);
	return file;
}

async function seedPoll(): Promise<string> {
	const app = createApp(openDatabase(":memory:"));
	void app;
	// The real server owns the database; seed over HTTP so the shots show the
	// same data the browser will load.
	const created = await fetch(`${BASE}/api/polls`, {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify({ title: "Design review" }),
	});
	const { pollId } = (await created.json()) as { pollId: string };

	const people = [
		{ name: "Brave Otter", avatar: "🦦", zone: "Europe/Berlin" },
		{ name: "Swift Fox", avatar: "🦊", zone: "America/New_York" },
		{ name: "Quiet Owl", avatar: "🦉", zone: "Asia/Tokyo" },
	];

	// Today: the week view spans the whole week, but the phone's three-day view
	// starts at today and looks forward — marks on any other day photograph as an
	// empty grid in one of the two.
	const midnight = new Date();
	midnight.setUTCHours(0, 0, 0, 0);
	const day = midnight.getTime() / 1000;
	const hour = 3600;
	// Berlin is UTC+2 in the shooting window, and the calendar opens scrolled to
	// the early morning — so these sit where the default viewport actually looks.
	const marks = [
		[
			{
				start: day + 7 * hour,
				end: day + 10 * hour,
				kind: "preferred",
			},
			{ start: day + 5 * hour, end: day + 6 * hour, kind: "busy" },
		],
		[
			{
				start: day + 7 * hour,
				end: day + 9 * hour,
				kind: "preferred",
			},
			{
				start: day + 10 * hour,
				end: day + 11 * hour,
				kind: "busy",
			},
		],
		[
			{
				start: day + 7 * hour,
				end: day + 8 * hour,
				kind: "preferred",
			},
			{ start: day + 4 * hour, end: day + 5 * hour, kind: "busy" },
		],
	];

	for (const [index, person] of people.entries()) {
		const joined = await fetch(`${BASE}/api/polls/${pollId}/participants`, {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({
				name: person.name,
				timezone: person.zone,
				avatar: person.avatar,
			}),
		});
		const { token } = (await joined.json()) as { token: string };
		await fetch(`${BASE}/api/polls/${pollId}/marks`, {
			method: "PUT",
			headers: { "content-type": "application/json", "x-participant": token },
			body: JSON.stringify({ marks: marks[index] }),
		});
	}

	return pollId;
}

/** Let fonts settle and the grid paint before capturing. */
async function settle(page: Page) {
	await page.evaluate(() => document.fonts.ready);
	await page.waitForTimeout(400);
}

/**
 * Capture down to the end of the content, not the end of the page.
 *
 * Two signals, because neither is enough alone. The footer's top works on a
 * phone, where it sits in normal flow, but not on a desktop, where it is pinned
 * to the bottom of the viewport regardless of how short the clock is. Measuring
 * the lowest element works on a desktop but not on a phone, where the hour grid
 * scrolls inside a fixed box and its rows extend far below what is visible.
 * Whichever cut is higher is the honest one.
 */
async function shoot(page: Page, path: string) {
	const viewport = page.viewportSize();
	const bottom = await page.evaluate(() => {
		const footer = document.querySelector(".bg-footer");
		let lowest = 0;
		for (const element of document.body.querySelectorAll("*")) {
			// The footer, its children, and its ancestors, whose boxes stretch
			// down to enclose it.
			if (
				footer &&
				(element === footer ||
					footer.contains(element) ||
					element.contains(footer))
			) {
				continue;
			}
			const box = element.getBoundingClientRect();
			if (box.width > 0 && box.height > 0) {
				lowest = Math.max(lowest, box.bottom);
			}
		}
		const footerTop = footer
			? footer.getBoundingClientRect().top
			: Number.POSITIVE_INFINITY;
		return { lowest, footerTop };
	});

	if (!viewport || bottom.lowest <= 0) {
		await page.screenshot({ path });
		return;
	}

	await page.screenshot({
		path,
		clip: {
			x: 0,
			y: 0,
			width: viewport.width,
			height: Math.min(
				// Breathing room under the last row...
				Math.ceil(bottom.lowest) + 24,
				// ...but never into the footer, which is what the padding would
				// otherwise buy: a thin strip of it along the bottom edge.
				Math.floor(bottom.footerTop),
				// ...and never past the viewport, whose pixels beyond were never
				// rendered.
				viewport.height,
			),
		},
	});
}

async function main() {
	if (!EXECUTABLE) {
		throw new Error(
			"No Chromium found. Install one, or set CHROMIUM_PATH to its binary.",
		);
	}

	rmSync(OUT, { recursive: true, force: true });
	mkdirSync(OUT, { recursive: true });

	const dataDir = resolve(ROOT, ".screenshot-data");
	rmSync(dataDir, { recursive: true, force: true });
	mkdirSync(dataDir, { recursive: true });

	const app = createApp(openDatabase(resolve(dataDir, "shots.db")));
	app.use("/*", serveStatic({ root: "./dist" }));
	app.get("*", serveStatic({ path: "./dist/index.html" }));
	const server = serve({ fetch: app.fetch, port: PORT });

	const pollId = await seedPoll();
	const fontConfig = emojiFontConfig();
	const browser = await chromium.launch({
		executablePath: EXECUTABLE,
		env: fontConfig
			? { ...process.env, FONTCONFIG_FILE: fontConfig }
			: process.env,
		args: [
			"--no-sandbox",
			"--force-color-profile=srgb",
			"--font-render-hinting=none",
		],
	});

	const shots: Array<[string, () => Promise<void>]> = [];

	const desktop = await browser.newContext({
		viewport: { width: 1280, height: 800 },
		deviceScaleFactor: 2,
		timezoneId: "Europe/Berlin",
	});
	const page = await desktop.newPage();

	shots.push([
		"overview",
		async () => {
			await page.goto(`${BASE}/?${WATCH}`, { waitUntil: "networkidle" });
			await settle(page);
			await shoot(page, `${OUT}/overview.png`);
		},
	]);

	shots.push([
		"create-event",
		async () => {
			await page.goto(`${BASE}/?${WATCH}`, { waitUntil: "networkidle" });
			await settle(page);
			// A cell in the middle of the reference row, so the popover opens
			// downward with room around it.
			await page
				.getByRole("button", { name: /^Create an event at/ })
				.nth(14)
				.click();
			await page.waitForTimeout(250);
			await shoot(page, `${OUT}/create-event.png`);
		},
	]);

	shots.push([
		"date-picker",
		async () => {
			await page.goto(`${BASE}/?${WATCH}`, { waitUntil: "networkidle" });
			await settle(page);
			await page.getByRole("button", { name: /\d{1,2} \w{3} \d{4}/ }).click();
			await page.waitForTimeout(250);
			await shoot(page, `${OUT}/date-picker.png`);
		},
	]);

	shots.push([
		"pick-time",
		async () => {
			await page.goto(`${BASE}/pick/${pollId}`, { waitUntil: "networkidle" });
			await settle(page);
			await page.waitForTimeout(600);
			await shoot(page, `${OUT}/pick-time.png`);
		},
	]);

	const phone = await browser.newContext({
		viewport: { width: 390, height: 844 },
		deviceScaleFactor: 3,
		isMobile: true,
		hasTouch: true,
		timezoneId: "Europe/Berlin",
	});
	const small = await phone.newPage();

	shots.push([
		"mobile",
		async () => {
			await small.goto(`${BASE}/?${WATCH}`, { waitUntil: "networkidle" });
			await settle(small);
			await shoot(small, `${OUT}/mobile.png`);
		},
	]);

	shots.push([
		"mobile-pick",
		async () => {
			await small.goto(`${BASE}/pick/${pollId}`, { waitUntil: "networkidle" });
			await settle(small);
			await small.waitForTimeout(600);
			await shoot(small, `${OUT}/mobile-pick.png`);
		},
	]);

	for (const [name, take] of shots) {
		try {
			await take();
			console.log(`  ✓ ${name}.png`);
		} catch (error) {
			console.error(`  ✗ ${name}: ${(error as Error).message}`);
			process.exitCode = 1;
		}
	}

	await browser.close();
	server.close();
	rmSync(dataDir, { recursive: true, force: true });
}

main().catch((error) => {
	console.error(error);
	process.exit(1);
});
