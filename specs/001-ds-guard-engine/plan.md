# Implementation Plan: DS-Guard — Design System Enforcement Engine

**Branch**: `001-ds-guard-engine` | **Date**: 2026-06-08 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/001-ds-guard-engine/spec.md`

## Summary

DS-Guard is a Claude Code plugin engine (`ds-guard`) that generates a system-specific guidance
skill and a config-driven static checker from a design-system definition (DTCG tokens +
`rules.json` + optional markdown contracts). The engine produces a self-contained per-system
plugin that apps install without needing the engine at runtime. The checker is refactored from
the Daybreak prototype: generic invariants stay in code, per-system permitted sets move to a
loaded JSON config, and `tokenSetComplete` converts advisory findings to hard failures for
authoritative token sets.

## Technical Context

**Language/Version**: JavaScript (Node.js 20+, ESM `.mjs` modules)

**Primary Dependencies**:
- Claude Code plugin runtime (commands, skills, hooks, agents)
- DTCG design token format (W3C Design Tokens Community Group — JSON)
- Style Dictionary (optional; drives authoritative token-set generation for FR-012)
- `ajv` (JSON Schema validation for `rules.json` at load time)
- Node.js built-ins: `node:fs`, `node:path`, `node:test`

**Storage**: Files only
- Definition directory: `design/tokens/*.json`, `design/rules.json`, `design/references/*.md`
- Generated output: `<system-name>/` (self-contained per-system plugin)
- Multi-system routing: `ds-guard.config.json` at consuming-project root (path globs → system name)

**Testing**: Node.js built-in test runner (`node:test`); fixture-based with known-bad and
known-good component files derived from spec acceptance scenarios

**Target Platform**: Claude Code agent runtime (plugin host); Node.js 20+ for scripts

**Project Type**: Claude Code plugin (engine) + generated Claude Code plugin (per-system)

**Performance Goals**: Checker completes in < 5 seconds on a typical project (50–500 component
files); guidance skill trigger summary adds < 200 tokens to resident context

**Constraints**:
- Engine MUST contain zero design-system-specific values (Constitution Principle I)
- Generated plugins are self-contained (frozen checker script copy + config; no engine dep)
- Distribution via copy-in: the per-system plugin directory is copied into the consuming repo
  or shared via any file-transfer mechanism — no npm registry required
- Routing manifest maps path globs to system names for multi-system projects; first match wins

**Scale/Scope**: Single maintainer → team of app developers; 50–500 component files per project

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Check | Status |
|-----------|-------|--------|
| I. Engine, not a design system | Engine plugin contains no colour/font/size/rule values; all content sourced from definition at generation time | ✅ PASS |
| II. Determinism first | Checker performs static AST/text analysis; identical inputs → identical output; reviewer is isolated model judgment, explicitly last-resort | ✅ PASS |
| III. Generated, never hand-maintained | Per-system plugin fully produced by `/dsguard:generate` from templates; no manual editing of outputs required or permitted | ✅ PASS |
| IV. Specific output, generic machine | Generated skill/config uses real system token names (e.g. `color.brand.teal`); engine templates are generic | ✅ PASS |
| V. Minimal schema with escape hatch | `rules.json` schema covers common cases; `freeformRules` string always present for long tail; schema additions require multi-system recurrence | ✅ PASS |
| VI. Decoupled runtime | Per-system plugin ships a frozen copy of `checker.mjs` + its config; engine directory not referenced at check time | ✅ PASS |
| VII. Separation of concerns | Spec is technology-agnostic; all platform/tool choices isolated in this plan | ✅ PASS |
| VIII. Tests come from the spec | Test fixtures derive directly from the 9 acceptance scenarios in spec.md | ✅ PASS |

**Post-Phase-1 re-check**: ✅ PASS — design artifacts (data model, contracts) introduce no
constitution violations; templates contain no embedded design-system values.

## Project Structure

### Documentation (this feature)

```text
specs/001-ds-guard-engine/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output
│   ├── command-init.md
│   ├── command-generate.md
│   ├── command-check.md
│   └── command-review.md
└── tasks.md             # Phase 2 output (/speckit-tasks)
```

### Source Code (repository root)

```text
ds-guard/                             # Engine plugin (build-time, installed by maintainers)
├── .claude-plugin/
│   └── plugin.json                   # Plugin manifest (name, version, commands, skills)
├── commands/
│   ├── init.md                       # /dsguard:init <name>
│   ├── generate.md                   # /dsguard:generate
│   ├── check.md                      # /dsguard:check <path>
│   └── review.md                     # /dsguard:review <component>
├── scripts/
│   ├── init.mjs                      # Scaffold definition directory structure
│   ├── generate.mjs                  # Generate per-system plugin from definition
│   ├── validate-definition.mjs       # Validate definition at load time (hard errors)
│   └── checker.mjs                   # Config-driven static checker (generic)
├── templates/
│   ├── guidance-skill.md.tmpl        # Template → system-specific guidance skill
│   ├── checker-config.json.tmpl      # Template → per-system checker config
│   ├── gate-hook.md.tmpl             # Template → workflow gate hook
│   └── plugin-manifest.json.tmpl     # Template → per-system plugin.json
└── schema/
    └── rules-schema.json             # JSON Schema for rules.json (ajv validation)

# Definition (lives in design system repo — scaffolded by /dsguard:init)
design/
├── tokens/
│   ├── primitives.json               # Raw DTCG token values
│   └── semantic.json                 # Semantic/alias tokens
├── rules.json                        # Enforceable policy (validated against rules-schema.json)
└── references/                       # Per-component contracts (markdown, optional)
    └── <ComponentName>.md

# Generated per-system plugin (self-contained runtime artifact)
<system-name>/                        # e.g. acme-design-system/
├── .claude-plugin/
│   └── plugin.json                   # Generated plugin manifest
├── skills/
│   └── <system>-design-system.md    # Generated guidance skill (trigger summary + body)
├── scripts/
│   └── checker.mjs                   # Frozen copy of ds-guard/scripts/checker.mjs
├── checker-config.json               # Generated: permitted sets + tokenSetComplete flag
└── hooks/
    └── ui-gate.md                    # Generated workflow hook

# Multi-system routing (optional, consuming project root)
ds-guard.config.json                  # Path globs → system name mapping

# Tests (engine plugin)
tests/
├── fixtures/
│   ├── known-bad/                    # Component files with design violations
│   └── known-good/                   # Conforming component files
└── unit/
    ├── validate-definition.test.mjs  # Tests for definition validation
    ├── generate.test.mjs             # Tests for generation (idempotency, template fill)
    └── checker.test.mjs              # Tests for checker (zero false neg/pos on fixtures)
```

**Structure Decision**: Single project (engine plugin) with generated output (per-system plugin).
The engine and per-system plugin are separate Claude Code plugins with distinct manifests.
The definition lives in the design system's own repository (not in ds-guard). Tests live in
`tests/` at the engine root and use fixture-based testing derived from spec acceptance scenarios.
