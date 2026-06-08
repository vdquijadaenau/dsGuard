// checker.mjs — DS-Guard config-driven static checker (engine, generic)
//
// SKELETON ONLY (tasks T007 + T038). No design-rule checks are implemented here yet;
// the real rule logic is added in T024. This module provides:
//   - config loading (checker-config.json)
//   - routing manifest loading + first-match file routing (ds-guard.config.json)
//   - source-file discovery
//   - the per-file scan loop with an (empty) rule-dispatch registry
//   - CheckResult / CheckReport production
//   - text + JSON output formatting
//   - a runnable CLI entry point
//
// Zero external dependencies: node: builtins only.

import fs from 'node:fs';
import path from 'node:path';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

// Source file extensions analysed by the checker. Mirrors command-check.md
// "Analysis Target". `.module.css` is matched via the `.css` suffix below, but
// we keep the explicit list for clarity / future use.
export const SOURCE_EXTENSIONS = ['.tsx', '.ts', '.jsx', '.js', '.css', '.scss'];

// Directories never descended into during discovery.
const SKIP_DIRS = new Set(['node_modules']);

// ---------------------------------------------------------------------------
// Config loading
// ---------------------------------------------------------------------------

/**
 * Load a checker-config.json (CheckerConfig, data-model.md #4) from a path.
 *
 * Returns the parsed config object, or `null` when the file does not exist or
 * cannot be read/parsed. Callers treat a `null` result as an exit-code-2
 * (configuration / I/O error) condition.
 *
 * @param {string} configPath
 * @returns {object | null}
 */
