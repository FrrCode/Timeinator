import { describe, expect, it } from "vitest";
import {
	ANIMALS,
	avatarFor,
	PARTICIPANT_COLORS,
	participantColor,
	randomIdentity,
} from "./identity.ts";

describe("randomIdentity", () => {
	it("returns an adjective, an animal and that animal's emoji", () => {
		const identity = randomIdentity();
		const [adjective, animal] = identity.name.split(" ");
		expect(adjective).toMatch(/^[A-Z][a-z]+$/);
		expect(ANIMALS.some((entry) => entry.name === animal)).toBe(true);
		expect(identity.avatar).toBe(
			ANIMALS.find((entry) => entry.name === animal)?.emoji,
		);
	});

	it("varies across calls", () => {
		const seen = new Set(
			Array.from({ length: 40 }, () => randomIdentity().name),
		);
		expect(seen.size).toBeGreaterThan(1);
	});

	it("never exceeds the name length the API accepts", () => {
		for (let index = 0; index < 200; index += 1) {
			expect(randomIdentity().name.length).toBeLessThanOrEqual(40);
		}
	});
});

describe("avatarFor", () => {
	it("finds the emoji for an animal regardless of case", () => {
		expect(avatarFor("Brave Otter")).toBe("🦦");
		expect(avatarFor("brave otter")).toBe("🦦");
	});

	it("falls back for a name with no animal in it", () => {
		expect(avatarFor("Petr")).toBe("🙂");
	});
});

describe("participantColor", () => {
	it("gives the first participants distinct colours", () => {
		const colors = PARTICIPANT_COLORS.map((_, index) =>
			participantColor(index),
		);
		expect(new Set(colors).size).toBe(PARTICIPANT_COLORS.length);
	});

	it("wraps rather than running off the end", () => {
		expect(participantColor(PARTICIPANT_COLORS.length)).toBe(
			participantColor(0),
		);
	});

	it("is stable for a given index", () => {
		expect(participantColor(3)).toBe(participantColor(3));
	});

	it("has enough colours to tell a realistic group apart", () => {
		expect(PARTICIPANT_COLORS.length).toBeGreaterThanOrEqual(10);
	});
});
