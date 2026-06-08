# Feature Specification: DS-Guard — Design System Enforcement Engine

**Feature Branch**: `001-ds-guard-engine`

**Created**: 2026-06-08

**Status**: Draft

**Input**: User description: "A generic engine that keeps AI-agent-built UI faithful to any
design system by turning the system's data (tokens + rules) into a specific enforcement skill
and a deterministic checker."

## Problem Statement

AI coding agents build UI by re-deriving design choices from prose each time, so output drifts
from the intended design — wrong colours, off-scale type, inconsistent spacing — and correcting
the drift costs time and effort. Teams need a way to keep agent-built UI faithful to a design
system, that loads design guidance only when relevant, and that verifies the result rather than
trusting the agent's self-assessment. Doing this by hand for each design system is repetitive
and itself becomes a source of drift.

## Goals

- Let a design-system owner define their system once, as data, and get automatic enforcement.
- Catch design drift deterministically, with clear pass/fail, before work is considered done.
- Keep design guidance out of the agent's working context until UI work is actually happening.
- Eliminate hand-written, per-system enforcement and the drift it causes.

## Personas

- **Maintainer** — owns a design system; defines it and publishes enforcement for it.
- **App developer** — builds an app on a given design system using a coding agent.
- **Coding agent** *(system actor)* — generates/edits UI and is steered and checked by DS-Guard.

## Clarifications

### Session 2026-06-08

- Q: What format does the design-system definition file use? → A: JSON — DTCG format for design token values (primitives.json, semantic.json); JSON Schema for the rules policy file (rules.json). Note: DTCG is a W3C JSON specification; YAML is not used.
- Q: How does the engine route a file/component to the correct system when multiple systems are in play? → A: Path globs in a top-level routing manifest
- Q: What happens when a definition has missing required parts or conflicting rules? → A: Hard error — generation halts, emits diagnostics listing every problem, no artifacts produced
- Q: How does the system detect that "UI work is happening" to trigger on-demand guidance? → A: Prompt keyword matching — the guidance artifact embeds a trigger summary with keywords; the agent loads full guidance when an incoming prompt matches
- Q: What does the checker analyse — static source files, compiled output, or both? → A: Static source files only (`.tsx`, `.ts`, `.js`, `.css`, React Native StyleSheet source before compilation)

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Define a Design System as Data (Priority: P1)

As a maintainer, I want to describe my design system as a single definition of values and rules,
so that there is one machine-readable source of truth.

**Why this priority**: The definition is the foundation of all other stories. Without it,
nothing else can function. This is the entry point for every maintainer.

**Independent Test**: A maintainer can scaffold a definition file, fill it with values (colours,
type scale, spacing, radius, elevation, motion) and rules, and verify it is valid — without
running any other DS-Guard command.

**Acceptance Scenarios**:

1. **Given** a new design system, **When** I scaffold a definition, **Then** I get a structured
   place to record design values (colour, type scale, spacing, radius, elevation, motion) and
   usage rules.
2. **Given** an existing set of design values, **When** I point the definition at them, **Then**
   I do not have to re-enter the values by hand.

---

### User Story 2 — Generate Enforcement from the Definition (Priority: P1)

As a maintainer, I want to generate a system-specific guidance artifact and a checker from the
definition, so that I never hand-write enforcement per system.

**Why this priority**: Generation is the core engine output. If generation works, the system
delivers its primary promise.

**Independent Test**: Starting from a complete definition, a maintainer can run generation and
receive a guidance artifact and a checker, both containing only that system's vocabulary.

**Acceptance Scenarios**:

1. **Given** a complete definition, **When** I run generation, **Then** I receive a guidance
   artifact containing only that system's approved vocabulary and rules, plus a checker
   configured for it.
2. **Given** I change the definition, **When** I regenerate, **Then** both artifacts reflect
   the change with no manual edits.

---

### User Story 3 — Catch Drift Deterministically (Priority: P1)

As an app developer, I want a checker that flags any use of a value or pattern not permitted
by the design system, so that violations are caught automatically rather than by eye.

