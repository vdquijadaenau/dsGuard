<!--
SYNC IMPACT REPORT
==================
Version change: [CONSTITUTION_VERSION] (unversioned placeholder) → 1.0.0
Modified principles: All (initial fill — 8 principles replacing 5 placeholder slots)
Added sections:
  - I. Engine, not a Design System
  - II. Determinism First
  - III. Generated, Never Hand-Maintained
  - IV. Specific Output, Generic Machine
  - V. Minimal Schema with an Escape Hatch
  - VI. Decoupled Runtime
  - VII. Separation of Concerns
  - VIII. Tests Come from the Spec
  - Artifact Constraints (new operational section)
  - Development Workflow (new process section)
  - Governance
Removed sections: [SECTION_2_NAME], [SECTION_3_NAME] placeholder slots replaced with
  concrete sections above.
Templates requiring updates:
  ✅ .specify/templates/plan-template.md — Constitution Check gate reviewed; no structural
     changes required (gate reads from this file at plan time).
  ✅ .specify/templates/spec-template.md — Technology-agnostic; aligns with Principle VII.
  ✅ .specify/templates/tasks-template.md — Test-task pattern aligns with Principle VIII.
  ✅ README.md — Already documents the Spec Kit pipeline; no changes required.
Deferred TODOs: None — all placeholders resolved.
-->

# DS-Guard Constitution

## Core Principles

### I. Engine, not a Design System

DS-Guard MUST contain no colours, fonts, sizes, spacing values, or design rules of its own.
Every piece of design content MUST come from a supplied system definition. Nothing about any
specific design system — including throwaway test fixtures — may appear in the engine or its
schema.

**Rationale**: Any coupling between the engine and a particular design system makes the engine
non-generic and forces manual updates whenever design system values change.

### II. Determinism First

Anything that can be checked deterministically MUST be. Model judgment is a fallback reserved
exclusively for qualities that cannot be measured mechanically.

**Rationale**: Deterministic checks are reproducible, auditable, and free of hallucination risk.
Non-deterministic judgment MUST be confined to clearly-labelled, last-resort checks with explicit
justification for why a mechanical check is insufficient.

### III. Generated, Never Hand-Maintained

Per-system artifacts (enforcement skills, checker scripts) MUST be produced from the definition.
They MUST NOT be edited by hand. Regenerating an artifact from the same definition MUST require
no manual follow-up editing of the output.

**Rationale**: Hand edits drift from the definition and undermine the guarantee that the artifact
is a faithful, complete projection of the definition at any point in time.

### IV. Specific Output, Generic Machine

Generated artifacts MUST be system-specific — using the vocabulary, token names, and rules of
the target system — so they trigger reliably and stay readable. Only the generation engine is
generic.

**Rationale**: Generic artifacts are weaker enforcement tools. A token name that matches the
real system is unambiguous; a variable-interpolated placeholder is fragile and harder to debug.

### V. Minimal Schema with an Escape Hatch

The rule schema MUST cover the common case with typed, structured fields. A free-form rules
section MUST always exist to carry the long tail. Promoting a pattern into the structured schema
MUST be justified by recurrence across multiple distinct design systems — not by convenience for
a single one.

**Rationale**: Over-modelling the schema creates unnecessary complexity and coupling. The escape
hatch ensures no rule is unrepresentable, keeping the structured schema bounded and maintainable.

### VI. Decoupled Runtime

A consuming application MUST use a self-contained, per-system artifact. The engine MUST NOT be
present at enforcement runtime. Each artifact MUST be deployable as a standalone unit without
any engine dependency.

**Rationale**: Runtime coupling to the engine creates a distributed dependency and forces engine
upgrades to be coordinated with every consuming application simultaneously.

### VII. Separation of Concerns

Product intent (WHAT to build and WHY) MUST live in the spec. Technology decisions (HOW to
build it) MUST live in the plan. Specs MUST be technology-agnostic; implementation choices MUST
NOT appear in them.

**Rationale**: Mixing concerns makes specs brittle against technology changes and makes plans
difficult to evaluate for correctness independent of business requirements.

### VIII. Tests Come from the Spec

Acceptance scenarios defined in the spec are the authoritative source of test cases. Every test
MUST be traceable to a numbered acceptance scenario. An acceptance scenario with no corresponding
test MUST be treated as a compliance gap.

**Rationale**: Tests derived from specs keep the test suite aligned with declared intent and
prevent test growth that outpaces — or lags — the specified behavior.

## Artifact Constraints

- Generated artifacts MUST be idempotent: running the generator on the same definition twice
  MUST produce byte-identical output (excluding timestamps, if any are present).
- The definition schema MUST be versioned. A schema version MUST be recorded in every generated
  artifact so stale artifacts can be detected and flagged.
- Artifacts MUST NOT embed external URLs or remote dependencies. All enforcement logic MUST be
  self-contained within the artifact.
- Test fixtures referencing a specific design system (e.g., the Daybreak prototype) are
  reference-only. They MUST NOT be imported or referenced from engine source code.

## Development Workflow

Feature work follows the Spec Kit pipeline in strict order:

1. `/speckit-constitution` — establish or amend project principles (this file).
2. `/speckit-specify` — capture product intent; output MUST be technology-agnostic.
3. `/speckit-clarify` — resolve all `[NEEDS CLARIFICATION]` markers before planning.
4. `/speckit-plan` — produce the implementation plan; Constitution Check MUST pass before
   Phase 0 research begins, and MUST be re-checked after Phase 1 design.
5. `/speckit-tasks` — generate dependency-ordered tasks from plan + spec.
6. `/speckit-analyze` — cross-artifact consistency check before implementation.
7. `/speckit-implement` — execute tasks; P1 user stories (MVP) first.

A feature MUST NOT advance past the spec stage if it introduces engine-level design values
(violation of Principle I). Any task that hand-edits a generated artifact MUST be flagged as a
Principle III violation before the task is accepted.

## Governance

- This constitution supersedes all other project practices where they conflict.
- Amendments require: (a) a clear statement of the change and its rationale, (b) a version bump
  following the semantic versioning rules below, and (c) a propagation review across all
  dependent templates.
- **Version bump rules**:
  - MAJOR — backward-incompatible principle removal or fundamental redefinition.
  - MINOR — new principle, new mandatory section, or materially expanded guidance.
  - PATCH — clarifications, wording adjustments, or non-semantic refinements.
- Compliance review MUST occur at the Constitution Check gate in every feature plan.
- The "Constitution Check" section in `.specify/templates/plan-template.md` is the canonical
  gate; all feature plans MUST include a completed check before implementation begins.

**Version**: 1.0.0 | **Ratified**: 2026-06-08 | **Last Amended**: 2026-06-08
