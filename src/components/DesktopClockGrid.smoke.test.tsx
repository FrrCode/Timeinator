import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { dayjs } from "../lib/dayjs.ts";
import { getSlots } from "../lib/grid.ts";
import { DesktopClockGrid } from "./DesktopClockGrid.tsx";

/**
 * The grid is one CSS grid rather than a stack of rows, which is what makes the
 * columns line up and the now-column continuous. These pin the structural
 * properties that were broken before: a fixed cell count per row, heat on every
 * cell, and no row growing a second line at a day boundary.
 */
const ZONES = ["Europe/Berlin", "America/New_York", "Asia/Tokyo"];
const anchor = dayjs.utc("2026-09-02T12:00:00Z");

function render(
	hour12 = false,
	picked: { rowIndex: number; slotIndex: number } | null = null,
) {
	return renderToStaticMarkup(
		<DesktopClockGrid
			slots={getSlots(anchor)}
			timezones={ZONES}
			myTimezone="Europe/Berlin"
			anchor={anchor}
			now={anchor}
			hour12={hour12}
			picked={picked}
			onPick={() => {}}
			onClosePicked={() => {}}
			onRemove={() => {}}
			onMoveEarlier={() => {}}
			onMoveLater={() => {}}
		/>,
	);
}

describe("DesktopClockGrid", () => {
	it("lays out one grid with a label column plus every slot", () => {
		expect(render()).toContain("grid-template-columns:11rem repeat(24");
	});

	it("renders a cell for every zone and hour", () => {
		// 3 zones x 24 hours of buttons, one per cell.
		const buttons = render().match(/aria-label="Create an event at/g) ?? [];
		expect(buttons).toHaveLength(ZONES.length * 24);
	});

	it("tints every cell by how civil its hour is locally", () => {
		const html = render();
		const tinted =
			(html.match(/bg-hour-work/g)?.length ?? 0) +
			(html.match(/bg-hour-fringe/g)?.length ?? 0) +
			(html.match(/bg-hour-night/g)?.length ?? 0);
		expect(tinted).toBe(ZONES.length * 24);
	});

	it("uses all three tones across zones this far apart", () => {
		const html = render();
		expect(html).toContain("bg-hour-work");
		expect(html).toContain("bg-hour-fringe");
		expect(html).toContain("bg-hour-night");
	});

	it("marks the current hour so the column reads as continuous", () => {
		// One per zone plus the header cell.
		const marked =
			render().match(/inset_1px_0_0_var\(--color-primary\)/g) ?? [];
		expect(marked.length).toBeGreaterThanOrEqual(ZONES.length);
	});

	it("labels a day boundary above the hour, not beside it", () => {
		const html = render();
		expect(html).toMatch(/text-\[9px\][^>]*>\w{3} \d+</);
	});
});

describe("the create-event popover", () => {
	/**
	 * The popover is absolutely positioned inside its cell, so any clipping
	 * ancestor swallows it. `overflow-hidden` on the frame — added to clip the
	 * heat tints at the rounded corners — did exactly that.
	 */
	it("is not trapped inside a clipping ancestor", () => {
		const html = render(false, { rowIndex: 0, slotIndex: 5 });
		const frame = html.match(
			/<div class="([^"]*rounded-lg border border-border[^"]*)"/,
		);
		expect(frame?.[1]).toBeDefined();
		expect(frame?.[1]).not.toContain("overflow-hidden");
	});

	it("still renders when a cell is picked", () => {
		expect(render(false, { rowIndex: 0, slotIndex: 5 })).toContain(
			"Create Google Calendar event",
		);
	});

	it("rounds the corner cells, since the frame no longer clips them", () => {
		const html = render();
		for (const corner of [
			"rounded-tl-lg",
			"rounded-tr-lg",
			"rounded-bl-lg",
			"rounded-br-lg",
		]) {
			expect(html).toContain(corner);
		}
	});
});
