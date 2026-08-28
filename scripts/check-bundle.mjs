// Fails the build if the shipped bundle contains any token associated with
// elevated access or risk flags on the community plugin store. This keeps the
// "zero flags" guarantee enforced rather than aspirational.
import { readFileSync } from "node:fs";

const bundle = readFileSync(new URL("../main.js", import.meta.url), "utf8");

const forbidden = [
	"ipcRenderer",
	"child_process",
	"require(\"fs\")",
	"require('fs')",
	"node:fs",
	"process.env",
	"eval(",
	"new Function",
	"innerHTML",
	"outerHTML",
	"insertAdjacentHTML",
	"fetch(",
	"XMLHttpRequest",
	"WebSocket",
	"localStorage",
	"navigator.clipboard",
];

// "electron" is checked separately: esbuild marks it external, so the only
// acceptable occurrence would be an import we never make.
forbidden.push("require(\"electron\")", "require('electron')");

const found = forbidden.filter((token) => bundle.includes(token));

if (found.length > 0) {
	console.error(`Forbidden tokens in main.js: ${found.join(", ")}`);
	process.exit(1);
}

console.log(`check-bundle: main.js clean (${bundle.length} bytes)`);
