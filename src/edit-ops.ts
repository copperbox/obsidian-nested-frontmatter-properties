// Pure, app-free mutation helpers for nested frontmatter values.
// Each operation returns a structurally-updated deep clone; the caller commits
// the result through Obsidian's public frontmatter API.

export type Path = (string | number)[];

export type Leaf = string | number | boolean | null;

function clone<T>(value: T): T {
	return structuredClone(value);
}

function resolveParent(root: unknown, path: Path): unknown {
	let node: unknown = root;
	for (const segment of path.slice(0, -1)) {
		if (Array.isArray(node) && typeof segment === "number") {
			node = node[segment];
		} else if (isRecord(node) && typeof segment === "string") {
			node = node[segment];
		} else {
			throw new Error(`Invalid path segment: ${String(segment)}`);
		}
	}
	return node;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function lastSegment(path: Path): string | number {
	const segment = path[path.length - 1];
	if (segment === undefined) {
		throw new Error("Path must not be empty");
	}
	return segment;
}

export function getAtPath(root: unknown, path: Path): unknown {
	if (path.length === 0) {
		return root;
	}
	const parent = resolveParent(root, path);
	const segment = lastSegment(path);
	if (Array.isArray(parent) && typeof segment === "number") {
		return parent[segment];
	}
	if (isRecord(parent) && typeof segment === "string") {
		return parent[segment];
	}
	return undefined;
}

export function setAtPath(root: unknown, path: Path, value: unknown): unknown {
	if (path.length === 0) {
		return clone(value);
	}
	const next = clone(root);
	const parent = resolveParent(next, path);
	const segment = lastSegment(path);
	if (Array.isArray(parent) && typeof segment === "number") {
		parent[segment] = value;
	} else if (isRecord(parent) && typeof segment === "string") {
		parent[segment] = value;
	} else {
		throw new Error(`Cannot set path segment: ${String(segment)}`);
	}
	return next;
}

export function removeAtPath(root: unknown, path: Path): unknown {
	const next = clone(root);
	const parent = resolveParent(next, path);
	const segment = lastSegment(path);
	if (Array.isArray(parent) && typeof segment === "number") {
		parent.splice(segment, 1);
	} else if (isRecord(parent) && typeof segment === "string") {
		delete parent[segment];
	} else {
		throw new Error(`Cannot remove path segment: ${String(segment)}`);
	}
	return next;
}

export function addArrayItem(root: unknown, arrayPath: Path, item: unknown): unknown {
	const next = clone(root);
	const target = arrayPath.length === 0 ? next : getAtPath(next, arrayPath);
	if (!Array.isArray(target)) {
		throw new Error("Target is not an array");
	}
	target.push(clone(item));
	return next;
}

export function addObjectKey(root: unknown, objectPath: Path, key: string, value: unknown): unknown {
	const next = clone(root);
	const target = objectPath.length === 0 ? next : getAtPath(next, objectPath);
	if (typeof target !== "object" || target === null || Array.isArray(target)) {
		throw new Error("Target is not an object");
	}
	(target as Record<string, unknown>)[key] = clone(value);
	return next;
}

export function renameKey(root: unknown, path: Path, newKey: string): unknown {
	const oldKey = lastSegment(path);
	if (typeof oldKey !== "string") {
		throw new Error("Only object keys can be renamed");
	}
	if (oldKey === newKey) {
		return clone(root);
	}
	const next = clone(root);
	const parent = resolveParent(next, path);
	if (typeof parent !== "object" || parent === null || Array.isArray(parent)) {
		throw new Error("Parent is not an object");
	}
	const record = parent as Record<string, unknown>;
	// Rebuild in place to keep key order stable.
	const entries = Object.entries(record).map(([k, v]): [string, unknown] =>
		k === oldKey ? [newKey, v] : [k, v]
	);
	for (const k of Object.keys(record)) {
		delete record[k];
	}
	for (const [k, v] of entries) {
		record[k] = v;
	}
	return next;
}

// A template for "add item" on an array of objects: same keys as the given
// item, with empty values of matching primitive type.
export function blankLike(item: unknown): unknown {
	if (Array.isArray(item)) {
		return [];
	}
	if (typeof item === "object" && item !== null) {
		const result: Record<string, unknown> = {};
		for (const [k, v] of Object.entries(item)) {
			result[k] = blankLike(v);
		}
		return result;
	}
	if (typeof item === "number") {
		return 0;
	}
	if (typeof item === "boolean") {
		return false;
	}
	return "";
}
