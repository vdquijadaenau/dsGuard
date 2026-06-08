# Contract: `/dsguard:review <component>`

**Plugin**: per-system plugin (or engine plugin with `--system`)
**Audience**: App developer

## Purpose

Request an independent, on-demand review of UI qualities that the checker cannot measure
deterministically — visual hierarchy, spacing rhythm, contextual intent, editorial tone.
The reviewer is a fresh-context agent that has not seen the component being reviewed, so it
cannot rationalise prior decisions.

## Invocation

```
/dsguard:review <component> [--system <name>]
```

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `component` | string | Yes | — | Component name or file path to review (e.g. `Button`, `src/Button.tsx`) |
| `--system` | string | No | Implied by per-system plugin | System name. Required when invoked from the engine plugin directly. |

## Preconditions

- The guidance skill for the system is available (loaded from per-system plugin)
- The component file is accessible at the given path (resolved from project root if a name
  is given without a path)

## Behaviour

1. Locate the component source file
2. Load the system's guidance skill (approved vocabulary, rules, free-form rules, component
   contracts)
3. Spawn a **fresh-context agent** with:
   - The component source
   - The guidance skill content
   - The review prompt
4. The fresh-context agent produces specific, actionable feedback on:
   - Visual hierarchy — heading levels, size relationships, emphasis
   - Spacing rhythm — consistency of spacing choices relative to the scale
   - Contextual intent — whether font roles, colour choices, and patterns match their
     intended context (e.g. editorial font used in correct context)
   - Anything the checker flagged as `warn` but could not hard-gate
5. Feedback is returned to the app developer with clear attribution: "Independent review
   (not the agent that built this component)"

## Constraints

- The reviewer MUST NOT have access to the chat history of the session that built the component
- The reviewer MUST NOT see the checker's findings (it is independently assessing, not
  validating checker output)
- The reviewer produces observations, not a pass/fail gate — its output is advisory only
- The reviewer does NOT modify the component

## Output Format

```
## DS-Guard Review — <ComponentName> (<system>)

**Reviewer**: Independent agent (fresh context)

### Hierarchy
[Specific observations about visual hierarchy]

### Spacing Rhythm
[Specific observations about spacing choices]

### Contextual Intent
[Specific observations about whether patterns match their intended use]

### Other Observations
[Any additional subjective quality observations]

---
Note: This review covers qualities the checker cannot measure. For hard violations,
run /dsguard:check.
```

## Failure Outputs

| Condition | Message |
|-----------|---------|
| Component file not found | `[dsguard] Component not found: <component>. Try passing the full file path.` |
| Guidance skill not available | `[dsguard] No guidance skill found for system '<name>'. Is the per-system plugin installed?` |
