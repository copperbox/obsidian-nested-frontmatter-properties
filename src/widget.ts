import { isPlainObject } from "./detect";
import {
	addArrayItem,
	addObjectKey,
	blankLike,
	removeAtPath,
	setAtPath,
	type Leaf,
	type Path,
} from "./edit-ops";

export type CommitFn = (value: unknown) => void;

// Renders one nested property value as an editable tree. All persistence goes
// through `commit`, which receives the full updated top-level value; the panel
// re-renders from the metadata cache after the write lands.
export function renderNestedValue(root: HTMLElement, value: unknown, commit: CommitFn): void {
	root.empty();
	root.addClass("nfp-root");
	renderNode(root, value, [], value, commit);
}

function renderNode(
	el: HTMLElement,
	node: unknown,
	path: Path,
	rootValue: unknown,
	commit: CommitFn
): void {
	if (Array.isArray(node)) {
		renderArray(el, node, path, rootValue, commit);
	} else if (isPlainObject(node)) {
		renderObject(el, node, path, rootValue, commit);
	} else {
		renderLeaf(el, node as Leaf, path, rootValue, commit);
	}
}

function renderObject(
	el: HTMLElement,
	node: Record<string, unknown>,
	path: Path,
	rootValue: unknown,
	commit: CommitFn
): void {
	const container = el.createDiv({ cls: "nfp-object" });
	for (const [key, value] of Object.entries(node)) {
		const row = container.createDiv({ cls: "nfp-row" });
		row.createSpan({ cls: "nfp-key", text: key });
		const valueEl = row.createDiv({ cls: "nfp-value" });
		renderNode(valueEl, value, [...path, key], rootValue, commit);
		addRemoveButton(row, [...path, key], rootValue, commit);
	}
	const addButton = container.createEl("button", {
		cls: "nfp-add",
		text: "Add property",
	});
	addButton.addEventListener("click", () => {
		addButton.addClass("nfp-hidden");
		const input = container.createEl("input", {
			cls: "nfp-input",
			type: "text",
			attr: { placeholder: "Property name" },
		});
		const done = () => {
			const key = input.value.trim();
			input.remove();
			addButton.removeClass("nfp-hidden");
			if (key && !(key in node)) {
				commit(addObjectKey(rootValue, path, key, ""));
			}
		};
		input.addEventListener("blur", done);
		input.addEventListener("keydown", (event) => {
			if (event.key === "Enter") {
				input.blur();
			} else if (event.key === "Escape") {
				input.value = "";
				input.blur();
			}
		});
		input.focus();
	});
}

function renderArray(
	el: HTMLElement,
	node: unknown[],
	path: Path,
	rootValue: unknown,
	commit: CommitFn
): void {
	const container = el.createDiv({ cls: "nfp-array" });
	node.forEach((item, index) => {
		const itemEl = container.createDiv({ cls: "nfp-array-item" });
		const body = itemEl.createDiv({ cls: "nfp-array-item-body" });
		renderNode(body, item, [...path, index], rootValue, commit);
		addRemoveButton(itemEl, [...path, index], rootValue, commit);
	});
	const addButton = container.createEl("button", {
		cls: "nfp-add",
		text: "Add item",
	});
	addButton.addEventListener("click", () => {
		const template = node.length > 0 ? blankLike(node[node.length - 1]) : "";
		commit(addArrayItem(rootValue, path, template));
	});
}

function renderLeaf(
	el: HTMLElement,
	value: Leaf,
	path: Path,
	rootValue: unknown,
	commit: CommitFn
): void {
	if (typeof value === "boolean") {
		const input = el.createEl("input", { cls: "nfp-input", type: "checkbox" });
		input.checked = value;
		input.addEventListener("change", () => {
			commit(setAtPath(rootValue, path, input.checked));
		});
		return;
	}

	const isNumber = typeof value === "number";
	const input = el.createEl("input", {
		cls: "nfp-input",
		type: isNumber ? "number" : "text",
	});
	input.value = value === null || value === undefined ? "" : String(value);

	const commitInput = () => {
		const raw = input.value;
		const parsed: Leaf = isNumber && raw !== "" && !Number.isNaN(Number(raw)) ? Number(raw) : raw;
		if (parsed !== value) {
			commit(setAtPath(rootValue, path, parsed));
		}
	};

	input.addEventListener("blur", commitInput);
	input.addEventListener("keydown", (event) => {
		if (event.key === "Enter") {
			input.blur();
		} else if (event.key === "Escape") {
			input.value = value === null || value === undefined ? "" : String(value);
			input.blur();
		}
	});
}

function addRemoveButton(
	row: HTMLElement,
	path: Path,
	rootValue: unknown,
	commit: CommitFn
): void {
	const button = row.createEl("button", {
		cls: "nfp-remove",
		attr: { "aria-label": "Remove" },
		text: "×",
	});
	button.addEventListener("click", () => {
		commit(removeAtPath(rootValue, path));
	});
}
