import type { App, EventRef } from "obsidian";

// Narrow, hand-written types for the undocumented surface this plugin touches,
// matched against Obsidian 1.13 behavior. Obsidian has no public API for
// property widgets, so every access to these members is feature-detected at
// runtime; if a member is missing the plugin deactivates itself and Obsidian's
// stock rendering is unaffected.

export interface PropertyRenderContext {
	app?: App;
	key?: string;
	sourcePath?: string;
	blur?(): void;
	onChange?(value: unknown): void;
}

export interface PropertyWidgetComponent {
	focus(): void;
	type?: string;
}

export interface PropertyTypeWidget {
	type: string;
	icon: string;
	name(): string;
	default?(): unknown;
	validate(value: unknown): boolean;
	render(
		el: HTMLElement,
		value: unknown,
		ctx: PropertyRenderContext
	): PropertyWidgetComponent;
}

export interface PropertyTypeInfo {
	inferred: PropertyTypeWidget;
	expected?: PropertyTypeWidget;
}

export interface MetadataTypeManager {
	registeredTypeWidgets: Record<string, PropertyTypeWidget>;
	getTypeInfo(key: string, value: unknown): PropertyTypeInfo;
	setType?(key: string, type: string): void | Promise<void>;
	getAssignedType?(key: string): string | null;
}

export interface AppWithInternals extends App {
	metadataTypeManager?: MetadataTypeManager;
}

// The properties panel of an open markdown view. serialize()/synchronize() is
// how Obsidian itself refreshes the panel; used only on plugin load/unload so
// open notes pick up or drop our widget.
export interface MetadataEditorLike {
	serialize(): unknown;
	synchronize(data: unknown): void;
}

export interface MarkdownViewWithMetadataEditor {
	metadataEditor?: MetadataEditorLike;
}

// The property icon menu ("Property type" submenu lives here). The
// file-property-menu workspace event and the menu item internals are
// undocumented; all access is feature-detected.
export interface MenuItemLike {
	setTitle(title: string): MenuItemLike;
	setIcon(icon: string): MenuItemLike;
	onClick(callback: () => void): MenuItemLike;
	setChecked?(checked: boolean): MenuItemLike;
	submenu?: MenuLike | null;
}

export interface MenuLike {
	items?: unknown[];
	addItem(callback: (item: MenuItemLike) => void): unknown;
}

export interface WorkspaceWithPropertyMenu {
	on(
		name: "file-property-menu",
		callback: (menu: MenuLike, property: string) => void
	): EventRef;
}
