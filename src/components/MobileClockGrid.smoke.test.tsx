import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { dayjs } from "../lib/dayjs.ts";
import { getSlots } from "../lib/grid.ts";
import { MobileClockGrid } from "./MobileClockGrid.tsx";

const anchor = dayjs.utc("2026-09-02T12:00:00Z");

function render() {
	return renderToStaticMarkup(
		<MobileClockGrid
			slots={getSlots(anchor)}
			timezones={["Europe/Berlin", "America/New_York"]}
			myTimezone="Europe/Berlin"
			anchor={anchor}
			now={anchor}
			hour12={false}
			picked={null}
			onPick={() => {}}
			onClosePicked={() => {}}
			onRemove={() => {}}
			onMoveEarlier={() => {}}
			onMoveLater={() => {}}
		/>,
	);
}

describe("MobileClockGrid", () => {
	/**
	 * The zone headers stay put while the hours scroll under them, so their
	 * background has to be opaque. A tinted one (`bg-muted/40`) let every row
	 * show straight through as it passed behind.
	 */
	it("gives the sticky header an opaque background", () => {
		const header = render().match(/<div class="(sticky[^"]*)"/);
		expect(header?.[1]).toBeDefined();
		// No alpha suffix: `bg-muted/40` and friends are see-through.
		expect(header?.[1]).toMatch(/\bbg-(background|muted|card)\b(?!\/)/);
	});
});
