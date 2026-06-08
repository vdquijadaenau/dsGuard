import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const NAME_PATTERN = /^[a-z][a-z0-9-]*$/;

/**
 * Serialize a value as 2-space-indented JSON with a trailing newline.
 *
 * @param {unknown} value - JSON-serializable value.
 * @returns {string} Formatted JSON document.
 */
function toJson(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

/**
 * Build the stub file contents for a definition with the given name.
 *
 * @param {string} name - Validated system name.
 * @returns {{ "tokens/primitives.json": string, "tokens/semantic.json": string, "rules.json": string }}
 */
function buildStubs(name) {
  const primitives = {
    $description: `Primitive (raw) design tokens for ${name}. Fill in real values.`,
    color: {
      brand: {
        $type: "color",
        example: { $value: "#000000" },
      },
    },
  };

  const semantic = {
    $description: `Semantic (alias) tokens for ${name}. Reference primitives via {color.brand.example}.`,
    color: {
      text: {
        primary: { $type: "color", $value: "{color.brand.example}" },
      },
    },
  };

  const rules = {
    name,
    schemaVersion: "1.0.0",
  };

  return {
    "tokens/primitives.json": toJson(primitives),
    "tokens/semantic.json": toJson(semantic),
    "rules.json": toJson(rules),
  };
}

/**
 * Scaffold an empty design-system definition directory (`design/`).
 *
 * Creates `design/tokens/primitives.json`, `design/tokens/semantic.json`,
 * `design/rules.json`, and an empty `design/references/` directory relative to
 * the target working directory.
 *
 * @param {string} name - System identifier; must match `^[a-z][a-z0-9-]*$`.
 * @param {{ cwd?: string, force?: boolean }} [options] - Scaffolding options.
 * @param {string} [options.cwd] - Target directory (defaults to `process.cwd()`).
 * @param {boolean} [options.force] - Overwrite an existing `design/` directory.
 * @returns {{ created: string[], root: string }} Created relative paths and the
 *   absolute path of the `design/` directory.
 * @throws {Error} If the name is missing/invalid, `design/` exists without
 *   force, or a file-system write fails.
 */
export function scaffoldDefinition(name, options = {}) {
  const { cwd = process.cwd(), force = false } = options;

  if (!name || typeof name !== "string" || name.trim() === "") {
    throw new Error("[dsguard] init requires a system name: /dsguard:init <name>");
  }

  if (!NAME_PATTERN.test(name)) {
    throw new Error(
      `[dsguard] invalid system name '${name}': must be lowercase, start with a letter, ` +
        "and use only letters, digits, and hyphens (e.g. acme, brand-alpha)"
    );
  }

  const designDir = join(cwd, "design");

  if (existsSync(designDir) && !force) {
    throw new Error("[dsguard] design/ already exists. Use --force to overwrite.");
  }

  const stubs = buildStubs(name);
  const created = [];

  /**
   * Make a directory recursively, surfacing a `[dsguard]` error on failure.
   *
   * @param {string} dir - Absolute directory path.
   */
  const makeDir = (dir) => {
    try {
      mkdirSync(dir, { recursive: true });
    } catch (err) {
      throw new Error(`[dsguard] Failed to create ${dir}: ${err.message}`);
    }
  };

  /**
   * Write a stub file, surfacing a `[dsguard]` error on failure.
   *
   * @param {string} relPath - Path relative to the `design/` directory.
   * @param {string} contents - File contents.
   */
  const writeStub = (relPath, contents) => {
    const target = join(designDir, relPath);
    makeDir(dirname(target));
    try {
      writeFileSync(target, contents);
    } catch (err) {
      throw new Error(`[dsguard] Failed to create ${target}: ${err.message}`);
    }
    created.push(relative(cwd, target));
  };

  makeDir(designDir);

  writeStub("tokens/primitives.json", stubs["tokens/primitives.json"]);
  writeStub("tokens/semantic.json", stubs["tokens/semantic.json"]);
  writeStub("rules.json", stubs["rules.json"]);

  const referencesDir = join(designDir, "references");
  makeDir(referencesDir);
  created.push(relative(cwd, referencesDir));

  return { created, root: designDir };
}

/**
 * CLI entry point: read the name from argv, scaffold, and report.
 *
 * @returns {void}
 */
function main() {
  const args = process.argv.slice(2);
  const force = args.includes("--force");
  const name = args.find((arg) => !arg.startsWith("--"));

  try {
    scaffoldDefinition(name, { force });
    process.stdout.write(
      `[dsguard] Scaffolded definition for '${name}'\n` +
        "  design/tokens/primitives.json\n" +
        "  design/tokens/semantic.json\n" +
        "  design/rules.json\n" +
        "  design/references/\n" +
        "\n" +
        "Next: fill in your tokens and rules, then run /dsguard:generate\n"
    );
  } catch (err) {
    process.stderr.write(`${err.message}\n`);
    process.exit(1);
  }
}

const isEntryPoint =
  process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];

if (isEntryPoint) {
  main();
}
