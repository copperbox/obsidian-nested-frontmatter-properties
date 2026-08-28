import { Plugin } from "obsidian";
import { around } from "monkey-around";
import { isNestedValue } from "./detect";
import { renderNestedValue } from "./widget";
import type {
	AppWithInternals,
	MetadataTypeManager,
	PropertyEntryData,
	PropertyRenderContext,
	PropertyTypeInfo,
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

		manager.registeredTypeWidgets[WIDGET_TYPE] = {
			type: WIDGET_TYPE,
			icon: "lucide-braces",
			name: () => "Nested",
			default: () => ({}),
			validate: (value: unknown) => isNestedValue(value),
			render: (el, data, ctx) => {
				this.renderWidget(el, data, ctx);
			},
		};
		this.register(() => {
			delete manager.registeredTypeWidgets[WIDGET_TYPE];
		});

		const widget = manager.registeredTypeWidgets[WIDGET_TYPE];
		this.register(
			around(manager as MetadataTypeManager & Record<string, unknown>, {
				getTypeInfo: (next: MetadataTypeManager["getTypeInfo"]) =>
					function (this: MetadataTypeManager, entry: PropertyEntryData): PropertyTypeInfo {
						const info = next.call(this, entry);
						// Claim only values the stock UI cannot render, and only
						// when the user has not assigned an explicit type.
						if (widget && entry && isNestedValue(entry.value) && !entry.type) {
							return { ...info, inferred: widget };
						}
						return info;
					},
			})
		);

		this.refreshPropertyPanels(manager);
		this.register(() => {
			this.refreshPropertyPanels(manager);
		});
	}

	private renderWidget(
		el: HTMLElement,
		data: PropertyEntryData,
		ctx: PropertyRenderContext
	): void {
		renderNestedValue(el, data.value, (value) => {
			this.commit(data.key, value, ctx);
		});
	}

	private commit(key: string, value: unknown, ctx: PropertyRenderContext): void {
		// Prefer the metadata editor's own change pipeline when present; fall
		// back to the public frontmatter API on the active file.
		if (typeof ctx.onChange === "function") {
			ctx.onChange(value);
			return;
		}
		const file = this.app.workspace.getActiveFile();
		if (file) {
			void this.app.fileManager.processFrontMatter(file, (frontmatter: Record<string, unknown>) => {
				frontmatter[key] = value;
			});
		}
	}

	private refreshPropertyPanels(manager: MetadataTypeManager): void {
		if (typeof manager.trigger === "function") {
			manager.trigger("changed");
		}
	}
}
