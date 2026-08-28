import js from "@eslint/js";
import tseslint from "typescript-eslint";
import obsidianmd from "eslint-plugin-obsidianmd";

export default tseslint.config(
	js.configs.recommended,
	...tseslint.configs.recommended,
	...obsidianmd.configs.recommended,
	{
		files: ["src/**/*.ts"],
		languageOptions: {
			parserOptions: {
				projectService: true,
				tsconfigRootDir: import.meta.dirname,
			},
		},
		rules: {
			"@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
			"no-undef": "off",
		},
	},
	{
		ignores: ["main.js", "node_modules/"],
	}
);
