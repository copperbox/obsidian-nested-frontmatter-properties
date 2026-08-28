# Plan: Nested Frontmatter Properties (view + edit, zero risk flags)

## Goal
Render **and edit** nested YAML frontmatter values — arrays of objects and nested
objects — as native-looking rows in Obsidian's Properties panel, replacing the
"unsupported type" warning. Built so the community store's automated bundle scan
raises **zero risk flags**.

## Why not Nested Properties (mnaoumov)
The existing plugin covers this feature but its shipped 278 KB bundle (verified by
downloading the latest release `main.js`) contains flag-worthy surface inherited from
its bundled `obsidian-dev-utils` framework — none of it needed for the feature:
- `window.electron.ipcRenderer.sendSync("vault-open", ...)` — Electron IPC beyond the
  renderer sandbox (a vault-open/install helper in the framework)
- `eval(` ×2, `require("fs")`, `node:fs`, `process.env` ×6
- `navigator.clipboard` ×3, `localStorage`

Our plugin ships only purpose-built code, so every one of those disappears by
construction.

## Hard constraints (the "zero flags" contract)
Enforced by a CI step that greps the built bundle and fails on any forbidden token:
- No Electron/Node: no `electron`, `ipcRenderer`, `require("fs")`, `child_process`,
  `process.env`. Mobile-compatible, `isDesktopOnly: false`.
- No dynamic code: no `eval`, no `new Function`.
- No network: no `fetch`/`XMLHttpRequest`/`WebSocket`. No telemetry.
- No `innerHTML`/`outerHTML`/`insertAdjacentHTML` — DOM helpers only.
- No `localStorage`, no clipboard access (no copy feature in v1).
- No bundled YAML library — parsing and serialization stay inside Obsidian's own
  public APIs (see below), so we can't introduce YAML-parser CVEs.
- Runtime dependencies: only `monkey-around` (~1 KB, auditable in one screen).
  Everything else is dev-only (`obsidian`, `obsidian-typings`, `esbuild`, `typescript`).

## Architecture

### Rendering (unavoidably uses one undocumented API, but sandbox-equivalent)
There is no public API for custom property widgets. The accepted store pattern:
1. Register one widget in `app.metadataTypeManager.registeredTypeWidgets`
   (key e.g. `nested`) whose `render(el, value, ctx)` draws the tree.
2. Wrap `metadataTypeManager.getTypeInfo` with `monkey-around` so values that would
   fall through to the "unsupported" widget — plain objects, or arrays containing
   objects — resolve to our widget. All supported native types pass through untouched.
3. `onunload`: uninstall the wrap, delete the registry entry, trigger a metadata
   refresh so open notes revert to stock rendering.

Note the distinction we make in the README: this is *plain JavaScript against
Obsidian's internal in-renderer objects* — the same privilege level as any plugin
code. It grants no access beyond the sandbox, unlike Electron IPC. Every access is
feature-detected; if Obsidian changes the internals, the plugin degrades to doing
nothing and users see the stock warning.

### Reading values
From `app.metadataCache.getFileCache(file).frontmatter` — already parsed by Obsidian.
No YAML parsing in our code.

### Editing (public API only — this is the key risk win)
All writes go exclusively through `app.fileManager.processFrontMatter(file, fm => ...)`:
- Obsidian handles YAML serialization, atomicity, and preserving unrelated keys.
- Our edit logic is a pure function: `(frontmatter, path, operation) => mutated fm`
  where path is e.g. `["authors", 1, "name"]` and operation is set / add-item /
  remove-item / rename-key. Pure + unit-testable, no app access.

Edit interactions in the widget (kept native-feeling, all standard DOM):
- Leaf scalars render as text inputs styled like native property values; commit on
  Enter/blur, `Esc` reverts. Booleans render as checkboxes, numbers as number inputs
  (type inferred from current value; no type-change UI in v1).
- Per-row hover controls: remove entry; per-object/array footer: add key / add item.
- No context menus, no vault-wide rename, no drag-reorder in v1 — that's where the
  other plugin's complexity lives.

### Refresh loop
After `processFrontMatter` resolves, Obsidian's metadata cache fires `changed` and the
properties panel re-renders through our widget — no manual DOM syncing. Guard against
re-render clobbering an in-progress input (skip refresh while an input is focused).

## Repository layout
```
manifest.json, versions.json
src/main.ts        plugin class: patch install/uninstall, widget registration
src/widget.ts      render(): value tree -> DOM rows + input wiring
src/edit-ops.ts    pure frontmatter mutation functions (unit-tested)
src/detect.ts      isNestedValue(): decides which values we claim
styles.css         Obsidian CSS variables only, no inline styles
esbuild.config.mjs, tsconfig.json, package.json
scripts/check-bundle.mjs   CI grep of built main.js for forbidden tokens
.github/workflows/{ci,release}.yml
README.md, LICENSE (MIT)
```
Estimated shipped size: ~700–900 LOC / <20 KB bundle (vs 278 KB).

## Rendering/editing rules
- Array of objects → sub-row per element, object keys as indented native-style rows.
- Nested objects recurse; depth cap (5) then read-only YAML text fallback.
- `null`/empty values render as empty editable inputs.
- Mixed arrays Obsidian already handles are left alone; we only claim values the
  stock UI marks unsupported.
- Plugin disabled → stock behavior restored exactly.

## Review-guideline checklist
- All registrations/patches undone in `onunload` via `this.register()`.
- `this.app`, never global `app`; `async/await`; `const`; sentence-case UI text.
- No settings tab (nothing to configure), no default hotkeys, no status bar.
- README declares the one undocumented API used, why there is no public alternative,
  and the fail-safe behavior — plus the zero-flags CI check as a trust signal.
- Manifest naming rules (no "Obsidian" in name), accurate `minAppVersion`
  (test against current stable; Nested Properties targets 1.13.7).

## Test plan
- Unit: `edit-ops.ts` (all mutation ops, path edge cases) and `detect.ts`.
- Manual matrix: array-of-objects CRUD, deep nesting, empty object/array, nulls,
  unicode keys, keys needing YAML quoting, undo (Ctrl+Z in source mode) coherence,
  supported types untouched, disable/re-enable, light/dark themes, mobile emulation.
- CI: typecheck, unit tests, bundle-token check on every push.

## Implementation steps
1. Scaffold (esbuild, tsconfig, manifest); wire the bundle-token CI check first.
2. `edit-ops.ts` + `detect.ts` with unit tests (pure, no Obsidian needed).
3. Read-only widget + `getTypeInfo` patch; verify rendering in a test vault.
4. Add edit wiring through `processFrontMatter`; focus-guarded refresh.
5. `styles.css`; theme/mobile verification; screenshots.
6. README, release workflow, community-plugin PR.
