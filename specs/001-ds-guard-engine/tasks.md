---
description: "Task list for DS-Guard — Design System Enforcement Engine"
---

# Tasks: DS-Guard — Design System Enforcement Engine

**Input**: Design documents from `specs/001-ds-guard-engine/`

**Prerequisites**: plan.md ✅ | spec.md ✅ | research.md ✅ | data-model.md ✅ | contracts/ ✅

**Tests**: Included — fixture-based tests are required to demonstrate SC-2 (zero false
negatives / near-zero false positives) and are derived directly from spec acceptance scenarios
(Constitution Principle VIII).

**Organization**: Tasks grouped by user story to enable independent implementation and testing.

## Format: `[ID] [P?] [Story?] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1–US9)
- Exact file paths included in all task descriptions

## Path Conventions

- Engine plugin: `ds-guard/`
- Definition (scaffolded in target repo): `design/`
- Generated per-system plugin (example): `acme-design-system/`
- Tests: `tests/`

---

## Phase 1: Setup

**Purpose**: Create the engine plugin directory structure and shared configuration.

- [ ] T001 Create `ds-guard/` engine plugin directory structure: `.claude-plugin/`, `commands/`, `scripts/`, `templates/`, `schema/`
- [ ] T002 Create `ds-guard/.claude-plugin/plugin.json` — engine plugin manifest with name `ds-guard`, version `0.1.0`, and command declarations for `init`, `generate`, `check`, `review`
- [ ] T003 [P] Create `ds-guard/schema/rules-schema.json` — JSON Schema (draft-07) for `rules.json` with required fields `name` and `schemaVersion`, all optional rule-class fields, and conflict validation
- [ ] T004 [P] Create `tests/fixtures/` directory with subdirectories `known-bad/components/`, `known-bad/definition/`, `known-good/components/`, `known-good/definition/`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Shared infrastructure that MUST be complete before any user story begins.

**⚠️ CRITICAL**: No user story work begins until this phase is complete.

- [ ] T005 Implement `ds-guard/scripts/validate-definition.mjs` — load and validate `design/rules.json` against `ds-guard/schema/rules-schema.json` using `ajv`; detect conflicting rules (e.g. `shadows.policy: "none"` + non-empty `shadows.allowed`); return array of error strings; empty array = valid
- [ ] T006 [P] Create stub template files in `ds-guard/templates/`: `guidance-skill.md.tmpl`, `checker-config.json.tmpl`, `gate-hook.md.tmpl`, `plugin-manifest.json.tmpl` — each with placeholder tokens `{{SYSTEM_NAME}}`, `{{SCHEMA_VERSION}}`, `{{GENERATED_AT}}`
- [ ] T007 [P] Implement `ds-guard/scripts/checker.mjs` skeleton — config loading from `checker-config.json`, file discovery for `.tsx`/`.ts`/`.js`/`.css` source files, per-file scan loop, rule-dispatch structure, `CheckResult` and `CheckReport` output shape — no rule implementations yet
- [ ] T038 [P] Implement multi-system routing in `ds-guard/scripts/checker.mjs` — parse `ds-guard.config.json` at project root if present; route each source file to matching system's `checker-config.json` via path-glob first-match; skip files matching no pattern without error (FR-001b — MUST requirement; promoted from Polish)
- [ ] T039 [P] Create routing manifest fixture `tests/fixtures/ds-guard.config.json` and add routing tests to `tests/unit/checker.test.mjs` — file matching system-A pattern uses system-A config; file matching no pattern is skipped; first-match semantics verified (depends on T038)

**Checkpoint**: Foundation complete — user story phases can begin.

---

## Phase 3: User Story 1 — Define a Design System as Data (Priority: P1) 🎯 MVP

**Goal**: Maintainer scaffolds a definition and fills it with values; one machine-readable
source of truth exists.

**Independent Test**: Run `/dsguard:init myds` → verify `design/` structure created with
correct stubs; fill definition with sample tokens and rules; run validation → passes cleanly.

### Tests for User Story 1

> **Write these tests first; confirm they fail before implementing T008–T009**

- [ ] T008 [P] [US1] Create `tests/fixtures/known-good/definition/rules.json` — valid `rules.json` with all optional fields, passes `rules-schema.json` (used as positive fixture in T012)
- [ ] T009 [P] [US1] Create `tests/fixtures/known-bad/definition/rules-missing-name.json` — `rules.json` with missing required `name` field (used as negative fixture in T012)
- [ ] T010 [P] [US1] Create `tests/fixtures/known-bad/definition/rules-conflict.json` — `rules.json` with `shadows.policy: "none"` + `shadows.allowed` non-empty (conflict fixture for T012)

