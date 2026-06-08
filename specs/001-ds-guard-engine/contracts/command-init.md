# Contract: `/dsguard:init <name>`

**Plugin**: `ds-guard` (engine)
**Audience**: Maintainer

## Purpose

Scaffold an empty design-system definition directory structure so the maintainer has a
structured place to record values and rules without starting from a blank file.

## Invocation

```
/dsguard:init <name>
```

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `name` | string | Yes | System identifier used as directory prefix and in `rules.json` `name` field. Lowercase, hyphen-separated (e.g. `acme`, `brand-alpha`). |

## Preconditions

- The engine plugin (`ds-guard`) is installed
- No `design/` directory exists at the current location, OR the `--force` flag is passed
  (if not forced and directory exists: hard error with message)

## Postconditions

Creates the following structure relative to the current working directory:

```
design/
├── tokens/
│   ├── primitives.json    # DTCG stub: empty $schema + example entry
│   └── semantic.json      # DTCG stub: empty $schema + example alias
├── rules.json             # Stub: name set to <name>, schemaVersion set, all optional fields absent
└── references/            # Empty directory
```

## Success Output

```
[dsguard] Scaffolded definition for '<name>'
  design/tokens/primitives.json
  design/tokens/semantic.json
  design/rules.json
  design/references/

Next: fill in your tokens and rules, then run /dsguard:generate
```

## Failure Outputs

| Condition | Exit | Message |
|-----------|------|---------|
| `name` missing | error | `[dsguard] init requires a system name: /dsguard:init <name>` |
| `design/` already exists (no force) | error | `[dsguard] design/ already exists. Use --force to overwrite.` |
| File system write failure | error | `[dsguard] Failed to create <path>: <os-error>` |
