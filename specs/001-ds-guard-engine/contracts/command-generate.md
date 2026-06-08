# Contract: `/dsguard:generate`

**Plugin**: `ds-guard` (engine)
**Audience**: Maintainer

## Purpose

Generate a self-contained per-system plugin from the design-system definition. The output
directory can be distributed to app developers as a copy-in plugin without requiring the
engine to be present.

## Invocation

```
/dsguard:generate [--out <dir>]
```

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `--out` | path | No | `./<name>-design-system/` | Output directory for the generated plugin. `<name>` is taken from `rules.json`. |

## Preconditions

- The engine plugin (`ds-guard`) is installed
- `design/rules.json` exists and is valid per `rules-schema.json`
- At least one DTCG token file exists under `design/tokens/`

## Validation (hard errors — no artifacts produced on failure)

1. Load and validate `design/rules.json` against `rules-schema.json`
   - Missing required fields → list all in a single diagnostic message
   - Schema violations → list all per-field errors
2. Parse all token files under `design/tokens/`
   - Malformed JSON → error naming the file
   - Invalid DTCG structure → error naming the field
3. Check for conflicting rules (e.g. `shadows.policy: "none"` + `shadows.allowed` non-empty)
   - List all conflicts in a single diagnostic

Any validation failure halts generation and outputs diagnostics; no output directory is created
or modified.

## Generation Steps (all-or-nothing)

1. Resolve permitted sets from token files + rules
2. Fill `templates/checker-config.json.tmpl` → `<out>/checker-config.json`
3. Fill `templates/guidance-skill.md.tmpl` → `<out>/skills/<name>-design-system.md`
4. Fill `templates/gate-hook.md.tmpl` → `<out>/hooks/ui-gate.md`
5. Fill `templates/plugin-manifest.json.tmpl` → `<out>/.claude-plugin/plugin.json`
6. Copy `scripts/checker.mjs` → `<out>/scripts/checker.mjs` (frozen copy)

## Idempotency

Running generation on the same definition twice MUST produce byte-identical output in all
files except `generatedAt` in `checker-config.json` (timestamp field excluded from
idempotency guarantee).

## Success Output

```
[dsguard] Generated <name>-design-system/
  .claude-plugin/plugin.json
  skills/<name>-design-system.md
  scripts/checker.mjs
  checker-config.json
  hooks/ui-gate.md

To test: claude --plugin-dir ./<name>-design-system
To distribute: copy the <name>-design-system/ directory to consuming projects
```

## Failure Outputs

| Condition | Exit | Message |
|-----------|------|---------|
| `design/rules.json` missing | error | `[dsguard] No definition found. Run /dsguard:init first.` |
| Validation errors | error | `[dsguard] Definition invalid — generation halted:\n  <list of errors>` |
| Template fill failure | error | `[dsguard] Template error in <template-file>: <detail>` |
| Output write failure | error | `[dsguard] Failed to write <path>: <os-error>` |
