# PRD — DS-Guard (generic design-system enforcement engine)
### Spec Kit–ready product requirements

> **What this is:** a drop-in PRD for building DS-Guard with Spec Kit. It is organized so each
> section feeds a specific Spec Kit phase. The feature spec (Section C) is deliberately
> technology-agnostic (WHAT/WHY); all technology (HOW) is isolated in Section D for the plan
> phase.
>
> **Scope of the product:** a reusable engine that turns any design system's *data* (tokens +
> rules) into a *specific* enforcement skill + a deterministic checker, so AI coding agents stay
> on-design. DS-Guard ships **no** design system of its own.

---

## A. How to drive this with Spec Kit

```
1. /speckit.constitution   ← paste Section B (Constitution)
2. /speckit.specify        ← paste Section C (Feature Specification)
3. /speckit.clarify        ← resolve the [NEEDS CLARIFICATION] markers in Section C
4. /speckit.plan           ← paste Section D (Technical Context)
5. /speckit.tasks
6. /speckit.analyze        ← confirm spec/plan/tasks agree and meet the constitution
7. /speckit.implement
```

Build the P1 user stories first — they are the MVP and each is independently shippable.

---

## B. Constitution (project principles)

1. **Engine, not a design system.** DS-Guard MUST contain no colours, fonts, sizes, or
   design rules of its own. Every piece of design content comes from a supplied definition.
   Nothing about any specific design system (including throwaway test systems) may leak into the
   engine or its schema.
2. **Determinism first.** Anything that can be checked deterministically MUST be. Model judgment
   is a fallback reserved for qualities that cannot be measured mechanically.
3. **Generated, never hand-maintained.** Per-system artifacts are produced from the definition,
   so they cannot drift from it. Regeneration requires no manual editing of the outputs.
4. **Specific output, generic machine.** Generated artifacts stay system-specific (so they
   trigger reliably and keep their vocabulary close at hand). Only the machine that produces them
   is generic.
5. **Minimal schema with an escape hatch.** The rule schema covers the common case; a free-form
   section always carries the long tail. Do not attempt to model every possible design rule.
6. **Decoupled runtime.** A consuming app uses a self-contained per-system artifact without the
   engine present.
7. **Separation of concerns.** Product intent (WHAT/WHY) lives in the spec; technology (HOW)
   lives in the plan. The spec stays technology-agnostic.
8. **Tests come from the spec.** Acceptance scenarios are the source of the test cases.

---

## C. Feature Specification  *(technology-agnostic — for `/speckit.specify`)*

### C.1 Problem statement

AI coding agents build UI by re-deriving design choices from prose each time, so output drifts
from the intended design — wrong colours, off-scale type, inconsistent spacing — and correcting
the drift costs time and effort. Teams need a way to keep agent-built UI faithful to a design
system, that loads design guidance only when relevant, and that verifies the result rather than
trusting the agent's self-assessment. Doing this by hand for each design system is repetitive and
itself becomes a source of drift.

### C.2 Goals

- Let a design-system owner define their system once, as data, and get automatic enforcement.
- Catch design drift deterministically, with clear pass/fail, before work is considered done.
- Keep design guidance out of the agent's working context until UI work is actually happening.
- Eliminate hand-written, per-system enforcement and the drift it causes.

### C.3 Personas

- **Maintainer** — owns a design system; defines it and publishes enforcement for it.
- **App developer** — builds an app on a given design system using a coding agent.
- **Coding agent** *(system actor)* — generates/edits UI and is steered and checked by DS-Guard.

### C.4 User stories (prioritized)

#### P1 — MVP (the core value; each independently shippable)

**US1 — Define a design system as data.**
As a maintainer, I want to describe my design system as a single definition of values and rules,
so that there is one machine-readable source of truth.
- *Given* a new design system, *When* I scaffold a definition, *Then* I get a structured place to
  record design values (colour, type scale, spacing, radius, elevation, motion) and usage rules.
- *Given* an existing set of design values, *When* I point the definition at them, *Then* I do not
  have to re-enter the values by hand.

**US2 — Generate enforcement from the definition.**
As a maintainer, I want to generate a system-specific guidance artifact and a checker from the
definition, so that I never hand-write enforcement per system.
- *Given* a complete definition, *When* I run generation, *Then* I receive a guidance artifact
  containing only that system's approved vocabulary and rules, plus a checker configured for it.
- *Given* I change the definition, *When* I regenerate, *Then* both artifacts reflect the change
  with no manual edits.

