import { setIcon } from "obsidian";
import { isPlainObject } from "./detect";
import {
	addArrayItem,
	addObjectKey,
	blankLike,
	cloneValue,
	getAtPath,
	removeAtPath,
	setAtPath,
	type Leaf,
	type Path,
} from "./edit-ops";

export type CommitFn = (value: unknown) => void;

// Handlers must read and write through these, never through render-time
// snapshots: Obsidian does not re-render a property widget after every
// change, so a snapshot can be stale by the time a handler runs.
interface TreeOps {
	current(): unknown;
	scalar(next: unknown): void;
	structural(next: unknown): void;
}

// Renders one nested property value as an editable tree. All persistence goes
// through `commit`, which receives the full updated top-level value. The
// widget owns a mutable model and redraws itself after structural changes
// (add/remove) rather than relying on Obsidian re-rendering.
export function renderNestedValue(root: HTMLElement, value: unknown, commit: CommitFn): void {
	let model = cloneValue(value);
	const draw = () => {
		root.empty();
		root.addClass("nfp-root");
		renderNode(root, model, [], ops);
	};
	const ops: TreeOps = {
		current: () => model,
		scalar: (next) => {
			model = next;
			commit(model);
		},
		structural: (next) => {
			model = next;
			commit(model);
			draw();
		},
	};
	draw();
}

function renderNode(el: HTMLElement, node: unknown, path: Path, ops: TreeOps): void {
	if (Array.isArray(node)) {
		renderArray(el, node, path, ops);
	} else if (isPlainObject(node)) {
		renderObject(el, node, path, ops);
	} else {
		renderLeaf(el, node as Leaf, path, ops);
	}
}

function renderObject(
	el: HTMLElement,
	node: Record<string, unknown>,
	path: Path,
	ops: TreeOps
): void {
	const container = el.createDiv({ cls: "nfp-object" });
	for (const [key, value] of Object.entries(node)) {
		const row = container.createDiv({ cls: "nfp-row" });
		row.createSpan({ cls: "nfp-key", text: key });
		const valueEl = row.createDiv({ cls: "nfp-value" });
		renderNode(valueEl, value, [...path, key], ops);
		addRemoveButton(row, [...path, key], ops);
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
				const target = getAtPath(ops.current(), path);
				if (!key || (isPlainObject(target) && key in target)) {
					input.focus();
					return;
				}
				dismiss();
				ops.structural(addObjectKey(ops.current(), path, key, make()));
			};
			appendKindButtons(form, submit);
			input.addEventListener("keydown", (event) => {
				if (event.key === "Enter") {
					event.preventDefault();
					event.stopPropagation();
					submit(() => "");
				}
			});
			input.focus();
		});
	});
}

function renderArray(el: HTMLElement, node: unknown[], path: Path, ops: TreeOps): void {
	const container = el.createDiv({ cls: "nfp-array" });
	node.forEach((item, index) => {
		const itemEl = container.createDiv({ cls: "nfp-array-item" });
		const body = itemEl.createDiv({ cls: "nfp-array-item-body" });
		renderNode(body, item, [...path, index], ops);
		addRemoveButton(itemEl, [...path, index], ops);
	});
	const addButton = createAddButton(container, "Add item");
	addButton.addEventListener("click", () => {
		// Non-empty arrays keep growing in the shape of their last item; an
		// empty array offers a choice of what its items should be.
		const target = getAtPath(ops.current(), path);
		const items = Array.isArray(target) ? target : [];
		if (items.length > 0) {
			ops.structural(addArrayItem(ops.current(), path, blankLike(items[items.length - 1])));
			return;
		}
		openAddForm(container, addButton, (form, dismiss) => {
			appendKindButtons(form, (make) => {
				dismiss();
				ops.structural(addArrayItem(ops.current(), path, make()));
			});
			const first = form.querySelector("button");
			if (first instanceof HTMLElement) {
				first.focus();
			}
		});
	});
}

function renderLeaf(el: HTMLElement, value: Leaf, path: Path, ops: TreeOps): void {
	if (typeof value === "boolean") {
		const input = el.createEl("input", { cls: "nfp-input", type: "checkbox" });
		input.checked = value;
		input.addEventListener("change", () => {
			ops.scalar(setAtPath(ops.current(), path, input.checked));
		});
		return;
	}

	const isNumber = typeof value === "number";
	const input = el.createEl("input", {
		cls: "nfp-input",
		type: isNumber ? "number" : "text",
	});
	// Tracks the last committed value so repeated blurs don't re-commit and
	// Escape reverts to what's actually stored.
	let committed: Leaf = value;
	input.value = value === null || value === undefined ? "" : String(value);

	const commitInput = () => {
		// A structural redraw can detach this input before its blur runs;
		// the path may no longer exist, so drop the stale event.
		if (!input.isConnected) {
			return;
		}
		const raw = input.value;
		const parsed: Leaf =
			isNumber && raw !== "" && !Number.isNaN(Number(raw)) ? Number(raw) : raw;
		if (parsed !== committed) {
			committed = parsed;
			ops.scalar(setAtPath(ops.current(), path, parsed));
		}
	};

	input.addEventListener("blur", commitInput);
	// Handled keys must not reach Obsidian's own metadata-editor handlers.
	input.addEventListener("keydown", (event) => {
		if (event.key === "Enter") {
			event.preventDefault();
			event.stopPropagation();
			input.blur();
		} else if (event.key === "Escape") {
			event.preventDefault();
			event.stopPropagation();
			input.value = committed === null || committed === undefined ? "" : String(committed);
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
			event.preventDefault();
			event.stopPropagation();
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

function addRemoveButton(row: HTMLElement, path: Path, ops: TreeOps): void {
	const button = row.createEl("button", {
		cls: "nfp-remove",
		attr: { "aria-label": "Remove" },
		text: "×",
	});
	// Keep a focused input from blurring (and committing) mid-click; the
	// blur/re-render race otherwise swallows the click entirely.
	button.addEventListener("mousedown", (event) => {
		event.preventDefault();
	});
	button.addEventListener("click", () => {
		ops.structural(removeAtPath(ops.current(), path));
	});
}
