import { MarkdownView, Plugin } from "obsidian";
import { around } from "monkey-around";
import { isNestedValue, isPlainObject } from "./detect";
import { renderNestedValue } from "./widget";
import type {
	AppWithInternals,
	MarkdownViewWithMetadataEditor,
	MenuItemLike,
	MenuLike,
	MetadataTypeManager,
	PropertyRenderContext,
	PropertyTypeInfo,
	PropertyTypeWidget,
	WorkspaceWithPropertyMenu,
} from "./internal-types";

export const OBJECT_WIDGET_TYPE = "nested-frontmatter:object";
export const LIST_WIDGET_TYPE = "nested-frontmatter:list";

export default class NestedFrontmatterPropertiesPlugin extends Plugin {
	onload(): void {
		this.app.workspace.onLayoutReady(() => {
			this.install();
		});
	}

	private install(): void {
		const manager = (this.app as AppWithInternals).metadataTypeManager;
		// Obsidian has no public API for property widgets. Every internal member
		// is feature-detected: if the shape changed in an update, do nothing and
		// leave the stock "unsupported type" rendering in place.
		if (
			!manager ||
			typeof manager.getTypeInfo !== "function" ||
			typeof manager.registeredTypeWidgets !== "object" ||
			manager.registeredTypeWidgets === null
		) {
			return;
		}

		const objectWidget = this.createWidget({
			type: OBJECT_WIDGET_TYPE,
			icon: "lucide-braces",
			label: "Nested",
			emptyValue: () => ({}),
			accepts: (value) => isPlainObject(value),
		});
		const listWidget = this.createWidget({
			type: LIST_WIDGET_TYPE,
			icon: "lucide-list-tree",
			label: "Nested list",
			emptyValue: () => [],
			accepts: (value) => Array.isArray(value),
		});

		for (const widget of [objectWidget, listWidget]) {
			manager.registeredTypeWidgets[widget.type] = widget;
			this.register(() => {
				delete manager.registeredTypeWidgets[widget.type];
			});
		}

		this.register(
			around(manager as MetadataTypeManager & Record<string, unknown>, {
				getTypeInfo: (next: MetadataTypeManager["getTypeInfo"]) =>
					function (
						this: MetadataTypeManager,
						key: string,
						value: unknown
					): PropertyTypeInfo {
						const info = next.call(this, key, value);
						// Claim only values Obsidian itself infers as "unknown"
						// (the unsupported-type warning); explicit user-assigned
						// types already resolve before that inference.
						if (info?.inferred?.type === "unknown" && isNestedValue(value)) {
							const widget = Array.isArray(value) ? listWidget : objectWidget;
							return { ...info, inferred: widget, expected: widget };
						}
						return info;
					},
			})
		);

		this.installTypeMenu(manager, [objectWidget, listWidget]);

		this.reloadPropertyPanels();
		this.register(() => {
			this.reloadPropertyPanels();
		});
	}

	private createWidget(spec: {
		type: string;
		icon: string;
		label: string;
		emptyValue: () => unknown;
		accepts: (value: unknown) => boolean;
	}): PropertyTypeWidget {
		return {
			type: spec.type,
			icon: spec.icon,
			name: () => spec.label,
			default: spec.emptyValue,
			// Null/undefined is valid so a freshly assigned type renders the
			// empty editor instead of a type-mismatch warning.
			validate: (value: unknown) =>
				value === null || value === undefined || spec.accepts(value),
			render: (el, value, ctx) => {
				const usable = spec.accepts(value) ? value : spec.emptyValue();
				// Obsidian highlights the whole .metadata-property row on
				// :focus-within; tag our rows so styles.css can neutralize
				// that and leave focus feedback to the individual field.
				el.closest(".metadata-property")?.classList.add("nfp-property");
				renderNestedValue(el, usable, (newValue) => {
					this.commit(newValue, ctx);
				});
				return {
					focus: () => {
						el.focus();
					},
					type: spec.type,
				};
			},
		};
	}

	// The native "Property type" submenu is built from a fixed list, so our
	// types must be appended when the property icon menu opens.
	private installTypeMenu(
		manager: MetadataTypeManager,
		widgets: PropertyTypeWidget[]
	): void {
		if (typeof manager.setType !== "function") {
			return;
		}
		const workspace = this.app.workspace as unknown as WorkspaceWithPropertyMenu;
		this.registerEvent(
			workspace.on("file-property-menu", (menu: MenuLike, property: string) => {
				const items = Array.isArray(menu.items) ? menu.items : [];
				const typeItem = items.find(
					(item): item is MenuItemLike =>
						typeof item === "object" &&
						item !== null &&
						typeof (item as MenuItemLike).submenu === "object" &&
						(item as MenuItemLike).submenu !== null
				);
				const submenu = typeItem?.submenu;
				if (!submenu || typeof submenu.addItem !== "function") {
					return;
				}
				const assignedType =
					typeof manager.getAssignedType === "function"
						? manager.getAssignedType(property)
						: null;
				for (const widget of widgets) {
					submenu.addItem((item: MenuItemLike) => {
						item
							.setTitle(widget.name())
							.setIcon(widget.icon)
							.onClick(() => {
								void manager.setType?.(property, widget.type);
							});
						if (assignedType === widget.type) {
							item.setChecked?.(true);
						}
					});
				}
			})
		);
	}

	private commit(value: unknown, ctx: PropertyRenderContext): void {
		// The metadata editor's own change pipeline persists and re-renders;
		// fall back to the public frontmatter API on the source file.
		if (typeof ctx.onChange === "function") {
			ctx.onChange(value);
			return;
		}
		if (!ctx.sourcePath || !ctx.key) {
			return;
		}
		const key = ctx.key;
		const file = this.app.vault.getFileByPath(ctx.sourcePath);
		if (file) {
			void this.app.fileManager.processFrontMatter(file, (frontmatter: Record<string, unknown>) => {
				frontmatter[key] = value;
			});
		}
	}

	// Re-render the properties panel of open notes so they pick up (on load)
	// or drop (on unload) the nested widgets, the same way Obsidian refreshes
	// the panel itself.
	private reloadPropertyPanels(): void {
		for (const leaf of this.app.workspace.getLeavesOfType("markdown")) {
			if (!(leaf.view instanceof MarkdownView)) {
				continue;
			}
			const editor = (leaf.view as MarkdownView & MarkdownViewWithMetadataEditor)
				.metadataEditor;
			if (
				!editor ||
				typeof editor.serialize !== "function" ||
				typeof editor.synchronize !== "function"
			) {
				continue;
			}
			const data = editor.serialize();
			editor.synchronize({});
			editor.synchronize(data);
		}
	}
}
