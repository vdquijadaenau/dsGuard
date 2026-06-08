// generate.mjs — DS-Guard per-system plugin generator (engine, generic)
//
// Loads and validates a design-system definition (design/rules.json + DTCG token
// files under design/tokens/), resolves the permitted sets, fills the engine
// templates, and writes a self-contained per-system plugin. All-or-nothing: on
// any validation or resolution error nothing is written.
//
// Zero design-system-specific values live here (Constitution Principle I); all
// content is sourced from the definition at generation time.

import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
  copyFileSync,
} from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { validateDefinition } from "./validate-definition.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const TEMPLATES_DIR = join(__dirname, "..", "templates");
const CHECKER_SRC = join(__dirname, "checker.mjs");

// ---------------------------------------------------------------------------
// DTCG token resolution
// ---------------------------------------------------------------------------

/**
 * Flatten DTCG token files into a map of dotted token name → { value, type }.
 *
 * `$type` is inherited from the nearest ancestor group. Keys beginning with `$`
 * are treated as metadata and never descended into as groups.
 *
 * @param {Array<{ file: string, data: object }>} tokenFiles
 * @returns {Map<string, { value: string|number, type: string|undefined }>}
 */
function flattenTokens(tokenFiles) {
  /** @type {Map<string, { value: string|number, type: string|undefined }>} */
  const map = new Map();

  const walk = (node, pathParts, inheritedType) => {
    if (node === null || typeof node !== "object" || Array.isArray(node)) return;

    const groupType = typeof node.$type === "string" ? node.$type : inheritedType;

    if (Object.prototype.hasOwnProperty.call(node, "$value")) {
      const name = pathParts.join(".");
      map.set(name, { value: node.$value, type: groupType });
      return;
    }

    for (const key of Object.keys(node)) {
      if (key.startsWith("$")) continue;
      walk(node[key], [...pathParts, key], groupType);
    }
  };

  for (const { data } of tokenFiles) {
    walk(data, [], undefined);
  }

  return map;
}

/**
 * Resolve a token value, following `{dotted.name}` alias references transitively.
 *
 * @param {string|number} value
 * @param {Map<string, { value: string|number }>} map
 * @param {number} [depth]
 * @returns {string|number}
 */
function resolveAlias(value, map, depth = 0) {
  if (typeof value !== "string" || depth > 16) return value;
  const m = /^\{(.+)\}$/.exec(value.trim());
  if (!m) return value;
  const ref = map.get(m[1]);
  if (!ref) return value; // unresolved alias — keep literal
  return resolveAlias(ref.value, map, depth + 1);
}

/**
 * Top group name (first dotted segment) of a token path.
 * @param {string} name
 * @returns {string}
 */
function topGroup(name) {
  const i = name.indexOf(".");
  return i === -1 ? name : name.slice(0, i);
}

/** Sorted, de-duplicated copy of a string array. */
function uniqSorted(values) {
  return [...new Set(values.map(String))].sort();
}

/**
 * Resolve a rules.json "allowed" token-name list into the union of the names
 * themselves plus any resolved token values (data-model.md #4).
 *
 * @param {string[]} names
 * @param {Map<string, { value: string|number }>} map
 * @returns {string[]}
 */
function resolveAllowed(names, map) {
  const out = [];
  for (const name of names) {
    out.push(name);
    const ref = map.get(name);
    if (ref) out.push(String(resolveAlias(ref.value, map)));
  }
  return uniqSorted(out);
}

/**
 * Resolve the full CheckerConfig permitted-set object from a validated rules
 * document and the flattened token map.
 *
 * @param {object} rules
 * @param {Map<string, { value: string|number, type: string|undefined }>} tokenMap
 * @returns {object} CheckerConfig fields (without timestamp/system metadata)
 */