**Why this priority**: Deterministic checking is the verification side of the engine's value
proposition. Without it, the guidance artifact has no hard guarantee.

**Independent Test**: Given a UI source file with known-bad values and a checker, the checker
can be run standalone and must report every violation with its location and an overall pass/fail.

**Acceptance Scenarios**:

1. **Given** UI source that uses a disallowed value (e.g. a raw colour, an off-scale text size),
   **When** I run the checker, **Then** each violation is reported with its location and an
   unambiguous overall pass/fail.
2. **Given** UI source that fully conforms, **When** I run the checker, **Then** it reports pass
   with no false alarms on legitimate, design-system-neutral usage.

---

### User Story 4 — On-Demand Guidance (Priority: P2)

As an app developer, I want the design guidance to reach the agent only when UI work is
detected, so that it doesn't occupy context the rest of the time.

**Why this priority**: Context efficiency is a quality-of-life and cost concern, not a
correctness one. Valuable but not blocking the core loop.

**Independent Test**: In a session performing non-UI work, the design guidance is absent from
resident context. When UI work begins, it loads automatically.

**Acceptance Scenarios**:

1. **Given** a session doing non-UI work, **When** I inspect resident context, **Then** design
   guidance is not loaded beyond a small always-present trigger summary.
2. **Given** I start building UI, **When** the agent engages, **Then** the relevant guidance
   becomes available automatically.

---

### User Story 5 — Regenerate on Change Without Drift (Priority: P2)

As a maintainer, I want regeneration to keep the guidance and checker exactly in step with the
definition, so the enforcement can never contradict the source.

**Why this priority**: Drift-free regeneration is a correctness guarantee that underpins trust
in the system over time. Valuable after the MVP is proven.

**Independent Test**: After updating a definition value, regenerating produces artifacts whose
vocabulary and permitted sets match the updated definition exactly.

**Acceptance Scenarios**:

1. **Given** an updated definition, **When** I regenerate, **Then** the guidance vocabulary and
   the checker's permitted set both match the new definition.

---

### User Story 6 — Automatic Gate (Priority: P2)

As an app developer, I want the checker to run at a defined point in my workflow automatically,
so I can't forget it.

**Why this priority**: Automation removes the human reliability requirement from checking.
Important for team consistency but not required for MVP validation.

**Independent Test**: With the gate enabled, completing a UI editing session triggers the
checker; a failure prevents marking the work as done.

**Acceptance Scenarios**:

1. **Given** the gate is enabled, **When** the agent finishes editing UI, **Then** the checker
   runs and a failure blocks "done".

---

### User Story 7 — Review What Can't Be Measured (Priority: P3)

As an app developer, I want an on-request review of qualities the checker can't measure
(hierarchy, spacing rhythm, intent), so subjective drift is also caught.

**Why this priority**: Subjective review is complementary to deterministic checking. Valuable
for high-quality output but not part of the core automated loop.

**Independent Test**: A developer can request a review of a built component and receive specific
feedback on qualities outside the checker's scope, produced independently of whatever built the
component.

**Acceptance Scenarios**:

1. **Given** a built component, **When** I request a review, **Then** I get specific feedback
   on qualities outside the checker's scope, produced independently of whatever built the
   component.

---

### User Story 8 — One-Step Distribution (Priority: P3)

As a maintainer, I want to package a system's enforcement so any app can adopt it in one step,
so adoption is frictionless.

**Why this priority**: Distribution affects ecosystem reach but not core functionality. An
artifact that works locally is already valuable; packaging is an adoption accelerant.

**Independent Test**: A generated artifact can be published and then installed by a consuming
app in one action, after which it functions without the engine present.

**Acceptance Scenarios**:

1. **Given** a generated artifact, **When** I publish it, **Then** an app can install it in
   one action and the artifact works without the engine present.

---

### User Story 9 — Authoritative Checking (Priority: P3)

As a maintainer, I want the checker's permitted set derived from the canonical values, so a
plausible-but-undefined value is a hard failure rather than a soft warning.

**Why this priority**: Authoritative mode tightens the guarantee but requires maintainers to
confidently mark their value set complete. Useful once the workflow is established.

