import { describe, expect, it } from "vitest";
import { isNestedValue, isPlainObject } from "../detect";

describe("isPlainObject", () => {
	it("accepts object literals", () => {
		expect(isPlainObject({ a: 1 })).toBe(true);
		expect(isPlainObject({})).toBe(true);
	});

	it("rejects arrays, null, scalars, and class instances", () => {
		expect(isPlainObject([])).toBe(false);
		expect(isPlainObject(null)).toBe(false);
		expect(isPlainObject("x")).toBe(false);
		expect(isPlainObject(3)).toBe(false);
		expect(isPlainObject(new Date())).toBe(false);
	});
});

describe("isNestedValue", () => {
	it("claims plain objects", () => {
		expect(isNestedValue({ a: 1 })).toBe(true);
		expect(isNestedValue({})).toBe(true);
	});

	it("claims arrays of objects and arrays of arrays", () => {
		expect(isNestedValue([{ name: "a" }])).toBe(true);
		expect(isNestedValue([["x"]])).toBe(true);
		expect(isNestedValue(["x", { name: "a" }])).toBe(true);
	});

	it("leaves values the stock UI supports alone", () => {
		expect(isNestedValue("text")).toBe(false);
		expect(isNestedValue(42)).toBe(false);
		expect(isNestedValue(true)).toBe(false);
		expect(isNestedValue(null)).toBe(false);
		expect(isNestedValue(["a", "b"])).toBe(false);
		expect(isNestedValue([])).toBe(false);
		expect(isNestedValue([1, 2, 3])).toBe(false);
	});
});
