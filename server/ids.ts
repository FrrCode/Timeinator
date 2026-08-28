import { randomBytes } from "node:crypto";

/**
 * Crockford base32 — no I, L, O or U, so an id can be read aloud or retyped
 * without the usual one/ell confusion. 256 is a whole multiple of 32, so
 * taking a byte modulo 32 stays uniform.
 */
const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

/** 12 characters, 60 bits: short enough to paste, far too sparse to guess. */
export function newId() {
	let id = "";
	for (const byte of randomBytes(12)) {
		id += ALPHABET[byte % ALPHABET.length];
	}
	return id;
}

/** The participant's secret. Never leaves the browser that minted it. */
export function newToken() {
	return randomBytes(16).toString("hex");
}