**US3 — Catch drift deterministically.**
As an app developer, I want a checker that flags any use of a value or pattern not permitted by
the design system, so that violations are caught automatically rather than by eye.
- *Given* UI source that uses a disallowed value (e.g. a raw colour, an off-scale text size),
  *When* I run the checker, *Then* each violation is reported with its location and an unambiguous
  overall pass/fail.
- *Given* UI source that fully conforms, *When* I run the checker, *Then* it reports pass with no
  false alarms on legitimate, design-system-neutral usage.

#### P2

**US4 — On-demand guidance.**
As an app developer, I want the design guidance to reach the agent only when UI work is detected,
so that it doesn't occupy context the rest of the time.
- *Given* a session doing non-UI work, *When* I inspect resident context, *Then* design guidance
  is not loaded beyond a small always-present trigger summary.
- *Given* I start building UI, *When* the agent engages, *Then* the relevant guidance becomes
  available automatically.

**US5 — Regenerate on change without drift.**
As a maintainer, I want regeneration to keep the guidance and checker exactly in step with the
definition, so the enforcement can never contradict the source.
- *Given* an updated definition, *When* I regenerate, *Then* the guidance vocabulary and the
  checker's permitted set both match the new definition.

**US6 — Automatic gate.**
As an app developer, I want the checker to run at a defined point in my workflow automatically, so
I can't forget it.
- *Given* the gate is enabled, *When* the agent finishes editing UI, *Then* the checker runs and a
  failure blocks "done".

#### P3

**US7 — Review what can't be measured.**
As an app developer, I want an on-request review of qualities the checker can't measure (hierarchy,
spacing rhythm, intent), so subjective drift is also caught.
- *Given* a built component, *When* I request a review, *Then* I get specific feedback on
  qualities outside the checker's scope, produced independently of whatever built the component.

**US8 — One-step distribution.**
As a maintainer, I want to package a system's enforcement so any app can adopt it in one step, so
adoption is frictionless.
- *Given* a generated artifact, *When* I publish it, *Then* an app can install it in one action and
  the artifact works without the engine present.

**US9 — Authoritative checking.**
As a maintainer, I want the checker's permitted set derived from the canonical values, so a
plausible-but-undefined value is a hard failure rather than a soft warning.
- *Given* the definition's value set is marked authoritative, *When* the checker meets a value that
  looks valid but isn't defined, *Then* it reports a hard failure.

### C.5 Functional requirements

- **FR-001** The system MUST accept a design-system definition comprising design values (colour,
  type scale, spacing, radius, elevation, motion) and usage rules.
- **FR-002** The system MUST generate, from a definition, a guidance artifact containing only that
  system's approved vocabulary and rules.
- **FR-003** The system MUST generate a checker that, given UI source, reports each use of a value
  or pattern not permitted by the definition, with file and location.
- **FR-004** The checker MUST classify findings as hard violations vs. advisories, and MUST emit an
  unambiguous overall pass/fail.
- **FR-005** The guidance artifact MUST be available to the agent on demand (only when UI work is
  detected), not resident at all times.
- **FR-006** The system MUST regenerate both artifacts from an updated definition with no manual
  editing of the outputs.
- **FR-007** The system MUST be able to run the checker automatically at a defined point in the
  build workflow and surface failures there.
- **FR-008** The system MUST NOT embed any specific design system's values or rules; all such
  content MUST originate from a supplied definition.
- **FR-009** The definition MUST be able to include free-form rules that the guidance artifact
  conveys to the agent even when the checker cannot enforce them.
- **FR-010** The system SHOULD provide a separate, on-request review of qualities the checker
  cannot measure, produced independently of the artifact under review.
- **FR-011** A generated per-system artifact MUST function without the generator present.
- **FR-012** When a definition's value set is marked authoritative, the checker MUST treat a
  plausible-but-undefined value as a hard violation; otherwise as an advisory.
- **FR-013** The checker MUST NOT flag values or patterns that are legitimate and design-system
  -neutral (i.e. keep false positives near zero).
- **FR-014** The system MUST support one-step adoption of a per-system artifact by a consuming
  app. *[NEEDS CLARIFICATION: distribution channel(s)?]*

### C.6 Key entities

- **Design-System Definition** — the per-system data: a value set + a rule set + optional
  per-component contracts + optional free-form rules.
- **Value set** — colours, type scale, spacing, radius, elevation, motion.
- **Rule set** — the enforceable policy (casing, banned alignments, allowed shadows/radii, type
  policy, font roles, permitted exceptions).
