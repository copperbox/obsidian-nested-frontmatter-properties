import { describe, expect, it } from "vitest";
import {
	addArrayItem,
	addObjectKey,
	blankLike,
	getAtPath,
	removeAtPath,
	renameKey,
	setAtPath,
} from "../edit-ops";

const sample = () => ({
	authors: [
		{ name: "Ann", pages: 10 },
		{ name: "Ben", pages: 20 },
	],
	meta: { draft: true },
});

describe("getAtPath", () => {
	it("reads nested values", () => {
		expect(getAtPath(sample(), ["authors", 1, "name"])).toBe("Ben");
		expect(getAtPath(sample(), ["meta", "draft"])).toBe(true);
		expect(getAtPath(sample(), [])).toEqual(sample());
	});

	it("returns undefined for missing keys", () => {
		expect(getAtPath(sample(), ["meta", "missing"])).toBeUndefined();
	});
});

describe("setAtPath", () => {
	it("updates without mutating the original", () => {
		const original = sample();
		const next = setAtPath(original, ["authors", 0, "name"], "Zoe");
		expect(getAtPath(next, ["authors", 0, "name"])).toBe("Zoe");
		expect(original.authors[0]?.name).toBe("Ann");
	});

	it("replaces the whole value for an empty path", () => {
		expect(setAtPath(sample(), [], { fresh: 1 })).toEqual({ fresh: 1 });
	});

	it("throws on invalid paths", () => {
		expect(() => setAtPath(sample(), ["authors", "not-an-index"], 1)).toThrow();
	});
});

describe("removeAtPath", () => {
	it("removes object keys", () => {
		const next = removeAtPath(sample(), ["meta", "draft"]);
		expect(getAtPath(next, ["meta"])).toEqual({});
	});

	it("splices array items", () => {
		const next = removeAtPath(sample(), ["authors", 0]) as ReturnType<typeof sample>;
		expect(next.authors).toHaveLength(1);
		expect(next.authors[0]?.name).toBe("Ben");
	});
});

describe("addArrayItem / addObjectKey", () => {
	it("appends to nested arrays", () => {
		const next = addArrayItem(sample(), ["authors"], { name: "Cy", pages: 0 });
		expect(getAtPath(next, ["authors", 2, "name"])).toBe("Cy");
	});

	it("adds keys to nested objects", () => {
		const next = addObjectKey(sample(), ["meta"], "tags", []);
		expect(getAtPath(next, ["meta", "tags"])).toEqual([]);
	});

	it("rejects mismatched targets", () => {
		expect(() => addArrayItem(sample(), ["meta"], 1)).toThrow();
		expect(() => addObjectKey(sample(), ["authors"], "x", 1)).toThrow();
	});
});

describe("renameKey", () => {
	it("renames while preserving key order and value", () => {
		const next = renameKey(sample(), ["authors", 0, "name"], "fullName") as ReturnType<
			typeof sample
		>;
		expect(Object.keys(next.authors[0] ?? {})).toEqual(["fullName", "pages"]);
		expect(getAtPath(next, ["authors", 0, "fullName"])).toBe("Ann");
	});

	it("rejects renaming array indices", () => {
		expect(() => renameKey(sample(), ["authors", 0], "x")).toThrow();
	});
});

describe("blankLike", () => {
	it("mirrors object shape with empty values", () => {
		expect(blankLike({ name: "Ann", pages: 10, active: true, tags: ["x"] })).toEqual({
			name: "",
			pages: 0,
			active: false,
			tags: [],
		});
	});

	it("defaults scalars to empty string", () => {
		expect(blankLike("x")).toBe("");
		expect(blankLike(null)).toBe("");
	});
});