### Implementation for User Story 1

- [ ] T011 [US1] Implement `ds-guard/scripts/init.mjs` — scaffold `design/tokens/primitives.json` (DTCG stub), `design/tokens/semantic.json` (DTCG stub), `design/rules.json` (stub with `name` and `schemaVersion`), `design/references/` (empty dir); error if `design/` already exists (no `--force`)
- [ ] T012 [US1] Implement `ds-guard/commands/init.md` — `/dsguard:init <name>` command per `contracts/command-init.md`; wires to `init.mjs`; success and failure outputs as specified
- [ ] T013 [US1] Write unit tests `tests/unit/validate-definition.test.mjs` — valid fixture → empty errors; missing-name fixture → error listing `name`; conflict fixture → error listing conflict; uses `node:test`

**Checkpoint**: US1 independently testable — maintainer can scaffold and validate a definition.

---

## Phase 4: User Story 2 — Generate Enforcement from the Definition (Priority: P1) 🎯 MVP

**Goal**: Maintainer runs `/dsguard:generate` on a valid definition; receives a guidance skill
and checker config with no manual editing.

**Independent Test**: Given `tests/fixtures/known-good/definition/`, run generation → verify
`checker-config.json` has `approvedColors` matching fixture token values; verify guidance skill
contains same vocabulary; run generation twice → byte-identical output (excluding `generatedAt`).

### Tests for User Story 2

> **Write these tests first; confirm they fail before implementing T015–T019**

- [ ] T014 [P] [US2] Create `tests/fixtures/known-good/definition/tokens/primitives.json` — DTCG file with sample colour, dimension (spacing, type), and radius tokens for use across US2/US3 tests
- [ ] T015 [P] [US2] Create `tests/fixtures/known-good/definition/tokens/semantic.json` — DTCG file with semantic aliases referencing primitives

### Implementation for User Story 2

- [ ] T016 [P] [US2] Complete `ds-guard/templates/checker-config.json.tmpl` — all `CheckerConfig` fields with `{{APPROVED_COLORS}}`, `{{APPROVED_TYPE_SCALE}}`, `{{APPROVED_SPACING}}`, `{{APPROVED_RADIUS}}`, `{{APPROVED_SHADOWS}}`, `{{TOKEN_SET_COMPLETE}}`, `{{FREEFORM_RULES}}` and remaining field placeholders
- [ ] T017 [P] [US2] Complete `ds-guard/templates/guidance-skill.md.tmpl` — add Claude Code skill YAML frontmatter with `trigger.keywords: {{TRIGGER_KEYWORDS}}` and `trigger.summary: {{TRIGGER_SUMMARY}}` fields; body section with approved vocabulary, enforceable rules, `{{FREEFORM_RULES}}`, and on-demand refs; template MUST be fully complete before T019 runs
- [ ] T018 [P] [US2] Complete `ds-guard/templates/plugin-manifest.json.tmpl` — per-system plugin manifest with `{{SYSTEM_NAME}}`, `{{VERSION}}`, command and skill declarations
- [ ] T019 [US2] Implement `ds-guard/scripts/generate.mjs` — load and validate definition via `validate-definition.mjs`; resolve permitted sets from DTCG token files; fill all templates; write per-system plugin to output dir; copy `scripts/checker.mjs` as frozen copy; all-or-nothing (no partial output on error) (depends on T005, T007, T016–T018)
- [ ] T020 [US2] Implement `ds-guard/commands/generate.md` — `/dsguard:generate [--out <dir>]` command per `contracts/command-generate.md`; wires to `generate.mjs`; success and failure outputs as specified
- [ ] T021 [US2] Write unit tests `tests/unit/generate.test.mjs` — generation from known-good fixture produces correct `checker-config.json` fields; idempotency (run twice → byte-identical except `generatedAt`); invalid definition → hard error, no output files created

**Checkpoint**: US2 independently testable — maintainer can generate a complete per-system plugin.

---

## Phase 5: User Story 3 — Catch Drift Deterministically (Priority: P1) 🎯 MVP

**Goal**: Checker flags disallowed values with file + location; passes on conforming source;
emits unambiguous pass/fail.

