// Test stand-in for the "obsidian" package, which ships types only and has
// no runtime entry outside the app. Aliased in vitest.config.ts.
export const setIcon = (): void => {};
export class Plugin {}
export class MarkdownView {}
