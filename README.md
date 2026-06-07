# DS-Guard — build bundle

Everything needed to start building **DS-Guard**, a generic engine that keeps AI-agent-built UI
faithful to *any* design system by turning the system's data (tokens + rules) into a specific
enforcement skill and a deterministic checker. The engine ships no design system of its own.

## Start here

1. **`PRD-ds-guard-speckit.md`** — the Spec Kit–ready PRD. Section A tells you exactly which part
   to paste into each Spec Kit command. This is your entry point for building right away.
2. **`ds-guard-implementation-plan.md`** — architecture, plugin layout, the phased **effort
   estimate** (~3–4 days MVP, ~6–9 days full), and risks. Feeds `/speckit.plan`.
3. **`ds-guard-user-guide.md`** — how maintainers and app developers use DS-Guard, written as if
   it already exists (real command flows).

## Background / reference

- **`design-system-token-pipeline.md`** — why tokens are the source of truth, the
  markdown→tokens→enforcement pipeline, and how it plugs into Spec Kit and OpenSpec.
- **`prototype/daybreak-design-system/`** — the working prototype (a guidance skill +
  `validate-tokens.mjs` checker) that DS-Guard generalizes. **Reference and test fixture only —
  not part of the engine.** The engine must contain no design-system-specific content.

## Suggested Spec Kit run

```
/speckit.constitution   ← PRD Section B
/speckit.specify        ← PRD Section C
/speckit.clarify        ← resolve the [NEEDS CLARIFICATION] markers
/speckit.plan           ← PRD Section D + implementation plan
/speckit.tasks
/speckit.analyze
/speckit.implement      ← build the P1 user stories first (the MVP)
```

## Two things to hold onto while building

- **Keep the engine clean.** No specific design system's values or rules belong in the engine or
  its schema. The Daybreak prototype is a test case, not a dependency.
- **Don't over-build the rule schema.** Cover the common case; route the long tail to free-form
  rules; promote a rule into the schema only after it recurs across several systems.