export function loadCheckerConfig(configPath) {
  if (!configPath) return null;
  try {
    const raw = fs.readFileSync(configPath, 'utf8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Routing manifest (multi-system) — T038
// ---------------------------------------------------------------------------

/**
 * Load a RoutingManifest (data-model.md #8) from a path.
 *
 * @param {string} manifestPath
 * @returns {{ schemaVersion: string, systems: Array<{name:string,pluginDir:string,patterns:string[]}> } | null}
 */
export function loadRoutingManifest(manifestPath) {
  if (!manifestPath) return null;
  try {
    const raw = fs.readFileSync(manifestPath, 'utf8');
    const parsed = JSON.parse(raw);
    if (!parsed || !Array.isArray(parsed.systems)) return null;
    return parsed;
  } catch {
    return null;
  }
}

/**
 * Normalize a path for glob matching: convert Windows backslashes to forward
 * slashes and strip a leading "./".
 *
 * @param {string} p
 * @returns {string}
 */
function normalizeForMatch(p) {
  return String(p).replace(/\\/g, '/').replace(/^\.\//, '');
}

/**
 * Minimal, dependency-free glob → RegExp converter.
 *
 * Supported syntax:
 *   - `**`  matches any number of path segments (including across `/`)
 *   - `*`   matches any run of characters except `/`
 *   - `?`   matches a single character except `/`
 *   - all other characters are matched literally
 *
 * @param {string} glob
 * @returns {RegExp}
 */
export function globToRegExp(glob) {
  const g = normalizeForMatch(glob);
  let re = '';
  for (let i = 0; i < g.length; i++) {
    const c = g[i];
    if (c === '*') {
      if (g[i + 1] === '*') {
        // `**` — consume the second star (and an optional trailing slash) and
        // match across path separators.
        i++;
        if (g[i + 1] === '/') i++;
        re += '.*';
      } else {
        // single `*` — anything but a path separator
        re += '[^/]*';
      }
    } else if (c === '?') {
      re += '[^/]';
    } else if ('\\^$.|+()[]{}'.includes(c)) {
      re += '\\' + c;
    } else {
      re += c;
    }
  }
  return new RegExp('^' + re + '$');
}

/**
 * Test whether a (normalized) file path matches a glob pattern.
 *
 * @param {string} filePath
 * @param {string} pattern
 * @returns {boolean}
 */
export function matchGlob(filePath, pattern) {
  return globToRegExp(pattern).test(normalizeForMatch(filePath));
}

/**
 * Resolve which system a file belongs to, per FR-001b first-match routing.
 *
 * Systems are tested in array order; within a system, patterns are tested in
 * array order; the first system with any matching pattern wins. A file that
 * matches no pattern in any system returns `null` (the caller skips it
 * silently — no error, no finding).
 *
 * @param {string} filePath
 * @param {{systems: Array<{name:string,pluginDir:string,patterns:string[]}>}|null} manifest
 * @returns {{name:string,pluginDir:string,patterns:string[]} | null}
 */
export function resolveSystemForFile(filePath, manifest) {
  if (!manifest || !Array.isArray(manifest.systems)) return null;
  const target = normalizeForMatch(filePath);
  for (const system of manifest.systems) {
    const patterns = Array.isArray(system.patterns) ? system.patterns : [];
    for (const pattern of patterns) {
      if (matchGlob(target, pattern)) return system;
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// File discovery
// ---------------------------------------------------------------------------

/**
 * Whether a file path has a source extension we analyse.
 * @param {string} filePath
 * @returns {boolean}
 */
function hasSourceExtension(filePath) {
  const lower = filePath.toLowerCase();
  // `.module.css` is covered by the `.css` suffix.
  return SOURCE_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

/**
 * Recursively discover source files under a target path (file OR directory).
 *
 * - Skips `node_modules` and dot-directories.
 * - Returns absolute-or-as-given paths (the path is used verbatim for the
 *   given file, and joined for directory descent).
 *
 * @param {string} targetPath
 * @returns {string[]}
 */
export function discoverSourceFiles(targetPath) {
  const results = [];

  let stat;
  try {
    stat = fs.statSync(targetPath);
  } catch {
    return results; // non-existent path → empty (caller handles exit code 2)
  }

  if (stat.isFile()) {
    if (hasSourceExtension(targetPath)) results.push(targetPath);
    return results;
  }

  const walk = (dir) => {
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const name = entry.name;
      const full = path.join(dir, name);
      if (entry.isDirectory()) {
        if (SKIP_DIRS.has(name) || name.startsWith('.')) continue;
        walk(full);
      } else if (entry.isFile()) {
        if (hasSourceExtension(full)) results.push(full);
      }
    }
  };

  walk(targetPath);
  return results;
}

// ---------------------------------------------------------------------------
// Rule helpers (T024)
// ---------------------------------------------------------------------------

/**
 * Case-insensitive membership test against a permitted set.
 * @param {string|number} value
 * @param {string[]|undefined} set
 * @returns {boolean}
 */
function inSet(value, set) {
  if (!Array.isArray(set) || set.length === 0) return false;
  const v = String(value).toLowerCase();
  return set.some((s) => String(s).toLowerCase() === v);
}

/**
 * Whether a value is explicitly permitted via the per-system arbitraryAllowlist.
 * @param {string} value
 * @param {object} config
 * @returns {boolean}
 */
function isArbitrary(value, config) {
  if (!config || !Array.isArray(config.arbitraryAllowlist)) return false;
  const v = String(value).toLowerCase();
  // Allow either an exact match or the value appearing inside an allowlisted
  // expression (e.g. a Tailwind arbitrary class "max-w-[72ch]").
  return config.arbitraryAllowlist.some((a) => {
    const al = String(a).toLowerCase();
    return al === v || al.includes(v);
  });
}

/**
 * Severity for a finding.
 *
 * Raw literals (a hex colour, a bare px value) are not token-shaped: when the
 * rule class carries an explicit allowlist they are always hard errors
 * (command-check.md "Finding Severity"). A token-shaped value that is merely
 * absent from the permitted set is advisory unless `tokenSetComplete` promotes
 * it to a hard error (FR-012 / US9).
 *
 * @param {boolean} tokenShaped
 * @param {object} config
 * @returns {"ERROR"|"warn"}
 */
function severityFor(tokenShaped, config) {
  if (!tokenShaped) return 'ERROR';
  return config && config.tokenSetComplete ? 'ERROR' : 'warn';
}

/**
 * Run a global regex over a line, yielding { value, index } for each match. The
 * capture group (or whole match when none) is returned as `value`.
 *
 * @param {RegExp} re  must carry the global flag
 * @param {string} lineText
 */
function* eachMatch(re, lineText) {
  re.lastIndex = 0;
  let m;
  while ((m = re.exec(lineText)) !== null) {
    yield { value: m[1] !== undefined ? m[1] : m[0], index: m.index };
    if (m.index === re.lastIndex) re.lastIndex++; // guard against zero-width
  }
}

// Raw colour literals: #rgb/#rrggbb(/aa) hex and rgb()/rgba()/hsl()/hsla().
const HEX_RE = /#[0-9a-fA-F]{3,8}\b/g;
const FUNC_COLOR_RE = /\b(?:rgba?|hsla?)\([^)]*\)/gi;
// Raw px values in a given CSS/JS property context.
const FONT_SIZE_RE = /font-?size\s*[:=]\s*['"]?\s*(\d+(?:\.\d+)?px)/gi;
const RADIUS_RE = /border-?radius\s*[:=]\s*['"]?\s*(\d+(?:\.\d+)?(?:px|rem|em|%)?)/gi;
const SPACING_RE =
  /\b(?:padding|margin|gap)(?:-?(?:top|right|bottom|left))?\s*[:=]\s*['"]?\s*(\d+(?:\.\d+)?px)/gi;
const BOX_SHADOW_RE = /box-?shadow\s*[:=]\s*['"]?\s*([^'";\n]+?)\s*['"]?\s*[,;}]/gi;
const TEXT_ALIGN_RE = /text-?align\s*[:=]\s*['"]?\s*([a-zA-Z]+)/gi;
const TEXT_TRANSFORM_RE = /text-?transform\s*[:=]\s*['"]?\s*(uppercase|lowercase|capitalize)/gi;
// A dotted token-style reference, e.g. "color.brand.coral". The first segment is
// later required to match a known token group, which narrows this to genuine
// token references and away from ordinary property access (`props.onClick`).
const TOKEN_PATH_RE = /\b([a-z][a-zA-Z0-9]*(?:\.[a-zA-Z][a-zA-Z0-9_-]*)+)\b/g;

// ---------------------------------------------------------------------------
// Rule dispatch registry (T024)
// ---------------------------------------------------------------------------

// Registry of rule-check functions keyed by ruleClass. Each entry has the
// signature (ctx) => CheckResult[] where ctx = { filePath, lineNumber, lineText,
// config }. Rules emit findings only for raw literal values; token references
// (JS identifiers / property access such as `colors['brand-teal']` or
// `radius.md`) are never literals and are therefore never flagged.
export const RULE_REGISTRY = {
  // Raw colour literals not in approvedColors.
  color: (ctx) => {
    const { config } = ctx;
    if (!config || !Array.isArray(config.approvedColors) || config.approvedColors.length === 0) {
      return [];
    }
    const findings = [];
    const emit = (value, index) => {
      if (inSet(value, config.approvedColors) || isArbitrary(value, config)) return;
      findings.push({
        file: ctx.filePath,
        line: ctx.lineNumber,
        column: index + 1,
        severity: severityFor(false, config),
        ruleClass: 'color',
        message: `Raw colour "${value}" is not an approved token.`,
        value,
      });
    };
    for (const { value, index } of eachMatch(HEX_RE, ctx.lineText)) emit(value, index);
    for (const { value, index } of eachMatch(FUNC_COLOR_RE, ctx.lineText)) emit(value, index);
    return findings;
  },

  // Raw px font sizes not on the approved type scale.
  typeScale: (ctx) => {
    const { config } = ctx;
    const scaleOnly = !!(config && config.typePolicy && config.typePolicy.scaleOnly);
    const hasScale = !!(config && Array.isArray(config.approvedTypeScale) && config.approvedTypeScale.length);
    if (!config || (!scaleOnly && !hasScale)) return [];
    const findings = [];
    for (const { value, index } of eachMatch(FONT_SIZE_RE, ctx.lineText)) {
      if (inSet(value, config.approvedTypeScale) || isArbitrary(value, config)) continue;
      findings.push({
        file: ctx.filePath,
        line: ctx.lineNumber,
        column: index + 1,
        severity: severityFor(false, config),
        ruleClass: 'typeScale',
        message: `Font size "${value}" is not on the approved type scale.`,
        value,
      });
    }
    return findings;
  },

  // Raw px spacing not in approvedSpacing.
  spacing: (ctx) => {
    const { config } = ctx;
    if (!config || !Array.isArray(config.approvedSpacing) || config.approvedSpacing.length === 0) {
      return [];
    }
    const findings = [];
    for (const { value, index } of eachMatch(SPACING_RE, ctx.lineText)) {
      if (inSet(value, config.approvedSpacing) || isArbitrary(value, config)) continue;
      findings.push({
        file: ctx.filePath,
        line: ctx.lineNumber,
        column: index + 1,
        severity: severityFor(false, config),
        ruleClass: 'spacing',
        message: `Spacing "${value}" is not an approved spacing token.`,
        value,
      });
    }
    return findings;
  },

  // Raw border-radius values not in approvedRadius.
  radius: (ctx) => {
    const { config } = ctx;
    if (!config || !Array.isArray(config.approvedRadius) || config.approvedRadius.length === 0) {
      return [];
    }
    const findings = [];
    for (const { value, index } of eachMatch(RADIUS_RE, ctx.lineText)) {
      if (inSet(value, config.approvedRadius) || isArbitrary(value, config)) continue;
      findings.push({
        file: ctx.filePath,
        line: ctx.lineNumber,
        column: index + 1,
        severity: severityFor(false, config),
        ruleClass: 'radius',
        message: `Border radius "${value}" is not an approved radius token.`,
        value,
      });
    }
    return findings;
  },

  // Raw box-shadow values (those carrying a px offset) not referencing an
  // approved shadow token.
  shadow: (ctx) => {
    const { config } = ctx;
    if (!config || !Array.isArray(config.approvedShadows) || config.approvedShadows.length === 0) {
      return [];
    }
    const findings = [];
    for (const { value, index } of eachMatch(BOX_SHADOW_RE, ctx.lineText)) {
      const raw = value.trim();
      if (raw.toLowerCase() === 'none') continue;
      if (inSet(raw, config.approvedShadows) || isArbitrary(raw, config)) continue;
      // Only a raw literal (with a px offset) is a violation; a bare token
      // reference is allowed.
      if (!/\dpx/i.test(raw)) continue;
      // Allow a raw value that names an approved shadow token.
      if (config.approvedShadows.some((s) => raw.toLowerCase().includes(String(s).toLowerCase()))) {
        continue;
      }
      findings.push({
        file: ctx.filePath,
        line: ctx.lineNumber,
        column: index + 1,
        severity: severityFor(false, config),
        ruleClass: 'shadow',
        message: `Box shadow "${raw}" is not an approved shadow token.`,
        value: raw,
      });
    }
    return findings;
  },

  // Banned text-align values (explicit banlist).
  textAlign: (ctx) => {
    const { config } = ctx;
    if (!config || !Array.isArray(config.bannedTextAlignments) || config.bannedTextAlignments.length === 0) {
      return [];
    }
    const findings = [];
    for (const { value, index } of eachMatch(TEXT_ALIGN_RE, ctx.lineText)) {
      if (!inSet(value, config.bannedTextAlignments)) continue;
      findings.push({
        file: ctx.filePath,
        line: ctx.lineNumber,
        column: index + 1,
        severity: severityFor(false, config),
        ruleClass: 'textAlign',
        message: `Text alignment "${value}" is banned by this design system.`,
        value,
      });
    }
    return findings;
  },

  // Casing: flag a text-transform that contradicts the system casing policy.
  // Conservative — only fires on an explicit, contradicting text-transform.
  casing: (ctx) => {
    const { config } = ctx;
    const casing = config && config.casing;
    if (!casing || casing === 'none') return [];
    const findings = [];
    const conflicts = {
      sentence: new Set(['uppercase', 'capitalize']),
      title: new Set(['uppercase', 'lowercase']),
      uppercase: new Set(['lowercase', 'capitalize']),
    };
    const banned = conflicts[casing];
    if (!banned) return [];
    for (const { value, index } of eachMatch(TEXT_TRANSFORM_RE, ctx.lineText)) {
      if (!banned.has(value.toLowerCase())) continue;
      findings.push({
        file: ctx.filePath,
        line: ctx.lineNumber,
        column: index + 1,
        severity: 'warn',
        ruleClass: 'casing',
        message: `text-transform "${value}" conflicts with "${casing}" casing policy.`,
        value,
      });
    }
    return findings;
  },

  // Token-shaped references (e.g. "color.brand.coral") that match the token
  // naming convention but are not defined in the system (US9 / FR-012).
  // Advisory by default; a hard error when the token set is authoritative
  // (`tokenSetComplete: true`) — see command-check.md "Finding Severity".
  tokenShape: (ctx) => {
    const { config } = ctx;
    if (!config || !Array.isArray(config.approvedTokenNames) || config.approvedTokenNames.length === 0) {
      return [];
    }
    // Known token groups = the first dotted segment of every defined token name.
    const knownGroups = new Set(config.approvedTokenNames.map((n) => String(n).split('.')[0]));
    const findings = [];
    for (const { value, index } of eachMatch(TOKEN_PATH_RE, ctx.lineText)) {
      const group = value.split('.')[0];
      if (!knownGroups.has(group)) continue; // not token-shaped for this system
      if (inSet(value, config.approvedTokenNames) || isArbitrary(value, config)) continue;
      findings.push({
        file: ctx.filePath,
        line: ctx.lineNumber,
        column: index + 1,
        severity: severityFor(true, config),
        ruleClass: 'tokenShape',
        message: `"${value}" looks like a ${group} token but is not defined in this design system.`,
        value,
      });
    }
    return findings;
  },
};

/**
 * Scan a single file and return its findings.
 *
 * Reads the file, iterates its lines, and dispatches each line to every rule
 * in RULE_REGISTRY. Since the registry is empty, this currently yields no
 * findings.
 *
 * @param {string} filePath
 * @param {object} config  resolved CheckerConfig for this file
 * @returns {CheckResult[]}
 */
export function scanFile(filePath, config) {
  /** @type {CheckResult[]} */
  const findings = [];

  let contents;
  try {
    contents = fs.readFileSync(filePath, 'utf8');
  } catch (err) {
    // Surface a read error the way command-check.md documents; the orchestrator
    // decides on exit code 2. We do not push a finding for an I/O error.
    throw new Error(`[dsguard] Could not read ${filePath}: ${err.message}`);
  }

  const lines = contents.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const lineNumber = i + 1;
    const lineText = lines[i];
    const ctx = { filePath, lineNumber, lineText, config };
    // Dispatch to every registered rule. Registry is empty in the skeleton.
    for (const ruleClass of Object.keys(RULE_REGISTRY)) {
      const ruleFn = RULE_REGISTRY[ruleClass];
      const ruleFindings = ruleFn(ctx) || [];
      for (const f of ruleFindings) findings.push(f);
    }
  }

  return findings;
}

// ---------------------------------------------------------------------------
// CheckReport assembly
// ---------------------------------------------------------------------------

/**
 * Build a CheckReport (data-model.md #7) from a list of findings.
 *
 * @param {{ systemName: string, targetPath: string, findings: CheckResult[] }} args
 * @returns {CheckReport}
 */
export function buildReport({ systemName, targetPath, findings }) {
  const errorCount = findings.filter((f) => f.severity === 'ERROR').length;
  const warnCount = findings.filter((f) => f.severity === 'warn').length;
  return {
    systemName: systemName || '',
    checkedAt: new Date().toISOString(),
    targetPath,
    findings,
    errorCount,
    warnCount,
    passed: errorCount === 0,
  };
}

/**
 * Check a path and produce a CheckReport.
 *
 * Two modes:
 *  - Routed (manifest provided): each discovered file is routed to its first
 *    matching system; unmatched files are skipped silently; each file is
 *    scanned with its system's checker-config.json (resolved relative to that
 *    system's pluginDir). The report systemName reflects the set of systems
 *    that actually contributed files (single system → its name).
 *  - Single (no manifest): every discovered file is scanned with the one
 *    provided `config`.
 *
 * @param {string} targetPath
 * @param {object|null} config             single-system config (no-manifest mode)
 * @param {object} [opts]
 * @param {object|null} [opts.manifest]    RoutingManifest (multi-system mode)
 * @param {string} [opts.manifestDir]      directory the manifest lives in (for
 *                                          resolving pluginDir relatively)
 * @returns {CheckReport}
 */
export function checkPath(targetPath, config, opts = {}) {
  const { manifest = null, manifestDir = '.' } = opts;
  const files = discoverSourceFiles(targetPath);

  /** @type {CheckResult[]} */
  const findings = [];
  const contributingSystems = new Set();

  // Cache resolved per-system configs so we don't re-read from disk per file.
  const systemConfigCache = new Map();

  for (const file of files) {
    let fileConfig = config;
    let systemName = config && config.systemName ? config.systemName : '';

    if (manifest) {
      const system = resolveSystemForFile(file, manifest);
      if (!system) continue; // FR-001b: unmatched files are skipped silently
      systemName = system.name;
      contributingSystems.add(system.name);
      if (!systemConfigCache.has(system.name)) {
        const cfgPath = path.join(manifestDir, system.pluginDir, 'checker-config.json');
        systemConfigCache.set(system.name, loadCheckerConfig(cfgPath));
      }
      fileConfig = systemConfigCache.get(system.name);
    }

    const fileFindings = scanFile(file, fileConfig);
    for (const f of fileFindings) findings.push(f);
  }

  let reportSystemName;
  if (manifest) {
    reportSystemName =
      contributingSystems.size === 1 ? [...contributingSystems][0] : [...contributingSystems].join(',');
  } else {
    reportSystemName = config && config.systemName ? config.systemName : '';
  }

  return buildReport({ systemName: reportSystemName, targetPath, findings });
}

// ---------------------------------------------------------------------------
// Top-level orchestration
// ---------------------------------------------------------------------------

/**
 * Top-level orchestrator. Resolves config/routing, runs the check, and maps the
 * outcome to an exit code.
 *
 * Exit codes (command-check.md):
 *   0 — pass (zero hard errors)
 *   1 — fail (one or more hard errors)
 *   2 — configuration / I/O error (path missing, no config)
 *
 * @param {object} args
 * @param {string} args.targetPath
 * @param {string} [args.configPath]      explicit checker-config.json (single-system)
 * @param {string} [args.manifestPath]    explicit ds-guard.config.json (multi-system)
 * @param {string} [args.systemName]      override system name for the report
 * @returns {{ report: CheckReport | null, exitCode: number, error?: string, checkedFiles?: number }}
 */
export function runCheck({ targetPath, configPath, manifestPath, systemName }) {
  // Path must exist.
  let exists = false;
  try {
    fs.statSync(targetPath);
    exists = true;
  } catch {
    exists = false;
  }
  if (!exists) {
    return { report: null, exitCode: 2, error: `[dsguard] Path not found: ${targetPath}` };
  }

  // Routing manifest takes precedence when present.
  const manifest = manifestPath ? loadRoutingManifest(manifestPath) : null;

  const checkedFiles = discoverSourceFiles(targetPath).length;

  if (manifest) {
    const manifestDir = path.dirname(manifestPath);
    let report;
    try {
      report = checkPath(targetPath, null, { manifest, manifestDir });
    } catch (err) {
      return { report: null, exitCode: 2, error: err.message };
    }
    if (systemName) report.systemName = systemName;
    return { report, exitCode: report.passed ? 0 : 1, checkedFiles };
  }

  // Single-system mode: a checker-config.json is required.
  const config = loadCheckerConfig(configPath);
  if (!config) {
    return {
      report: null,
      exitCode: 2,
      error: '[dsguard] No checker-config.json found. Run /dsguard:generate first.',
    };
  }

  let report;
  try {
    report = checkPath(targetPath, config);
  } catch (err) {
    return { report: null, exitCode: 2, error: err.message };
  }
  if (systemName) report.systemName = systemName;
  return { report, exitCode: report.passed ? 0 : 1, checkedFiles };
}

// ---------------------------------------------------------------------------
// Output formatting
// ---------------------------------------------------------------------------

/**
 * Format a CheckReport as human-readable text (command-check.md "Text Format").
 *
 * `checkedFiles` is supplied separately (it is not part of the CheckReport
 * shape in data-model.md) so the "Checked N files." pass message is accurate.
 *
 * @param {CheckReport} report
 * @param {number} [checkedFiles]  number of files scanned (for the pass summary)
 * @returns {string}
 */
export function formatText(report, checkedFiles = 0) {
  const lines = [];

  for (const f of report.findings) {
    const sev = f.severity === 'ERROR' ? 'ERROR' : 'warn ';
    lines.push(`${f.file}:${f.line}  ${sev}  ${f.ruleClass}  ${f.message}`);
  }

  if (report.errorCount > 0 || report.warnCount > 0) {
    const errWord = report.errorCount === 1 ? 'error' : 'errors';
    const warnWord = report.warnCount === 1 ? 'warning' : 'warnings';
    if (lines.length) lines.push('');
    lines.push(`Found ${report.errorCount} ${errWord}, ${report.warnCount} ${warnWord}.`);
    lines.push(report.passed ? 'PASS' : 'FAIL');
  } else {
    // No findings at all.
    lines.push(`Checked ${checkedFiles} files. No violations found.`);
    lines.push('PASS');
  }

  return lines.join('\n');
}

/**
 * Format a CheckReport as JSON (machine-readable CheckReport).
 * @param {CheckReport} report
 * @returns {string}
 */
export function formatJson(report) {
  return JSON.stringify(report, null, 2);
}

// ---------------------------------------------------------------------------
// CLI entry point
// ---------------------------------------------------------------------------

/**
 * Parse argv for the CLI. Returns a structured options object.
 * @param {string[]} argv
 */
export function parseArgs(argv) {
  const opts = { targetPath: undefined, format: 'text', configPath: undefined, manifestPath: undefined, systemName: undefined };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--format') {
      opts.format = argv[++i];
    } else if (arg === '--config') {
      opts.configPath = argv[++i];
    } else if (arg === '--manifest') {
      opts.manifestPath = argv[++i];
    } else if (arg === '--system') {
      opts.systemName = argv[++i];
    } else if (!arg.startsWith('--') && opts.targetPath === undefined) {
      opts.targetPath = arg;
    }
  }
  return opts;
}

function cliMain(argv) {
  const opts = parseArgs(argv);

  if (!opts.targetPath) {
    process.stderr.write('[dsguard] Usage: checker.mjs <path> [--format json|text] [--config <path>] [--manifest <path>] [--system <name>]\n');
    process.exitCode = 2;
    return;
  }

  // Default routing manifest discovery: ds-guard.config.json next to the target's
  // cwd, only when no explicit --config is given.
  let manifestPath = opts.manifestPath;
  if (!manifestPath && !opts.configPath) {
    const candidate = path.resolve(process.cwd(), 'ds-guard.config.json');
    if (fs.existsSync(candidate)) manifestPath = candidate;
  }

  const { report, exitCode, error, checkedFiles } = runCheck({
    targetPath: opts.targetPath,
    configPath: opts.configPath,
    manifestPath,
    systemName: opts.systemName,
  });

  if (error) {
    process.stderr.write(error + '\n');
    process.exitCode = exitCode;
    return;
  }

  if (opts.format === 'json') {
    process.stdout.write(formatJson(report) + '\n');
  } else {
    process.stdout.write(formatText(report, checkedFiles) + '\n');
  }
  process.exitCode = exitCode;
}

// Run as CLI when executed directly (not when imported).
const invokedDirectly = (() => {
  if (!process.argv[1]) return false;
  try {
    return import.meta.url === new URL(`file://${process.argv[1]}`).href ||
      path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname);
  } catch {
    return false;
  }
})();

if (invokedDirectly) {
  cliMain(process.argv.slice(2));
}