**Independent Test**: `tests/fixtures/known-bad/components/BadButton.tsx` → FAIL with specific
violations (file, line, rule class, value); `tests/fixtures/known-good/components/GoodButton.tsx`
→ PASS with zero findings.

### Tests for User Story 3

> **Write these tests first; confirm they fail before implementing T024–T026**

- [ ] T022 [P] [US3] Create `tests/fixtures/known-bad/components/BadButton.tsx` — raw colour (`#FF0000`), off-scale size (`font-size: 13px`), disallowed radius (`borderRadius: '99px'`); maps to US3 acceptance scenario 1
- [ ] T023 [P] [US3] Create `tests/fixtures/known-good/components/GoodButton.tsx` — token references only (`colors['brand-teal']`, `spacing.sm`), conforming radius; no false-alarm patterns; maps to US3 acceptance scenario 2

### Implementation for User Story 3

- [ ] T024 [US3] Complete `ds-guard/scripts/checker.mjs` — implement all rule-class checks: colour (raw hex/rgb vs `approvedColors`), type scale (raw px vs `approvedTypeScale`), spacing, radius, shadow, casing, text-align; `tokenSetComplete` mode; `arbitraryAllowlist` bypass; text and JSON output formats; exit codes 0/1/2 per contract (depends on T007)
- [ ] T025 [US3] Implement `ds-guard/commands/check.md` — `/dsguard:check <path> [--system <name>] [--format json|text]` per `contracts/command-check.md`; wires to `checker.mjs`
- [ ] T026 [US3] Write unit tests `tests/unit/checker.test.mjs` — zero false negatives on `known-bad` fixtures; zero false positives on `known-good` fixtures; both output formats verified; exit code 1 on FAIL, 0 on PASS, 2 on config error (depends on T022, T023)

**Checkpoint**: US3 independently testable — checker detects all violations in known-bad, passes on known-good.

---

## Phase 6: User Story 4 — On-Demand Guidance (Priority: P2)

**Goal**: Guidance skill loads only when prompt keywords match; trigger summary is the only
context cost at rest.

**Independent Test**: Inspect generated skill file — verify trigger summary section present
with keywords derived from definition token names and rule classes; verify full body present
as separate section.

- [ ] T027 [US4] Add read-only safety test to `tests/unit/checker.test.mjs` — verify that running the checker against any fixture never creates, modifies, or deletes any file in the target path (NFR-005: safety of adoption); assert no file-system writes occur during a check run
- [ ] T028 [US4] Update `ds-guard/scripts/generate.mjs` — extract trigger keywords from definition: token names from DTCG files + rule-class keywords from `rules.json`; populate `{{TRIGGER_KEYWORDS}}` and `{{TRIGGER_SUMMARY}}` in skill template (depends on T019)
- [ ] T029 [US4] Add trigger-structure tests to `tests/unit/generate.test.mjs` — generated skill has trigger summary section; keywords list is non-empty and derived from definition; body section present and contains approved vocabulary

**Checkpoint**: US4 independently testable — generated skill has correct trigger structure.

---

## Phase 7: User Story 5 — Regenerate on Change Without Drift (Priority: P2)

**Goal**: After definition change, regenerating updates both artifacts exactly; zero manual
edits required; checker can't contradict the definition.

**Independent Test**: Modify `primitives.json` to add a new colour; regenerate; diff
`checker-config.json` → new colour present, old-only colours absent; diff guidance skill →
new vocabulary present.

- [ ] T030 [US5] Add regeneration tests to `tests/unit/generate.test.mjs` — modify known-good definition fixture (add token, change rule), regenerate, assert both artifacts reflect change; assert old value absent; assert no manual edits needed (depends on T021)

**Checkpoint**: US5 independently testable — regeneration tracks definition with zero drift.

---

## Phase 8: User Story 6 — Automatic Gate (Priority: P2)

**Goal**: Gate hook runs checker when agent finishes editing UI; hard violations block "done".

**Independent Test**: Inspect generated `hooks/ui-gate.md` — verify it specifies trigger on
UI-edit completion, invokes `/dsguard:check`, and blocks on FAIL (exit code 1).

