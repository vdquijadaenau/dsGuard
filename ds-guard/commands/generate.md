---
description: Generate a self-contained per-system plugin from a valid definition.
---

# /dsguard:generate

Generate a self-contained per-system plugin from the design-system definition in
`design/` (DTCG tokens + `rules.json`). The output directory can be copied into
consuming projects and used without the engine present.

## Usage

```
/dsguard:generate [--out <dir>]
```

- `--out <dir>` — output directory (optional). Defaults to `./<name>-design-system/`,
  where `<name>` is taken from `design/rules.json`.

## What to do

1. Run the generator from the repository root, forwarding any arguments the user
   provided:

   ```
   node ds-guard/scripts/generate.mjs $ARGUMENTS
   ```

2. The generator validates `design/rules.json` against the rules schema and parses
   every DTCG file under `design/tokens/`. **Generation is all-or-nothing**: if the
   definition is missing or invalid, nothing is written.

3. On success, relay the generator's output (the list of generated files plus the
   "To test" / "To distribute" lines).

4. On failure, relay the error message verbatim. Common cases:
   - `[dsguard] No definition found. Run /dsguard:init first.` — no `design/rules.json`.
   - `[dsguard] Definition invalid — generation halted:` followed by the list of
     validation errors (missing fields, schema violations, rule conflicts, or a
     missing token file).
   - `[dsguard] Failed to write <path>: <os-error>` — file-system failure.

## Notes

- Re-running generation on an unchanged definition produces byte-identical output
  except for the `generatedAt` timestamp in `checker-config.json`.
- Do not hand-edit the generated plugin; change the definition and regenerate.
