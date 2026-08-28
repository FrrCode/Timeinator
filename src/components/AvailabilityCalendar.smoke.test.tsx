import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
	AvailabilityCalendar,
	type Brush,
	rangeFromSlot,
} from "./AvailabilityCalendar.tsx";

/**
 * A render smoke test, not an interaction test: it proves the vendored calendar
 * mounts with this app's props and lays a Berlin week out in Berlin, including
 * across a daylight-saving boundary. Dragging and clicking need a browser.
 */
const BERLIN = "Europe/Berlin";

const MINE = "p1";
const THEIRS = "p2";

function render(
	date: string,
	zoomMinutes = 60,
	brush: Brush = "preferred",
	visibleDays = 7,
) {
	return renderToStaticMarkup(
		<AvailabilityCalendar
			marks={[
				{
					participantId: MINE,
					// 2026-09-02 10:00–11:00 Berlin.
					start: Date.parse("2026-09-02T08:00:00Z") / 1000,
					end: Date.parse("2026-09-02T09:00:00Z") / 1000,
					kind: "preferred",
				},
				{
					participantId: THEIRS,
					start: Date.parse("2026-09-02T11:00:00Z") / 1000,
					end: Date.parse("2026-09-02T12:00:00Z") / 1000,
					kind: "preferred",
				},
			]}
			participants={[
				{ id: MINE, name: "Petr", timezone: BERLIN, avatar: "🦦" },
				{ id: THEIRS, name: "Anna", timezone: BERLIN, avatar: "🦊" },
			]}
			meId={MINE}
			timezone={BERLIN}
			zoomMinutes={zoomMinutes}
			visibleDays={visibleDays}
			brush={brush}
			date={new Date(date)}
			onDateChange={() => {}}
			onPaint={() => {}}
		/>,
	);
}

describe("AvailabilityCalendar", () => {
	it("renders a week without throwing", () => {
		const html = render("2026-09-02T12:00:00Z");
		expect(html.length).toBeGreaterThan(1000);
	});

	it("lays the week out Monday-first", () => {
		const html = render("2026-09-02T12:00:00Z");
		const monday = html.indexOf("Mon");
		const sunday = html.indexOf("Sun");
		expect(monday).toBeGreaterThan(-1);
		expect(sunday).toBeGreaterThan(monday);
	});

	it("labels the mark with the participant it belongs to", () => {
		expect(render("2026-09-02T12:00:00Z")).toContain("Petr");
	});

	it("renders the spring-forward week without throwing", () => {
		expect(render("2026-03-29T12:00:00Z").length).toBeGreaterThan(1000);
	});
});

describe("painting over other people", () => {
	/**
	 * The library only begins a slot drag when the pointer lands on the day
	 * column itself (`e.target === e.currentTarget` in its time grid), so any
	 * block sitting under the cursor silently swallows the gesture. For a normal
	 * calendar that stops you creating an event on top of one; here it stopped
	 * you marking a slot somebody else had already marked, which is the entire
	 * point of the page.
	 */
	/** The class list of the rendered mark block, which carries `group/ec-event`. */
	function blockClasses(html: string) {
		const match = html.match(/class="([^"]*group\/ec-event[^"]*)"/);
		if (!match?.[1]) {
			throw new Error("no event block rendered");
		}
		return match[1];
	}

	it("makes blocks transparent to the pointer", () => {
		expect(blockClasses(render("2026-09-02T12:00:00Z"))).toContain(
			"pointer-events-none",
		);
	});

	/**
	 * The block itself is not the hit target: the time grid wraps every one in an
	 * absolutely-positioned div, and it is that wrapper the press lands on. Making
	 * only the inner element inert left the guard failing exactly as before.
	 */
	it("makes the positioning wrapper transparent too", () => {
		const html = render("2026-09-02T12:00:00Z");
		const wrapper = html.match(/<div class="([^"]*z-\(--ec-z\)[^"]*)"/);
		expect(wrapper?.[1]).toBeDefined();
		expect(wrapper?.[1]).toContain("pointer-events-none");
	});
});

