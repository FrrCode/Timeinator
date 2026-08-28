import { describe, expect, it } from "vitest";
import { hourTone, TONE_CLASS } from "./grid.ts";

describe("hourTone", () => {
	it("calls 08:00–17:00 working hours", () => {
		for (const hour of [8, 12, 17]) {
			expect(hourTone(hour)).toBe("working");
		}
	});

	it("calls the shoulders off-hours", () => {
		for (const hour of [6, 7, 18, 21]) {
			expect(hourTone(hour)).toBe("off");
		}
	});

	it("calls 22:00–05:00 night, across midnight", () => {
		for (const hour of [22, 23, 0, 3, 5]) {
			expect(hourTone(hour)).toBe("night");
		}
	});

	it("covers all 24 hours with no gaps", () => {
		for (let hour = 0; hour < 24; hour += 1) {
			expect(["working", "off", "night"]).toContain(hourTone(hour));
		}
	});
});

describe("TONE_CLASS", () => {
	it("names a class for every tone", () => {
		for (const tone of ["working", "off", "night"] as const) {
			expect(TONE_CLASS[tone]).toMatch(/^bg-hour-/);
		}
	});

	it("gives each tone its own class", () => {
		expect(new Set(Object.values(TONE_CLASS)).size).toBe(3);
	});
});
