---
description: Scaffold an empty design-system definition directory (design/).
---

# /dsguard:init <name>

Scaffold an empty design-system definition directory so the maintainer has a
structured place to record token values and rules.

The user invoked this command with the argument: `$ARGUMENTS`

## What to do

1. Read the system name from the first argument (`$1`). It is required and must
   be lowercase, hyphen-separated (e.g. `acme`, `brand-alpha`).
2. Run the scaffolding script from the repository root, passing the name:

   ```bash
   node ds-guard/scripts/init.mjs $ARGUMENTS
   ```

   Pass `--force` only if the user explicitly asked to overwrite an existing
   `design/` directory.

3. Relay the script's output verbatim:
   - On success, report the scaffolded file list and the final `Next:` line.
   - On failure, report the error message exactly as printed.

## Preconditions

- No `design/` directory exists at the current location, unless `--force` is
  passed.

## Errors to relay

- Missing name: `[dsguard] init requires a system name: /dsguard:init <name>`
- Directory exists (no force): `[dsguard] design/ already exists. Use --force to overwrite.`
- File-system write failure: `[dsguard] Failed to create <path>: <os-error>`