**Independent Test**: With the definition marked authoritative, the checker reports a hard
failure for a value that matches the format of a real value but is not in the defined set.

**Acceptance Scenarios**:

1. **Given** the definition's value set is marked authoritative, **When** the checker meets a
   value that looks valid but isn't defined, **Then** it reports a hard failure.

---

### Edge Cases

- **Invalid or incomplete definition** — generation halts with a hard error and a diagnostic
  listing every missing field and conflicting rule; no artifacts are produced until the
  definition is corrected and generation is re-run.
- **Novel value vs. typo** — when a value in source matches no entry in the permitted set,
  the checker reports it as a violation with its location; distinguishing a genuine novel
  value from a typo is the maintainer's responsibility (the checker does not guess intent).
  If the value set is marked authoritative, the finding is a hard failure; otherwise advisory.
- **Rule not expressible in the schema** — the maintainer routes it to the definition's
  free-form rules section; the guidance artifact conveys it to the agent as prose; the
  checker cannot enforce it mechanically (reviewer covers subjective assessment).
- **Definition changes mid-project** — existing components must be re-checked by re-running
  the checker against the updated artifacts; no automatic incremental re-check in v1.
- **Consuming app on an unsupported UI technology** — the checker analyses static source
  files for web (HTML/CSS/JS/TS) and React Native StyleSheet source; files for other
  platforms are outside scope and the checker MUST skip them without error.
- **Multiple design systems in one project** — the routing manifest maps file-path globs to
  system names; a file matching no glob is skipped by the checker; a file matching multiple
  globs uses the first match in manifest order.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001** The system MUST accept a design-system definition as JSON files comprising
  design values (colour, type scale, spacing, radius, elevation, motion) as DTCG-format
  token files, and usage rules as a JSON policy file (`rules.json`).
- **FR-001a** The system MUST validate the definition YAML against the schema at load time;
  any missing required field or conflicting rule MUST produce a hard error with a diagnostic
  listing every problem, and MUST halt generation with no artifacts produced.
- **FR-001b** When multiple design systems are configured for a project, the system MUST
  use a top-level routing manifest (path globs mapping file patterns to system names) to
  route each source file or component to the correct system definition.
- **FR-002** The system MUST generate, from a definition, a guidance artifact containing only
  that system's approved vocabulary and rules.
- **FR-003** The system MUST generate a checker that, given UI static source files
  (`.tsx`, `.ts`, `.js`, `.css`, React Native StyleSheet source before compilation), reports
  each use of a value or pattern not permitted by the definition, with file and location.
- **FR-004** The checker MUST classify findings as hard violations vs. advisories, and MUST
  emit an unambiguous overall pass/fail.
- **FR-005** The guidance artifact MUST be available to the agent on demand (only when UI work
  is detected), not resident at all times. Detection MUST use prompt keyword matching: the
  artifact MUST embed a compact trigger summary containing keywords and patterns; the agent
  loads the full guidance content when an incoming prompt matches.
- **FR-006** The system MUST regenerate both artifacts from an updated definition with no
  manual editing of the outputs.
- **FR-007** The system MUST be able to run the checker automatically at a defined point in the
  build workflow and surface failures there.
- **FR-008** The system MUST NOT embed any specific design system's values or rules; all such
  content MUST originate from a supplied definition.
- **FR-009** The definition MUST be able to include free-form rules that the guidance artifact
  conveys to the agent even when the checker cannot enforce them mechanically.
- **FR-010** The system SHOULD provide a separate, on-request review of qualities the checker
  cannot measure, produced independently of the artifact under review.
- **FR-011** A generated per-system artifact MUST function without the generator present.
- **FR-012** When a definition's value set is marked authoritative, the checker MUST treat a
  plausible-but-undefined value as a hard violation; otherwise as an advisory.
- **FR-013** The checker MUST NOT flag values or patterns that are legitimate and
  design-system-neutral (false positives MUST be kept near zero).
- **FR-014** The system MUST support one-step adoption of a per-system artifact by a consuming
  app via a **copy-in script** (a single self-contained file dropped into the consuming repo,
  requiring no registry or toolchain dependency beyond the agent runtime).

