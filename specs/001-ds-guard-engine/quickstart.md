# Quickstart Validation Guide: DS-Guard

**Branch**: `001-ds-guard-engine` | **Date**: 2026-06-08

This guide validates DS-Guard end-to-end against the P1 acceptance scenarios. Run through
each scenario in order to confirm the feature works correctly.

---

## Prerequisites

- Node.js 20+ installed
- Claude Code with plugin support available
- The `ds-guard` engine plugin built and accessible at `./ds-guard`

---

## Scenario 1 — Scaffold a definition (US1, scenario 1)

**Spec reference**: US1 acceptance scenario 1

```bash
# Start from an empty directory
mkdir test-system && cd test-system
claude --plugin-dir ../ds-guard

/dsguard:init myds
```

**Expected outcome**:
- `design/` directory created with `tokens/primitives.json`, `tokens/semantic.json`,
  `rules.json`, and `references/`
- `rules.json` contains `"name": "myds"` and a `schemaVersion` field
- No enforcement code written by hand
- Output message: `[dsguard] Scaffolded definition for 'myds'`

**Failure signal**: Any error message, or missing files.

---

## Scenario 2 — Fill the definition and generate (US1 scenario 2 + US2 scenario 1)

**Spec reference**: US1 acceptance scenario 2, US2 acceptance scenario 1

Add a minimal set of tokens and rules to the scaffolded definition:

```json
// design/tokens/primitives.json
{
  "$schema": "https://design-tokens.org/schema/latest",
  "color": {
    "brand-teal": { "$value": "#00897B", "$type": "color" },
    "neutral-100": { "$value": "#F5F5F5", "$type": "color" }
  },
  "spacing": {
    "sm": { "$value": "8px", "$type": "dimension" },
    "md": { "$value": "16px", "$type": "dimension" }
  }
}
```

```json
// design/rules.json
{
  "name": "myds",
  "schemaVersion": "1.0.0",
  "tokenSetComplete": false,
  "radius": { "allowed": ["sm", "md"] },
  "freeformRules": "Use brand-teal for primary actions only."
}
```

```bash
/dsguard:generate
```

**Expected outcome**:
- `myds-design-system/` directory created containing:
  - `.claude-plugin/plugin.json`
  - `skills/myds-design-system.md` — contains `brand-teal`, `neutral-100` in approved
    vocabulary; `freeformRules` text present
  - `checker-config.json` — `approvedColors` includes `#00897B` and `#F5F5F5`
  - `scripts/checker.mjs` (copy of engine checker)
  - `hooks/ui-gate.md`
- No manual editing of any output file required
- Output message: `[dsguard] Generated myds-design-system/`

**Validation**: Open `checker-config.json` and confirm `approvedColors`, `approvedSpacing`,
and `freeformRules` match the definition values.

---

## Scenario 3 — Checker detects a violation (US3, scenario 1)

**Spec reference**: US3 acceptance scenario 1

Create a known-bad component file:

```tsx
// test-components/BadButton.tsx
export const BadButton = () => (
  <button style={{ color: '#FF0000', borderRadius: '99px' }}>Click</button>
);
```

```bash
claude --plugin-dir ./myds-design-system
/dsguard:check test-components/
```

**Expected outcome**:
- `#FF0000` reported as a violation (not in `approvedColors`) with file and line number
- `99px` reported as a violation (not in `approvedRadius: ["sm", "md"]`) with file and line
- Overall result: `FAIL`
- Exit code 1

---

## Scenario 4 — Checker passes on conforming source (US3, scenario 2)

**Spec reference**: US3 acceptance scenario 2

Create a conforming component:

```tsx
// test-components/GoodButton.tsx
import { colors, spacing } from './tokens';

export const GoodButton = () => (
  <button style={{ color: colors['brand-teal'], borderRadius: 'sm' }}>Click</button>
);
```

```bash
/dsguard:check test-components/GoodButton.tsx
```

**Expected outcome**:
- No violations reported
- No false alarms on `colors['brand-teal']` token reference
- Overall result: `PASS`
- Exit code 0

---

## Scenario 5 — Regeneration reflects definition change with no manual edits (US2, scenario 2)

**Spec reference**: US2 acceptance scenario 2, US5

Add a new colour token to `design/tokens/primitives.json`:

```json
"color": {
  ...
  "brand-coral": { "$value": "#FF7043", "$type": "color" }
}
```

```bash
/dsguard:generate
```

**Expected outcome**:
- `checker-config.json` `approvedColors` now includes `#FF7043`
- `skills/myds-design-system.md` vocabulary section now includes `brand-coral`
- No manual editing of any output file performed
- Running the checker on the BadButton fixture still reports `#FF0000` as a violation
  (it was not added to the definition)

---

## Scenario 6 — Invalid definition is rejected with diagnostics (Edge case)

**Spec reference**: Edge Cases — invalid definition

Introduce a conflict in `rules.json`:

```json
"shadows": { "policy": "none", "allowed": ["sm", "md"] }
```

```bash
/dsguard:generate
```

**Expected outcome**:
- Generation halted — no output files created or modified
- Diagnostic message lists the specific conflict:
  `[dsguard] Definition invalid — generation halted:`
  `  shadows.policy is "none" but shadows.allowed is non-empty`

---

## Scenario 7 — Multi-system routing (Edge case)

**Spec reference**: Edge Cases — multiple design systems

Set up two systems and a routing manifest at the project root:

```json
// ds-guard.config.json
{
  "schemaVersion": "1.0.0",
  "systems": [
    { "name": "myds", "pluginDir": "./myds-design-system", "patterns": ["src/brand/**"] },
    { "name": "other", "pluginDir": "./other-design-system", "patterns": ["src/other/**"] }
  ]
}
```

```bash
/dsguard:check src/
```

**Expected outcome**:
- Files under `src/brand/` checked against `myds` config
- Files under `src/other/` checked against `other` config
- Files outside both globs skipped silently (no error)
- Each finding attributed to the correct system

---

## Completion Criteria

All 7 scenarios pass when:
- SC-1: Maintainer produced working artifacts without writing enforcement code ✅
- SC-2: Checker has zero false negatives on BadButton, zero false positives on GoodButton ✅
- SC-4: Regeneration after definition change required zero manual edits ✅
- SC-5: Per-system plugin works with engine absent (`claude --plugin-dir ./myds-design-system`) ✅