- [ ] T031 [US6] Complete `ds-guard/templates/gate-hook.md.tmpl` — Claude Code workflow hook that triggers on UI-edit completion event, runs `/dsguard:check <edited-path>`, blocks on exit code 1 (FAIL)
- [ ] T032 [US6] Update `ds-guard/scripts/generate.mjs` — ensure gate hook is written to `<out>/hooks/ui-gate.md` during generation (depends on T019, T031)
- [ ] T033 [US6] Add gate-hook tests to `tests/unit/generate.test.mjs` — generated plugin contains `hooks/ui-gate.md`; hook references checker command; hook trigger condition is UI-edit event

**Checkpoint**: US6 independently testable — generated plugin contains a functional gate hook.

---

## Phase 9: User Story 7 — Review What Can't Be Measured (Priority: P3)

**Goal**: App developer requests review of built component; receives independent feedback
on hierarchy, rhythm, and intent from a fresh-context agent.

**Independent Test**: Invoke `/dsguard:review GoodButton` → fresh-context agent returns
structured feedback with Hierarchy, Spacing Rhythm, and Contextual Intent sections; output
is clearly labelled as independent review.

- [ ] T034 [US7] Implement `ds-guard/commands/review.md` — `/dsguard:review <component> [--system <name>]` per `contracts/command-review.md`; spawns fresh-context agent with component source + guidance skill; structures output per contract format; does NOT access current session history

**Checkpoint**: US7 independently testable — reviewer produces independent qualitative feedback.

---

## Phase 10: User Story 8 — One-Step Distribution (Priority: P3)

**Goal**: Generated per-system plugin is self-contained; consuming app installs it in one
step and uses it without the engine present.

**Independent Test**: Copy generated plugin to an isolated directory with no `ds-guard/`
present; load with `claude --plugin-dir ./acme-design-system`; run `/dsguard:check` →
works without error.

- [ ] T035 [US8] Add self-containment test to `tests/unit/generate.test.mjs` — verify generated plugin directory contains: `checker.mjs` (copy, not symlink), `checker-config.json`, `skills/<name>-design-system.md`, `hooks/ui-gate.md`, `.claude-plugin/plugin.json`; no paths referencing `ds-guard/` engine directory

**Checkpoint**: US8 independently testable — generated plugin works with engine absent.

---

## Phase 11: User Story 9 — Authoritative Checking (Priority: P3)

**Goal**: When `tokenSetComplete: true`, a value that looks like a valid token but isn't
defined is a hard failure (ERROR), not an advisory (warn).

**Independent Test**: Set `tokenSetComplete: true` in fixture; run checker on value matching
token format but absent from `approvedColors` → `ERROR` severity; with `tokenSetComplete:
false` on same file → `warn` severity.

- [ ] T036 [P] [US9] Create `tests/fixtures/known-bad/components/AuthoritativeBad.tsx` — component using a value that matches token naming convention but is not in the permitted set (e.g. `color.brand.coral` when only `color.brand.teal` is defined)
- [ ] T037 [US9] Add authoritative-mode tests to `tests/unit/checker.test.mjs` — `tokenSetComplete: false` + undefined-but-plausible value → `warn`; `tokenSetComplete: true` + same value → `ERROR`; conforming value always passes in both modes (depends on T026, T036)

**Checkpoint**: US9 independently testable — authoritative mode enforces hard failures correctly.

---

## Phase 12: Polish & Cross-Cutting Concerns

**Purpose**: Multi-system routing, documentation, and end-to-end validation.

- [ ] T040 Write `ds-guard/README.md` — engine plugin usage (install, init, generate, check, review), key limits (static analysis only, freeformRules advisory)
- [ ] T041 Run `quickstart.md` validation scenarios end-to-end (Scenarios 1–7) and confirm all pass
- [ ] T042 [P] Add performance test to `tests/unit/checker.test.mjs` — generate a fixture of 200 `.tsx` files, run checker, assert wall-clock completion under 5 seconds (NFR-002); documents the measurable performance bound from plan.md

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — start immediately
- **Foundational (Phase 2)**: Depends on Phase 1 — BLOCKS all user stories; includes T038/T039 (multi-system routing, FR-001b MUST)
- **US1 (Phase 3)**: Depends on Phase 2 — no US dependencies
- **US2 (Phase 4)**: Depends on Phase 2 — no US dependencies; can run in parallel with US1 after Phase 2
- **US3 (Phase 5)**: Depends on Phase 2 and US2 (uses generated checker-config.json)
- **US4 (Phase 6)**: Depends on US2 (extends generate.mjs and guidance-skill template)
- **US5 (Phase 7)**: Depends on US2 (extends generate.mjs tests)
- **US6 (Phase 8)**: Depends on US2 (extends generate.mjs and gate-hook template)
- **US7 (Phase 9)**: Depends on US4 (uses guidance skill structure from generated plugin)
- **US8 (Phase 10)**: Depends on US2 (validates generate.mjs output)
- **US9 (Phase 11)**: Depends on US3 (extends checker.mjs and its tests)
- **Polish (Phase 12)**: Depends on US3 and US5 completion; T042 (perf test) depends on T024

