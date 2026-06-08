# Contract: `/dsguard:check <path>`

**Plugin**: `ds-guard` engine OR per-system plugin (both expose this command)
**Audience**: App developer, automated gate

## Purpose

Run the deterministic static checker over a path (file or directory). Reports each use of a
value or pattern not permitted by the design system, with file and location, and emits an
unambiguous overall pass/fail.

## Invocation

```
/dsguard:check <path> [--system <name>] [--format json|text]
```

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `path` | path | Yes | — | File or directory to check (relative or absolute) |
| `--system` | string | No | From routing manifest or implied by plugin | System name to use. Required only when multiple systems are configured and `path` is ambiguous. |
| `--format` | enum | No | `text` | Output format: `text` (human-readable) or `json` (machine-readable `CheckReport`) |

## Preconditions

- A `checker-config.json` is accessible (either in the per-system plugin, or resolved via
  `ds-guard.config.json` routing manifest)
- `path` exists and is readable

## Routing (multi-system)

If a `ds-guard.config.json` exists at the project root:
1. For each source file under `path`, find the first matching system in the manifest
2. Use that system's `checker-config.json` for that file
3. Files matching no pattern are skipped without error or warning

## Analysis Target

Analyses static source files only:
- `.tsx`, `.ts`, `.jsx`, `.js` (component source, styled-components, CSS-in-JS)
- `.css`, `.scss`, `.module.css` (stylesheet source)
- React Native StyleSheet source (`.tsx`/`.ts` files containing `StyleSheet.create(...)`)

Does NOT analyse compiled output, CSS bundles, or runtime-computed styles.

## Finding Severity

| Severity | Condition |
|----------|-----------|
| `ERROR` | Value or pattern is not in the permitted set AND (`tokenSetComplete: true` OR the rule class has an explicit allowlist) |
| `warn` | Value looks like a design token but is not in the permitted set AND `tokenSetComplete: false` |
| Skipped | Value is in `arbitraryAllowlist`, or is a framework/CSS keyword on the generic allowlist |

## Output: Text Format

```
<file>:<line>  ERROR  <ruleClass>  <message>
<file>:<line>  warn   <ruleClass>  <message>

Found 2 errors, 1 warning.
FAIL
```

or, on pass:

```
Checked 47 files. No violations found.
PASS
```

## Output: JSON Format

Emits a `CheckReport` object (see data-model.md):

```json
{
  "systemName": "acme",
  "checkedAt": "2026-06-08T12:00:00Z",
  "targetPath": "src/",
  "findings": [...],
  "errorCount": 2,
  "warnCount": 1,
  "passed": false
}
```

## Exit Codes (when invoked as a script)

| Code | Meaning |
|------|---------|
| 0 | Pass — zero hard errors |
| 1 | Fail — one or more hard errors |
| 2 | Configuration or I/O error (not a design violation) |

## Failure Outputs

| Condition | Exit code | Message |
|-----------|-----------|---------|
| `path` does not exist | 2 | `[dsguard] Path not found: <path>` |
| No checker config found | 2 | `[dsguard] No checker-config.json found. Run /dsguard:generate first.` |
| File parse error | 2 | `[dsguard] Could not read <file>: <os-error>` |
