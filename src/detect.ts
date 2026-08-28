export function isPlainObject(value: unknown): value is Record<string, unknown> {
	return (
		typeof value === "object" &&
		value !== null &&
		!Array.isArray(value) &&
		Object.getPrototypeOf(value) === Object.prototype
	);
}

// True only for values Obsidian's stock Properties panel cannot render:
// plain objects, and arrays that contain objects or nested arrays.
// Scalar values and flat arrays (text, list, number, date...) are never claimed.
export function isNestedValue(value: unknown): boolean {
	if (isPlainObject(value)) {
		return true;
	}
	if (Array.isArray(value)) {
		return value.some((item) => isPlainObject(item) || Array.isArray(item));
	}
	return false;
}
