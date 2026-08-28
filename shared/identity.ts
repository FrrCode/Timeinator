/**
 * Who somebody is before they have told you: a generated name, an emoji that
 * matches it, and a colour drawn from their place in the roster.
 *
 * Shared with the server because it validates what it stores, and because the
 * roster order the colours key off is the server's `created_at` ordering.
 */

/** Paired so the emoji always matches the animal the name was born with. */
export const ANIMALS = [
	{ name: "Otter", emoji: "🦦" },
	{ name: "Fox", emoji: "🦊" },
	{ name: "Owl", emoji: "🦉" },
	{ name: "Badger", emoji: "🦡" },
	{ name: "Hedgehog", emoji: "🦔" },
	{ name: "Squirrel", emoji: "🐿️" },
	{ name: "Rabbit", emoji: "🐰" },
	{ name: "Wolf", emoji: "🐺" },
	{ name: "Bear", emoji: "🐻" },
	{ name: "Panda", emoji: "🐼" },
	{ name: "Koala", emoji: "🐨" },
	{ name: "Tiger", emoji: "🐯" },
	{ name: "Lion", emoji: "🦁" },
	{ name: "Deer", emoji: "🦌" },
	{ name: "Zebra", emoji: "🦓" },
	{ name: "Giraffe", emoji: "🦒" },
	{ name: "Whale", emoji: "🐳" },
	{ name: "Dolphin", emoji: "🐬" },
	{ name: "Penguin", emoji: "🐧" },
	{ name: "Swan", emoji: "🦢" },
	{ name: "Falcon", emoji: "🦅" },
	{ name: "Seal", emoji: "🦭" },
] as const;

const ADJECTIVES = [
	"Brave",
	"Swift",
	"Quiet",
	"Clever",
	"Bright",
	"Calm",
	"Bold",
	"Keen",
	"Gentle",
	"Merry",
	"Nimble",
	"Patient",
	"Steady",
	"Eager",
	"Lucky",
	"Sunny",
] as const;

/** Shown when a renamed participant's name no longer names an animal. */
const FALLBACK_AVATAR = "🙂";

/**
 * Distinct enough to tell apart at the size of a 20px disc, and dark enough for
 * white initials and for the name itself to stay readable on white.
 */
export const PARTICIPANT_COLORS = [
	"#2563eb",
	"#dc2626",
	"#059669",
	"#d97706",
	"#7c3aed",
	"#db2777",
	"#0891b2",
	"#65a30d",
	"#ea580c",
	"#4f46e5",
	"#be123c",
	"#0d9488",
] as const;

function pick<T>(list: readonly T[]): T {
	// Non-null: every list here is a non-empty literal.
	return list[Math.floor(Math.random() * list.length)] as T;
}

export type Identity = {
	name: string;
	avatar: string;
};

/** "Brave Otter" and 🦦 — a name you can live with until you type your own. */
export function randomIdentity(): Identity {
	const animal = pick(ANIMALS);
	return { name: `${pick(ADJECTIVES)} ${animal.name}`, avatar: animal.emoji };
}

/**
 * The emoji for whichever animal appears in `name`.
 *
 * Only used to seed a new participant. Once they exist the avatar is stored, so
 * renaming yourself to "Petr" keeps the otter rather than losing it.
 */
export function avatarFor(name: string) {
	const words = name.toLowerCase().split(/\s+/);
	const match = ANIMALS.find((animal) =>
		words.includes(animal.name.toLowerCase()),
	);
	return match?.emoji ?? FALLBACK_AVATAR;
}

/**
 * The colour for the participant at `index` in the roster.
 *
 * Keyed on position rather than stored per person, because position guarantees
 * neighbours differ — two independently drawn colours could collide, and the
 * whole point is telling people apart. The roster is ordered by `created_at`,
 * so a given person's colour does not move once they have joined.
 */
export function participantColor(index: number) {
	return PARTICIPANT_COLORS[index % PARTICIPANT_COLORS.length] as string;
}
