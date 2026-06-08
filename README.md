
# DS-Guard — Design System Enforcement Engine

DS-Guard is a Claude Code **plugin engine**. From a single machine-readable
definition of your design system (DTCG tokens + a `rules.json` + optional markdown
contracts) it generates a **self-contained per-system plugin** containing:

- a **guidance skill** that loads on-demand when a prompt touches UI work, carrying
  your real approved vocabulary and rules; and
- a **config-driven static checker** that deterministically flags any value or
  pattern your design system does not permit.

The engine contains **zero design-system-specific values** — every colour, size,
font, and rule comes from your definition at generation time. The generated plugin
is decoupled: a consuming app installs it and runs it **without the engine
present**.

---

## Requirements

- Node.js 20+ (scripts are ESM `.mjs`, use only Node built-ins + `ajv`)
- Claude Code with plugin support

## Install (engine)

The engine is loaded as a plugin directory by maintainers who define a design
system:

```bash
claude --plugin-dir ./ds-guard
```

This exposes four commands: `/dsguard:init`, `/dsguard:generate`,
`/dsguard:check`, and `/dsguard:review`.

---

## Workflow

```
  define            generate              distribute            enforce
 ───────►  design/  ───────►  <name>-design-system/  ───────►  consuming app
 (init)            (generate)        (copy-in)              (check / review / gate)
```

### 1. `init` — scaffold a definition

```
/dsguard:init <name>
```

Creates a `design/` directory with empty, structured stubs:

```
design/
├── tokens/
│   ├── primitives.json     # raw DTCG token values (colour, dimension, radius…)
│   └── semantic.json       # semantic / alias tokens
├── rules.json              # enforceable policy (name + schemaVersion required)
└── references/             # optional per-component markdown contracts
```

Errors if `design/` already exists (pass `--force` only to overwrite). No
enforcement code is written by hand — you only fill in values.

### 2. `generate` — produce the per-system plugin

```
/dsguard:generate [--out <dir>]
```

Validates `design/rules.json` against the schema, resolves permitted sets from the
DTCG token files, fills the templates, and writes a self-contained plugin
(default `./<name>-design-system/`):

```
<name>-design-system/
├── .claude-plugin/plugin.json      # generated manifest
├── skills/<name>-design-system.md  # guidance skill (trigger summary + body)
├── scripts/checker.mjs             # frozen copy of the engine checker
├── checker-config.json             # permitted sets + tokenSetComplete flag
└── hooks/ui-gate.md                # workflow gate hook
```

**Generation is all-or-nothing**: an invalid or missing definition halts the run
with diagnostics and writes nothing. Re-running on an unchanged definition is
byte-identical except for the `generatedAt` timestamp. Never hand-edit the
output — change the definition and regenerate.

### 3. `check` — catch drift deterministically

```
/dsguard:check <path> [--system <name>] [--format json|text]
```

Runs the static checker over a file or directory and reports every
disallowed value with file + line, plus an unambiguous overall verdict:

| Exit code | Meaning |
|-----------|---------|
| `0` | **PASS** — zero hard errors |
| `1` | **FAIL** — one or more hard errors |
| `2` | Configuration or I/O error (not a design violation) |

Raw literals (a hex colour, an off-scale `px` size, a disallowed radius) are
flagged; token references (`colors['brand-teal']`, `radius.md`) never are. The
check is **read-only** — it never creates, modifies, or deletes a file in the
target path.

### 4. `review` — judge what can't be measured

```
/dsguard:review <component> [--system <name>]
```

Spawns a **fresh-context agent** (no session history) that, given only the
component source and the guidance skill, returns structured qualitative
observations on **Hierarchy**, **Spacing Rhythm**, and **Contextual Intent**.
This is **advisory only** — observations, never a pass/fail gate. For hard
violations, use `/dsguard:check`.

---

## Distribution

The generated `<name>-design-system/` directory is fully self-contained: it ships a
frozen copy of `checker.mjs` plus its `checker-config.json` and references nothing
under `ds-guard/`. Copy it into the consuming repo (or share it by any
file-transfer mechanism — no npm registry required) and load it:

```bash
claude --plugin-dir ./<name>-design-system
```

The consuming app then has `/dsguard:check`, `/dsguard:review`, and the gate hook
without the engine installed.

### Automatic gate

The generated `hooks/ui-gate.md` runs `/dsguard:check` when an agent finishes
editing UI and **blocks completion on a FAIL** (exit code 1), so drift cannot land
silently.

### Multiple design systems

For a monorepo with more than one system, add a routing manifest at the project
root:

```json
// ds-guard.config.json
{
  "schemaVersion": "1.0.0",
  "systems": [
    { "name": "myds",  "pluginDir": "./myds-design-system",  "patterns": ["src/brand/**"] },
    { "name": "other", "pluginDir": "./other-design-system", "patterns": ["src/other/**"] }
  ]
}
```

`/dsguard:check src/` then routes each file to the **first** system whose pattern
matches; files matching no pattern are skipped silently, and each finding is
attributed to its system.

---

## Limits (read before relying on it)

- **Static analysis only.** The checker inspects source text (`.tsx`, `.ts`,
  `.jsx`, `.js`, `.css`, `.scss`). It does not evaluate runtime styles, computed
  values, compiled output, or values arriving from external/dynamic sources.
- **`freeformRules` is advisory.** Free-form prose rules are carried into the
  guidance skill for the model to honour, but they are **not** machine-enforced by
  the checker. Only the structured rule classes in `rules.json` are deterministic
  gates. Use `/dsguard:review` for qualities that can't be expressed as data.
- **`tokenSetComplete` governs severity.** When `true`, a value that *looks* like a
  valid token but isn't in the permitted set is a hard **ERROR**; when `false`, the
  same value is an advisory **warn**.
- **Generated output is not hand-maintained.** Editing the generated plugin is
  unsupported — the definition is the single source of truth.

---

## Definition reference

`design/rules.json` is validated at load time against
[`ds-guard/schema/rules-schema.json`](ds-guard/schema/rules-schema.json) (`ajv`, draft-07). Required
fields: `name`, `schemaVersion`. All rule-class fields are optional; conflicting
rules (e.g. `shadows.policy: "none"` with a non-empty `shadows.allowed`) are
rejected with a specific diagnostic. Token values live in the DTCG files under
`design/tokens/`.

## Tests

Fixture-based tests (Node's built-in `node:test`, no extra framework) live in
`tests/` and derive from the spec's acceptance scenarios — zero false negatives on
known-bad fixtures, zero false positives on known-good ones:

```bash
node --test tests/unit/*.test.mjs
```