### Non-Functional Requirements

- **NFR-001 Determinism** — identical inputs MUST yield identical checker results.
- **NFR-002 Performance** — checking a typical project MUST complete in seconds.
- **NFR-003 Portability** — a per-system package MUST be self-contained and technology-light
  for the consumer.
- **NFR-004 Maintainability** — the rule schema MUST stay minimal and additive; new rules are
  promoted into the structured schema only after recurring across multiple distinct systems.
- **NFR-005 Safety of adoption** — enabling enforcement MUST NOT silently change app behaviour
  beyond surfacing findings.

### Key Entities *(data involved)*

- **Design-System Definition** — the per-system data stored as JSON files: DTCG token files
  for values + `rules.json` for policy + optional per-component contracts + optional free-form
  rules.
- **Value set** — colours, type scale, spacing, radius, elevation, motion.
- **Rule set** — the enforceable policy (casing, banned alignments, allowed shadows/radii,
  type policy, font roles, permitted exceptions).
- **Routing manifest** — a top-level JSON config file (`ds-guard.config.json`) mapping
  file-path globs to system names; used when multiple design systems are active in a project.
- **Guidance artifact** — the system-specific, on-demand instructions given to the agent;
  includes a compact trigger summary with keywords/patterns that activate full guidance load.
- **Checker** — the deterministic static analyser + its per-system configuration; operates
  on source files before compilation (`.tsx`, `.ts`, `.js`, `.css`, RN StyleSheet source).
- **Engine** — the generic machine that produces the artifacts from a definition.
- **Per-system package** — the self-contained, distributable enforcement for one design system.
- **Reviewer** — the independent, on-request judge of unmeasurable qualities.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-1** A maintainer with an existing value set produces a working guidance artifact and
  checker **without writing any enforcement code**.
- **SC-2** On the covered rule classes, the checker has **zero false negatives** against a
  known-bad fixture and **near-zero false positives** against a known-good fixture.
- **SC-3** Design guidance imposes only a small constant context cost at rest (a trigger
  summary) and loads fully only when UI work begins.
- **SC-4** Regenerating after a definition change requires **zero manual edits** to the
  outputs.
- **SC-5** A consuming app adopts a system's enforcement in **one step**, and it runs with the
  engine absent.
- **SC-6** Time for a maintainer to go from an existing value set to a passing check on a
  sample component is **under 15 minutes** (assumption: reasonable upper bound for a
  maintainer familiar with their value set; see Assumptions).

## Out of Scope

- Being or replacing a design system (DS-Guard enforces; it does not design).
- Generating visual design or components.
- Full visual-regression image diffing and its baseline tooling (complementary, separate tool).
- Importing from external design tools (e.g. Figma, Storybook).
- Non-web targets beyond **web (HTML/CSS/JS/TS) and React Native** — both are in scope for
  v1; other platforms (Flutter, etc.) are deferred.

## Assumptions

- SC-6 target of 15 minutes is a reasonable upper bound for a maintainer who already has their
  value set in a structured form; no user research to confirm — mark for validation.
- Multiple design systems per project are supported; routing is via path-glob manifest.
- Definition files use JSON format: DTCG for token values (`tokens/primitives.json`,
  `tokens/semantic.json`) and JSON Schema for the rules policy (`rules.json`). The engine
  validates both at load time with hard errors.
- Target platforms for v1: web (HTML/CSS/JS/TS) and React Native. Other platforms (Flutter,
  etc.) are deferred. The checker skips files for unsupported platforms without error.
- Distribution is via copy-in script — a single self-contained file; no package registry
  dependency required.
- The checker operates on static source files only; no compiled/runtime output analysis.
- On-demand guidance is triggered by prompt keyword matching using a trigger summary embedded
  in the guidance artifact; no file-system monitoring or agent hooks required.
- The engine's output format is text-based (markdown or structured text) so it is portable
  across agent runtimes without binary dependencies.
- The Daybreak prototype (`prototype/daybreak-design-system/`) serves as the reference test
  fixture only; no Daybreak-specific content enters the engine.
