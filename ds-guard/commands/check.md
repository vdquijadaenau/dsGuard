---
description: Run the deterministic static checker over a file or directory.
---

# /dsguard:check <path>

Run the deterministic static checker over a path (file or directory) and report
every use of a value or pattern not permitted by the design system, with file and
location, plus an unambiguous overall PASS/FAIL.

The user invoked this command with the argument: `$ARGUMENTS`

## Usage

```
/dsguard:check <path> [--system <name>] [--format json|text]
```

- `<path>` — file or directory to check (relative or absolute). Required.
- `--system <name>` — system name to use. Required only when multiple systems are
  configured and `<path>` is ambiguous.
- `--format json|text` — output format. Defaults to `text`.

## What to do

1. Run the checker. From within a per-system plugin, point it at that plugin's
   frozen checker and config:

   ```bash
   node ${CLAUDE_PLUGIN_ROOT}/scripts/checker.mjs $ARGUMENTS --config ${CLAUDE_PLUGIN_ROOT}/checker-config.json
   ```

   When a `ds-guard.config.json` routing manifest exists at the project root, omit
   `--config` and let the checker route each file to its system automatically:

   ```bash
   node ${CLAUDE_PLUGIN_ROOT}/scripts/checker.mjs $ARGUMENTS
   ```

2. Relay the checker's output verbatim:
   - **PASS** (exit code 0): report `Checked N files. No violations found.` / `PASS`.
   - **FAIL** (exit code 1): report each `<file>:<line>  <severity>  <ruleClass>  <message>`
     line, the `Found X errors, Y warnings.` summary, and `FAIL`.
   - With `--format json`, relay the `CheckReport` JSON object.

3. Treat the exit code as authoritative:

   | Code | Meaning |
   |------|---------|
   | 0 | Pass — zero hard errors |
   | 1 | Fail — one or more hard errors |
   | 2 | Configuration or I/O error (not a design violation) |

## Preconditions

- A `checker-config.json` is accessible (in the per-system plugin, or resolved via
  a `ds-guard.config.json` routing manifest).
- `<path>` exists and is readable.

## Errors to relay

- Path missing: `[dsguard] Path not found: <path>`
- No checker config: `[dsguard] No checker-config.json found. Run /dsguard:generate first.`
- File read failure: `[dsguard] Could not read <file>: <os-error>`

## Notes

- The checker analyses static source only (`.tsx`, `.ts`, `.jsx`, `.js`, `.css`,
  `.scss`). It never reads compiled output or computes runtime styles, and it never
  writes, modifies, or deletes any file in the target path.
- Token references (e.g. `colors['brand-teal']`, `radius.md`) are never flagged;
  only raw literal values (a hex colour, an off-scale px size) are.
