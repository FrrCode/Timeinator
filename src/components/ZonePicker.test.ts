import { describe, expect, it } from "vitest";
import { matchTimezones } from "./ZonePicker.tsx";

/**
 * shadcn's Command does its own fuzzy filtering. It is disabled in ZonePicker
 * and this matcher used instead, because the documented behaviour is
 * case/punctuation-blind substring matching — "new york", "NEW-YORK" and
 * "america/new_york" all find the same zone. A fuzzy matcher would quietly
 * change all three.
 */
const ZONES = [
	"America/New_York",
	"Europe/Berlin",
	"Europe/London",
	"Pacific/Auckland",
	"Asia/Tokyo",
];

describe("matchTimezones", () => {
	it("ignores case, spaces and punctuation", () => {
		for (const query of [
			"new york",
			"NEW-YORK",
			"america/new_york",
			"NewYork",
		]) {
			expect(matchTimezones(ZONES, query)).toContain("America/New_York");
		}
	});

	it("matches on a fragment anywhere in the name", () => {
		expect(matchTimezones(ZONES, "berlin")).toEqual(["Europe/Berlin"]);
		expect(matchTimezones(ZONES, "europe")).toEqual([
			"Europe/Berlin",
			"Europe/London",
		]);
	});

	it("returns everything for an empty query", () => {
		expect(matchTimezones(ZONES, "")).toHaveLength(ZONES.length);
	});

	it("returns nothing when nothing matches", () => {
		expect(matchTimezones(ZONES, "mars")).toEqual([]);
	});

	it("caps the list so the popover cannot render 400 rows", () => {
		const many = Array.from({ length: 500 }, (_, i) => `Zone/City${i}`);
		expect(matchTimezones(many, "zone").length).toBeLessThanOrEqual(50);
	});
});