export function resolvePermittedSets(rules, tokenMap) {
  const colors = [];
  const typeScale = [];
  const spacing = [];

  for (const [name, info] of tokenMap) {
    if (info.type === "color") {
      colors.push(String(resolveAlias(info.value, tokenMap)));
    } else if (info.type === "dimension") {
      const group = topGroup(name).toLowerCase();
      const resolved = String(resolveAlias(info.value, tokenMap));
      if (/^(font|type|text)/.test(group)) typeScale.push(resolved);
      else if (/^spac/.test(group)) spacing.push(resolved);
    }
  }

  const shadows = rules.shadows;
  const approvedShadows =
    shadows && shadows.policy !== "none" && Array.isArray(shadows.allowed)
      ? resolveAllowed(shadows.allowed, tokenMap)
      : [];

  const approvedFonts = { ui: (rules.fonts && rules.fonts.ui) || "" };
  if (rules.fonts && rules.fonts.editorial) approvedFonts.editorial = rules.fonts.editorial;
  if (rules.fonts && Array.isArray(rules.fonts.editorialContexts)) {
    approvedFonts.editorialContexts = rules.fonts.editorialContexts;
  }

  const typePolicy = { scaleOnly: !!(rules.type && rules.type.scaleOnly) };
  if (rules.type && typeof rules.type.bodyMinPx === "number") {
    typePolicy.bodyMinPx = rules.type.bodyMinPx;
  }

  return {
    tokenSetComplete: !!rules.tokenSetComplete,
    // Every defined token's dotted name — used by the checker's tokenShape rule
    // to detect plausible-but-undefined token references (US9 / FR-012).
    approvedTokenNames: uniqSorted([...tokenMap.keys()]),
    approvedColors: uniqSorted(colors),
    approvedTypeScale: uniqSorted(typeScale),
    approvedSpacing: uniqSorted(spacing),
    approvedRadius: resolveAllowed((rules.radius && rules.radius.allowed) || [], tokenMap),
    approvedShadows,
    approvedElevation: resolveAllowed((rules.elevation && rules.elevation.allowed) || [], tokenMap),
    approvedMotion: resolveAllowed((rules.motion && rules.motion.allowed) || [], tokenMap),
    approvedFonts,
    bannedTextAlignments:
      rules.textAlign && Array.isArray(rules.textAlign.banned) ? rules.textAlign.banned : [],
    centerOnlyShort: !!(rules.textAlign && rules.textAlign.centerOnlyShort),
    casing: rules.casing || "none",
    typePolicy,
    arbitraryAllowlist: Array.isArray(rules.arbitraryAllowlist) ? rules.arbitraryAllowlist : [],
    freeformRules: rules.freeformRules || "",
  };
}

// ---------------------------------------------------------------------------
// Definition loading
// ---------------------------------------------------------------------------

/**
 * Load and validate a definition directory. Throws on any hard error so the
 * caller can guarantee all-or-nothing generation.
 *
 * @param {string} definitionDir  directory containing rules.json + tokens/
 * @returns {{ rules: object, tokenMap: Map<string, object> }}
 */
export function loadDefinition(definitionDir) {
  const rulesPath = join(definitionDir, "rules.json");
  if (!existsSync(rulesPath)) {
    throw new Error("[dsguard] No definition found. Run /dsguard:init first.");
  }

  let rules;
  try {
    rules = JSON.parse(readFileSync(rulesPath, "utf8"));
  } catch (err) {
    throw new Error(`[dsguard] Definition invalid — generation halted:\n  rules.json: invalid JSON — ${err.message}`);
  }

  const errors = validateDefinition(rules);
  if (errors.length > 0) {
    throw new Error(`[dsguard] Definition invalid — generation halted:\n  ${errors.join("\n  ")}`);
  }

  const tokensDir = join(definitionDir, "tokens");
  let tokenEntries = [];
  try {
    tokenEntries = readdirSync(tokensDir).filter((f) => f.toLowerCase().endsWith(".json"));
  } catch {
    tokenEntries = [];
  }
  if (tokenEntries.length === 0) {
    throw new Error("[dsguard] Definition invalid — generation halted:\n  tokens/: at least one DTCG token file is required");
  }

  const tokenFiles = [];
  for (const file of tokenEntries.sort()) {
    const full = join(tokensDir, file);
    try {
      tokenFiles.push({ file, data: JSON.parse(readFileSync(full, "utf8")) });
    } catch (err) {
      throw new Error(`[dsguard] Definition invalid — generation halted:\n  tokens/${file}: invalid JSON — ${err.message}`);
    }
  }

  return { rules, tokenMap: flattenTokens(tokenFiles) };
}