describe("whose mark is whose", () => {
	it("draws your own marks at full strength and everyone else's muted", () => {
		const html = render("2026-09-02T12:00:00Z");
		// Two preferred blocks, one each; they must not share a colour.
		const colors = [...html.matchAll(/--ec-event-color:\s*([^;"]+)/g)].map(
			(match) => match[1],
		);
		expect(colors).toHaveLength(2);
		expect(new Set(colors).size).toBe(2);
		expect(colors.some((color) => color?.includes("color-preferred"))).toBe(
			true,
		);
		// The muted one is mixed toward white rather than being a second hue.
		expect(colors.some((color) => color?.includes("color-mix"))).toBe(true);
	});
});

describe("rangeFromSlot", () => {
	/**
	 * On a touch pointer the library's create-drag only activates after a 250ms
	 * hold and cancels if the finger moves more than 5px first, so on a phone a
	 * tap ends too early and a drag reads as a scroll. Tapping has to mark
	 * something on its own; this is the conversion behind it.
	 */
	const at = (iso: string) => new Date(Date.parse(iso));

	it("uses the end the grid supplies", () => {
		expect(
			rangeFromSlot(
				{ date: at("2026-09-02T08:00:00Z"), end: at("2026-09-02T08:30:00Z") },
				60,
			),
		).toEqual({
			start: Date.parse("2026-09-02T08:00:00Z") / 1000,
			end: Date.parse("2026-09-02T08:30:00Z") / 1000,
		});
	});

	it("falls back to one zoom step when the grid gives only a point", () => {
		const start = Date.parse("2026-09-02T08:00:00Z") / 1000;
		expect(rangeFromSlot({ date: at("2026-09-02T08:00:00Z") }, 30)).toEqual({
			start,
			end: start + 30 * 60,
		});
		expect(rangeFromSlot({ date: at("2026-09-02T08:00:00Z") }, 15)).toEqual({
			start,
			end: start + 15 * 60,
		});
	});

	it("never returns an empty range", () => {
		const slot = {
			date: at("2026-09-02T08:00:00Z"),
			end: at("2026-09-02T08:00:00Z"),
		};
		const range = rangeFromSlot(slot, 30);
		expect(range.end).toBeGreaterThan(range.start);
	});
});

describe("on a phone", () => {
	/** Seven columns on a 390px screen are ~50px each, with day names truncated. */
	function dayHeaders(html: string) {
		return html.match(/data-slot="event-calendar-day-header"/g) ?? [];
	}

	it("shows a week on a desktop", () => {
		expect(
			dayHeaders(render("2026-09-02T12:00:00Z", 60, "preferred", 7)),
		).toHaveLength(7);
	});

	it("shows three days when asked for three", () => {
		expect(
			dayHeaders(render("2026-09-02T12:00:00Z", 60, "preferred", 3)),
		).toHaveLength(3);
	});

	it("renders whatever count it is given, on any device", () => {
		// The component has no breakpoint of its own: the page picks the default
		// and the control overrides it, so 5 has to work as readily as 3 and 7.
		for (const count of [3, 5, 7]) {
			expect(
				dayHeaders(render("2026-09-02T12:00:00Z", 30, "preferred", count)),
			).toHaveLength(count);
		}
	});
});

describe("resizing your own marks", () => {
	/**
	 * Blocks are inert so a press falls through to the column underneath and can
	 * paint over them. The resize handles are the one part that must still take a
	 * pointer — and upstream they are 6px tall and only appear on hover, which on
	 * a touch screen means never.
	 */
	it("keeps the handles hittable and visible", () => {
		const html = render("2026-09-02T12:00:00Z");
		const handle = html.match(
			/data-slot="event-calendar-resize-handle"[^>]*class="([^"]*)"/,
		);
		expect(handle?.[1]).toBeDefined();
		expect(handle?.[1]).toContain("pointer-events-auto");
		expect(handle?.[1]).toContain("opacity-100");
	});

	it("offers handles on your own marks only", () => {
		const html = render("2026-09-02T12:00:00Z");
		// Two preferred blocks are rendered, one mine and one theirs.
		const handles =
			html.match(/data-slot="event-calendar-resize-handle"/g) ?? [];
		// Top and bottom on the single mark that belongs to the viewer.
		expect(handles).toHaveLength(2);
	});
});
