/**
 * Reduces a string to bare letters and digits, so separators, punctuation,
 * spaces and case stop mattering: "new york", "New_York" and "NEW-YORK" all
 * collapse to the same key.
 */
export function normalizeForSearch(value: string) {
	return value.toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
}