// ---------------------------------------------------------------------------
// Template filling
// ---------------------------------------------------------------------------

/** Replace every occurrence of `{{KEY}}` with its mapped value. */
function fillTemplate(template, values) {
  let out = template;
  for (const [key, value] of Object.entries(values)) {
    out = out.split(`{{${key}}}`).join(value);
  }
  return out;
}

/** Read a template file from the engine templates directory. */
function readTemplate(name) {
  return readFileSync(join(TEMPLATES_DIR, name), "utf8");
}

/**
 * Render the trigger keyword list (deterministic, US4 / T028).
 *
 * Keywords are derived from the definition so the guidance skill only triggers
 * on relevant UI work (data-model.md GuidanceSkill):
 *   - the system name + generic "design system"
 *   - one keyword per rule class present in rules.json
 *   - token-derived keywords: each token's top-level group (e.g. "color") and
 *     its leaf name (e.g. "teal") from the DTCG files
 *
 * Token-derived keywords are sorted for a stable, idempotent ordering.
 *
 * @param {object} rules
 * @param {Map<string, object>} [tokenMap]
 * @returns {string[]}
 */
function triggerKeywords(rules, tokenMap) {
  const kws = new Set([rules.name, "design system"]);
  const classMap = {
    casing: "casing",
    textAlign: "text-align",
    type: "typography",
    shadows: "shadow",
    radius: "radius",
    fonts: "font",
    elevation: "elevation",
    motion: "motion",
  };
  for (const [field, kw] of Object.entries(classMap)) {
    if (rules[field] !== undefined) kws.add(kw);
  }

  const tokenKws = new Set();
  if (tokenMap) {
    for (const name of tokenMap.keys()) {
      const parts = String(name).split(".");
      tokenKws.add(parts[0]); // group, e.g. "color"
      tokenKws.add(parts[parts.length - 1]); // leaf, e.g. "teal"
    }
  }
  for (const kw of [...tokenKws].sort()) kws.add(kw);

  return [...kws];
}

/**
 * One-line trigger summary derived from the definition (the only resident
 * context cost of the skill at rest — data-model.md / plan.md NFR).
 *
 * @param {string} name
 * @param {object} sets  resolved permitted sets
 * @returns {string}
 */
function triggerSummary(name, sets) {
  const parts = [
    `${sets.approvedColors.length} colours`,
    `${sets.approvedTypeScale.length} type sizes`,
    `${sets.casing} casing`,
  ];
  return `${name} design system: ${parts.join(", ")}; use approved tokens, not raw values.`;
}

/**
 * Render the Approved Vocabulary markdown block from resolved sets.
 * @param {object} sets
 * @returns {string}
 */
function renderVocabulary(sets) {
  const line = (label, arr) => `- **${label}**: ${arr.length ? arr.join(", ") : "_none_"}`;
  return [
    line("Colors", sets.approvedColors),
    line("Type scale", sets.approvedTypeScale),
    line("Spacing", sets.approvedSpacing),
    line("Radius", sets.approvedRadius),
    line("Shadows", sets.approvedShadows),
    line("Elevation", sets.approvedElevation),
    line("Motion", sets.approvedMotion),
    line("Fonts", [sets.approvedFonts.ui, sets.approvedFonts.editorial].filter(Boolean)),
  ].join("\n");
}

/**
 * Render the Enforceable Rules markdown block from resolved sets.
 * @param {object} sets
 * @returns {string}
 */
