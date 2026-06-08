---
description: Request an independent, fresh-context review of UI qualities the checker cannot measure.
---

# /dsguard:review <component>

Request an independent, on-demand review of the UI qualities a deterministic
checker cannot measure — visual hierarchy, spacing rhythm, contextual intent, and
editorial tone. The review is performed by a **fresh-context agent** that has not
seen this component or the conversation that built it, so it cannot rationalise
prior decisions.

The user invoked this command with the argument: `$ARGUMENTS`

## Usage

```
/dsguard:review <component> [--system <name>]
```

- `<component>` — component name or file path to review (e.g. `Button`,
  `src/Button.tsx`). Required.
- `--system <name>` — system name. Implied inside a per-system plugin; required
  when invoking from the engine plugin directly.

## What to do

1. **Locate the component source file.** If a bare name was given (e.g. `Button`),
   resolve it from the project root (e.g. `src/**/Button.tsx`). If it cannot be
   found, stop and report:
   `[dsguard] Component not found: <component>. Try passing the full file path.`

2. **Load the system's guidance skill** from the per-system plugin
   (`${CLAUDE_PLUGIN_ROOT}/skills/<system>-design-system.md`): approved
   vocabulary, enforceable rules, free-form rules, and any component contracts.
   If no guidance skill is available, stop and report:
   `[dsguard] No guidance skill found for system '<name>'. Is the per-system plugin installed?`

3. **Spawn a fresh-context agent** (via the Agent/Task tool, `subagent_type:
   general-purpose`) whose prompt contains ONLY:
   - the component source,
   - the guidance skill content, and
   - the review prompt below.

   The sub-agent MUST NOT receive the current session's chat history and MUST NOT
   be told what the checker found — it assesses independently, it does not validate
   checker output.

4. **Review prompt** to give the fresh-context agent:

   > You are an independent design reviewer. You have NOT built this component and
   > have no prior context. Using only the component source and the design-system
   > guidance provided, give specific, actionable observations on:
   > - **Hierarchy** — heading levels, size relationships, emphasis
   > - **Spacing Rhythm** — consistency of spacing relative to the scale
   > - **Contextual Intent** — whether font roles, colour choices, and patterns
   >   match their intended context (e.g. editorial font used only in editorial
   >   contexts)
   > - **Other Observations** — any additional subjective quality notes
   >
   > Produce observations, not a pass/fail verdict. Do not modify the component.

5. **Relay the sub-agent's feedback** to the developer in this exact format:

   ```
   ## DS-Guard Review — <ComponentName> (<system>)

   **Reviewer**: Independent agent (fresh context)

   ### Hierarchy
   [observations]

   ### Spacing Rhythm
   [observations]

   ### Contextual Intent
   [observations]

   ### Other Observations
   [observations]

   ---
   Note: This review covers qualities the checker cannot measure. For hard
   violations, run /dsguard:check.
   ```

## Constraints

- The reviewer MUST NOT have access to the chat history of the session that built
  the component.
- The reviewer MUST NOT see the checker's findings.
- The review is **advisory only** — observations, never a pass/fail gate.
- The reviewer does NOT modify the component.

## Preconditions

- The system's guidance skill is available (loaded from the per-system plugin).
- The component file is accessible (resolved from the project root if a bare name
  is given).
