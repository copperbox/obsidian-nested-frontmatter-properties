import type { App, Component } from "obsidian";

// Narrow, hand-written types for the undocumented surface this plugin touches.
// Obsidian has no public API for property widgets, so every access to these
// members is feature-detected at runtime; if a member is missing the plugin
// deactivates itself and Obsidian's stock rendering is unaffected.

export interface PropertyEntryData {
	key: string;
	type?: string;
	value: unknown;
}

export interface PropertyRenderContext {
	app?: App;
	key?: string;
	sourcePath?: string;
	onChange?: (value: unknown) => void;
}

export interface PropertyTypeWidget {
	type: string;
	icon: string;
	name(): string;
	default(): unknown;
	validate(value: unknown): boolean;
	render(
		el: HTMLElement,
		data: PropertyEntryData,
		ctx: PropertyRenderContext
	): Component | void;
}

export interface PropertyTypeInfo {
	inferred?: PropertyTypeWidget;
	expected?: PropertyTypeWidget;
}

export interface MetadataTypeManager {
	registeredTypeWidgets: Record<string, PropertyTypeWidget>;
	getTypeInfo(entry: PropertyEntryData): PropertyTypeInfo;
	trigger?(name: string, ...args: unknown[]): void;
}

export interface AppWithInternals extends App {
	metadataTypeManager?: MetadataTypeManager;
}