### User Story Dependencies

- **US1** (P1): Independent after Phase 2
- **US2** (P1): Independent after Phase 2; can run parallel to US1
- **US3** (P1): Depends on US2 (needs generated checker-config.json fixture)
- **US4** (P2): Depends on US2 (extends generation)
- **US5** (P2): Depends on US2 (extends generate tests)
- **US6** (P2): Depends on US2 (extends generation)
- **US7** (P3): Depends on US4 (guidance skill must exist with trigger structure)
- **US8** (P3): Depends on US2 (self-containment of generated plugin)
- **US9** (P3): Depends on US3 (extends checker)

### Within Each User Story

- Fixture tasks marked [P] run in parallel
- Tests written before implementation (see phase headers)
- `validate-definition.mjs` and `checker.mjs` skeleton (Phase 2) before any story
- `generate.mjs` (T019) before commands that wrap it (T020)
- All template completion tasks [P] before `generate.mjs` (T019)

### Parallel Opportunities

- T003 and T004 parallel (Phase 1)
- T005, T006, T007, T038 partially parallel (Phase 2: T006/T007/T038 parallel; T005 independent; T039 after T038)
- T008, T009, T010 parallel (US1 fixtures)
- T014, T015 parallel (US2 fixtures)
- T016, T017, T018 parallel (US2 templates — all before T019)
- T022, T023 parallel (US3 fixtures)
- T036 parallel within US9
- T040, T041, T042 parallel (Polish)

---

## Parallel Example: User Story 3 (US3)

```
# Launch fixture creation in parallel:
Task: "Create tests/fixtures/known-bad/components/BadButton.tsx"    → T022
Task: "Create tests/fixtures/known-good/components/GoodButton.tsx"  → T023

# Then implement checker (T024 depends on T007 from Phase 2)
Task: "Complete ds-guard/scripts/checker.mjs all rule-class checks" → T024

# Then command + tests (T025, T026 depend on T024)
Task: "Implement ds-guard/commands/check.md"                        → T025
Task: "Write tests/unit/checker.test.mjs"                           → T026
```

---

## Implementation Strategy

### MVP First (US1 + US2 + US3 Only)

1. Complete Phase 1: Setup (T001–T004)
2. Complete Phase 2: Foundational (T005–T007) — CRITICAL
3. Complete Phase 3: US1 (T008–T013)
4. **STOP and VALIDATE**: Maintainer can scaffold and validate a definition
5. Complete Phase 4: US2 (T014–T021)
6. **STOP and VALIDATE**: Maintainer can generate a complete per-system plugin
7. Complete Phase 5: US3 (T022–T026)
8. **STOP and VALIDATE**: Run Quickstart Scenarios 1–5 — checker passes/fails correctly

### Incremental Delivery

1. Setup + Foundational → infrastructure ready
2. US1 → definition scaffolding working (demo: `dsguard:init`)
3. US2 → generation working (demo: `dsguard:generate`)
4. US3 → checking working (demo: `dsguard:check` PASS/FAIL)
5. US4–US6 → on-demand guidance, drift-free regen, automatic gate
6. US7–US9 → review, distribution, authoritative mode

### MVP Scope Summary

P1 tasks (MVP): T001–T026, T038–T039 (28 tasks across Phases 1–5; routing promoted to Foundational)
P2 tasks: T027–T033 (7 tasks across Phases 6–8)
P3 tasks: T034–T037 (4 tasks across Phases 9–11)
Polish: T040–T042 (3 tasks)

---

## Notes

- [P] tasks = different files, no dependency conflicts — safe to run in parallel
- [US#] label maps each task to its user story for traceability to spec acceptance scenarios
- All test tasks write to `tests/unit/` and use `node:test` (no additional test framework)
- Fixture tasks create files that are checked into source control (deterministic test inputs)
- T019 (`generate.mjs`) is the most complex single task — consider splitting at implementation time if needed
- Commit after each phase checkpoint; validate story independently before advancing
