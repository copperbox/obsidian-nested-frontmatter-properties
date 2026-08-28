import { setIcon } from "obsidian";
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
	const addButton = createAddButton(container, "Add property");
	addButton.addEventListener("click", () => {
		openAddForm(container, addButton, (form, dismiss) => {
			const input = form.createEl("input", {
				cls: "nfp-input",
				type: "text",
				attr: { placeholder: "Property name" },
			});
			const submit = (make: () => unknown) => {
				const key = input.value.trim();
				if (!key || key in node) {
					input.focus();
					return;
				}
				dismiss();
				commit(addObjectKey(rootValue, path, key, make()));
			};
			appendKindButtons(form, submit);
			input.addEventListener("keydown", (event) => {
				if (event.key === "Enter") {
					submit(() => "");
				} else if (event.key === "Escape") {
					dismiss();
				}
			});
			input.focus();
		});
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
	const addButton = createAddButton(container, "Add item");
	addButton.addEventListener("click", () => {
		// Non-empty arrays keep growing in the shape of their last item; an
		// empty array offers a choice of what its items should be.
		if (node.length > 0) {
			commit(addArrayItem(rootValue, path, blankLike(node[node.length - 1])));
			return;
		}
		openAddForm(container, addButton, (form, dismiss) => {
			appendKindButtons(form, (make) => {
				dismiss();
				commit(addArrayItem(rootValue, path, make()));
			});
			const first = form.querySelector("button");
			if (first instanceof HTMLElement) {
				first.focus();
			}
		});
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

// The kinds of empty value a new property or item can start as; picking
// object or list is how deeper nesting levels get created.
const EMPTY_KINDS: { icon: string; label: string; make: () => unknown }[] = [
	{ icon: "lucide-text", label: "Add text", make: () => "" },
	{ icon: "lucide-braces", label: "Add object", make: () => ({}) },
	{ icon: "lucide-list-tree", label: "Add list", make: () => [] },
];

// Swap the add button for an inline form; dismissed on Escape or when focus
// leaves the form (focusout with an outside relatedTarget, so moving between
// the form's own controls doesn't cancel it).
function openAddForm(
	container: HTMLElement,
	addButton: HTMLElement,
	build: (form: HTMLElement, dismiss: () => void) => void
): void {
	addButton.addClass("nfp-hidden");
	const form = container.createDiv({ cls: "nfp-add-form" });
	const dismiss = () => {
		form.remove();
		addButton.removeClass("nfp-hidden");
	};
	form.addEventListener("focusout", (event) => {
		const next = event.relatedTarget;
		if (!(next instanceof Node) || !form.contains(next)) {
			dismiss();
		}
	});
	form.addEventListener("keydown", (event) => {
		if (event.key === "Escape") {
			dismiss();
		}
	});
	build(form, dismiss);
}

function appendKindButtons(
	form: HTMLElement,
	submit: (make: () => unknown) => void
): void {
	for (const kind of EMPTY_KINDS) {
		const button = form.createEl("button", {
			cls: "clickable-icon nfp-kind-btn",
			attr: { "aria-label": kind.label },
		});
		setIcon(button, kind.icon);
		button.addEventListener("click", () => {
			submit(kind.make);
		});
	}
}

// Native "+ Add property" markup so the buttons inherit Obsidian's own
// default and hover styling in every theme.
function createAddButton(container: HTMLElement, label: string): HTMLElement {
	const button = container.createDiv({ cls: "metadata-add-button text-icon-button nfp-add" });
	setIcon(button.createSpan({ cls: "text-button-icon" }), "lucide-plus");
	button.createSpan({ cls: "text-button-label", text: label });
	return button;
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
