import { MarkdownView, Plugin } from "obsidian";
import { around } from "monkey-around";
import { isNestedValue } from "./detect";
import { renderNestedValue } from "./widget";
import type {
	AppWithInternals,
	MarkdownViewWithMetadataEditor,
	MetadataTypeManager,
	PropertyRenderContext,
	PropertyTypeInfo,
	PropertyTypeWidget,
} from "./internal-types";

export const WIDGET_TYPE = "nested-frontmatter";

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

		const widget: PropertyTypeWidget = {
			type: WIDGET_TYPE,
			icon: "lucide-braces",
			name: () => "Nested",
			validate: (value: unknown) => isNestedValue(value),
			render: (el, value, ctx) => {
				renderNestedValue(el, value, (newValue) => {
					this.commit(newValue, ctx);
				});
				return {
					focus: () => {
						el.focus();
					},
					type: WIDGET_TYPE,
				};
			},
		};

		manager.registeredTypeWidgets[WIDGET_TYPE] = widget;
		this.register(() => {
			delete manager.registeredTypeWidgets[WIDGET_TYPE];
		});

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
							return { ...info, inferred: widget, expected: widget };
						}
						return info;
					},
			})
		);

		this.reloadPropertyPanels();
		this.register(() => {
			this.reloadPropertyPanels();
		});
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
	// or drop (on unload) the nested widget, the same way Obsidian refreshes
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