- **Guidance artifact** — the system-specific, on-demand instructions given to the agent.
- **Checker** — the deterministic verifier + its per-system configuration.
- **Engine** — the generic machine that produces the artifacts from a definition.
- **Per-system package** — the self-contained, distributable enforcement for one design system.
- **Reviewer** — the independent, on-request judge of unmeasurable qualities.

### C.7 Edge cases

- A definition is missing a required part, or contains internally conflicting rules.
- UI source uses a value that matches no list — genuinely novel vs. a typo of a real value.
- A design rule cannot be expressed in the schema (must route to free-form + reviewer).
- The definition changes mid-project; existing components must be re-checked.
- A consuming app targets a different UI technology than expected.
- More than one design system is in play in a single project. *[NEEDS CLARIFICATION: support
  several systems at once, or one per project?]*

### C.8 Success criteria (measurable)

- **SC-1** A maintainer with an existing value set produces a working guidance artifact + checker
  **without writing any enforcement code**.
- **SC-2** On the covered rule classes, the checker has **zero false negatives** against a known
  -bad fixture and **near-zero false positives** against a known-good fixture.
- **SC-3** Design guidance imposes only a small constant context cost at rest (a trigger summary)
  and loads fully only when UI work begins.
- **SC-4** Regenerating after a definition change requires **zero manual edits** to the outputs.
- **SC-5** A consuming app adopts a system's enforcement in **one step**, and it runs with the
  engine absent.
- **SC-6** Time for a maintainer to go from an existing value set to a passing check on a sample
  component is under **[NEEDS CLARIFICATION: target minutes]**.

### C.9 Non-functional requirements

- **Determinism** — identical inputs yield identical checker results.
- **Performance** — checking a typical project completes in seconds.
- **Portability** — a per-system package is self-contained and technology-light for the consumer.
- **Maintainability** — the rule schema stays minimal and additive; new rules are promoted only
  after recurring across systems.
- **Safety of adoption** — enabling enforcement never silently changes app behaviour beyond
  surfacing findings.

### C.10 Out of scope

- Being or replacing a design system (DS-Guard enforces; it does not design).
- Generating visual design or components.
- Full visual-regression image diffing and its baseline tooling (complementary, separate).
- Importing from external design tools.
- Non-web targets, for the initial version. *[NEEDS CLARIFICATION: confirm web-only for v1.]*

---

## D. Technical Context  *(the HOW — for `/speckit.plan`; keep OUT of the spec)*

This section exists so `/speckit.plan` has the implementation constraints; do not paste it into
`/speckit.specify`.

- **Platform & packaging:** the engine and per-system artifacts are Claude Code plugins (a
  directory with a `.claude-plugin/plugin.json` manifest; components — skills, commands, hooks,
  agents, scripts — at the plugin root). Two plugins: the **engine** (`ds-guard`, build-time) and
  the **generated per-system** plugin (runtime, ships a frozen checker so the engine isn't needed
  to consume it).
- **Definition format:** values as DTCG design tokens; rules as a small JSON schema; free-form
  rules and per-component contracts as markdown.
- **Generation:** a template-fill step emits the system-specific guidance artifact and the
  checker configuration from the definition; optionally driven from a Style Dictionary build so
  the checker's permitted set is generated from the canonical tokens (this is what flips FR-012
  advisories into hard failures).
- **Checker:** the existing prototype checker (see `prototype/`), refactored from embedded
  per-system constants to a config it loads — generic invariants (default-palette names, framework
  keyword/size lists, scan rules) stay in code; per-system sets (approved colours, type scale,
  shadow/radius allow-lists, banned alignments, arbitrary allow-list) move to the config; checks
  become conditional on the rule's presence; `tokenSetComplete` selects the FR-012 behaviour.
- **On-demand loading & gate:** the guidance artifact is a skill (metadata always present,
  body/refs on demand); the automatic gate is a workflow hook that runs the checker and blocks on
  failure; the reviewer is an isolated, fresh-context agent.
- **Detailed design, effort, and risks:** see `ds-guard-implementation-plan.md` and the validator
  refactor notes in this bundle.

---

## E. Bundle cross-references

- `ds-guard-implementation-plan.md` — architecture, component breakdown, plugin layout, phased
  **effort estimate**, risks.
- `ds-guard-user-guide.md` — how maintainers and app developers use DS-Guard (written as if built).
- `design-system-token-pipeline.md` — background: the markdown→tokens→enforcement pipeline and the
  reasoning behind tokens-as-source-of-truth.
- `prototype/daybreak-design-system/` — the working prototype skill + checker that DS-Guard
  generalizes. **Reference/test only — not part of the engine.**