function renderEnforceableRules(sets) {
  const lines = [];
  lines.push(`- **Casing**: ${sets.casing}`);
  if (sets.bannedTextAlignments.length) {
    lines.push(`- **Banned text alignments**: ${sets.bannedTextAlignments.join(", ")}`);
  }
  lines.push(`- **Type scale only**: ${sets.typePolicy.scaleOnly ? "yes" : "no"}`);
  if (typeof sets.typePolicy.bodyMinPx === "number") {
    lines.push(`- **Minimum body size**: ${sets.typePolicy.bodyMinPx}px`);
  }
  lines.push(`- **Authoritative token set**: ${sets.tokenSetComplete ? "yes (undefined values are errors)" : "no (advisory)"}`);
  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Artifact rendering (pure — builds file contents in memory)
// ---------------------------------------------------------------------------

/**
 * Render all per-system plugin artifacts as in-memory strings. Pure; performs
 * no writes, so a render failure leaves the filesystem untouched.
 *
 * @param {object} rules
 * @param {Map<string, object>} tokenMap
 * @param {string} generatedAt  ISO-8601 timestamp
 * @returns {{ name: string, files: Record<string, string> }}
 */
export function renderArtifacts(rules, tokenMap, generatedAt) {
  const name = rules.name;
  const sets = resolvePermittedSets(rules, tokenMap);

  // checker-config.json — substitute, then normalize via JSON round-trip.
  const checkerFilled = fillTemplate(readTemplate("checker-config.json.tmpl"), {
    SYSTEM_NAME: name,
    SCHEMA_VERSION: rules.schemaVersion,
    GENERATED_AT: generatedAt,
    TOKEN_SET_COMPLETE: JSON.stringify(sets.tokenSetComplete),
    APPROVED_TOKEN_NAMES: JSON.stringify(sets.approvedTokenNames),
    APPROVED_COLORS: JSON.stringify(sets.approvedColors),
    APPROVED_TYPE_SCALE: JSON.stringify(sets.approvedTypeScale),
    APPROVED_SPACING: JSON.stringify(sets.approvedSpacing),
    APPROVED_RADIUS: JSON.stringify(sets.approvedRadius),
    APPROVED_SHADOWS: JSON.stringify(sets.approvedShadows),
    APPROVED_ELEVATION: JSON.stringify(sets.approvedElevation),
    APPROVED_MOTION: JSON.stringify(sets.approvedMotion),
    APPROVED_FONTS: JSON.stringify(sets.approvedFonts),
    BANNED_TEXT_ALIGNMENTS: JSON.stringify(sets.bannedTextAlignments),
    CENTER_ONLY_SHORT: JSON.stringify(sets.centerOnlyShort),
    CASING: sets.casing,
    TYPE_POLICY: JSON.stringify(sets.typePolicy),
    ARBITRARY_ALLOWLIST: JSON.stringify(sets.arbitraryAllowlist),
    FREEFORM_RULES: JSON.stringify(sets.freeformRules),
  });
  let checkerConfig;
  try {
    checkerConfig = JSON.stringify(JSON.parse(checkerFilled), null, 2) + "\n";
  } catch (err) {
    throw new Error(`[dsguard] Template error in checker-config.json.tmpl: ${err.message}`);
  }

  // guidance skill — plain markdown substitution.
  const skill = fillTemplate(readTemplate("guidance-skill.md.tmpl"), {
    SYSTEM_NAME: name,
    SCHEMA_VERSION: rules.schemaVersion,
    GENERATED_AT: generatedAt,
    TRIGGER_KEYWORDS: JSON.stringify(triggerKeywords(rules, tokenMap)),
    TRIGGER_SUMMARY: JSON.stringify(triggerSummary(name, sets)),
    APPROVED_VOCABULARY: renderVocabulary(sets),
    ENFORCEABLE_RULES: renderEnforceableRules(sets),
    FREEFORM_RULES: sets.freeformRules || "_None._",
  });

  // plugin manifest — substitute, then normalize.
  const manifestFilled = fillTemplate(readTemplate("plugin-manifest.json.tmpl"), {
    SYSTEM_NAME: name,
    VERSION: rules.schemaVersion,
    SCHEMA_VERSION: rules.schemaVersion,
    GENERATED_AT: generatedAt,
  });
  let manifest;
  try {
    manifest = JSON.stringify(JSON.parse(manifestFilled), null, 2) + "\n";
  } catch (err) {
    throw new Error(`[dsguard] Template error in plugin-manifest.json.tmpl: ${err.message}`);
  }

  // gate hook — plain markdown substitution (full hook is task T031).
  const gateHook = fillTemplate(readTemplate("gate-hook.md.tmpl"), {
    SYSTEM_NAME: name,
    SCHEMA_VERSION: rules.schemaVersion,
    GENERATED_AT: generatedAt,
  });

  return {
    name,
    files: {
      ".claude-plugin/plugin.json": manifest,
      [`skills/${name}-design-system.md`]: skill,
      "checker-config.json": checkerConfig,
      "hooks/ui-gate.md": gateHook,
    },
  };
}

// ---------------------------------------------------------------------------
// Generation (orchestration)
// ---------------------------------------------------------------------------

/**
 * Generate a self-contained per-system plugin from a definition directory.
 *
 * All-or-nothing: validation and artifact rendering happen before any write, so
 * an invalid definition produces no output directory or files.
 *
 * @param {object} [options]
 * @param {string} [options.definitionDir]  default "./design"
 * @param {string} [options.outDir]         default "./<name>-design-system"
 * @param {Date}   [options.now]            injectable clock (for tests)
 * @returns {{ name: string, outDir: string, written: string[] }}
 */
export function generatePlugin(options = {}) {
  const { definitionDir = "design", now = new Date() } = options;
  const generatedAt = now.toISOString();

  const { rules, tokenMap } = loadDefinition(definitionDir);
  const { name, files } = renderArtifacts(rules, tokenMap, generatedAt);
  const outDir = options.outDir || `${name}-design-system`;

  // Render everything (above) before writing anything (below).
  const written = [];
  const writeFile = (relPath, contents) => {
    const target = join(outDir, relPath);
    try {
      mkdirSync(dirname(target), { recursive: true });
      writeFileSync(target, contents);
    } catch (err) {
      throw new Error(`[dsguard] Failed to write ${target}: ${err.message}`);
    }
    written.push(relPath);
  };

  for (const [relPath, contents] of Object.entries(files)) {
    writeFile(relPath, contents);
  }

  // Frozen copy of the generic checker (Constitution Principle VI).
  const checkerTarget = join(outDir, "scripts", "checker.mjs");
  try {
    mkdirSync(dirname(checkerTarget), { recursive: true });
    copyFileSync(CHECKER_SRC, checkerTarget);
  } catch (err) {
    throw new Error(`[dsguard] Failed to write ${checkerTarget}: ${err.message}`);
  }
  written.push("scripts/checker.mjs");

  return { name, outDir, written };
}

// ---------------------------------------------------------------------------
// CLI entry point
// ---------------------------------------------------------------------------

function parseArgs(argv) {
  const opts = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--out") opts.outDir = argv[++i];
  }
  return opts;
}

function main() {
  const opts = parseArgs(process.argv.slice(2));
  try {
    const { name, outDir } = generatePlugin(opts);
    process.stdout.write(
      `[dsguard] Generated ${name}-design-system/\n` +
        "  .claude-plugin/plugin.json\n" +
        `  skills/${name}-design-system.md\n` +
        "  scripts/checker.mjs\n" +
        "  checker-config.json\n" +
        "  hooks/ui-gate.md\n" +
        "\n" +
        `To test: claude --plugin-dir ./${name}-design-system\n` +
        `To distribute: copy the ${name}-design-system/ directory to consuming projects\n` +
        `  (output: ${relative(process.cwd(), outDir) || outDir})\n`
    );
  } catch (err) {
    process.stderr.write(`${err.message}\n`);
    process.exit(1);
  }
}

const isEntryPoint = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isEntryPoint) {
  main();
}
