# DS-Guard — User Guide

> Written as if DS-Guard already exists, so you can see the intended experience. Commands use
> real Claude Code plugin mechanics; exact names may shift during implementation.

DS-Guard keeps AI-agent-built UI faithful to a design system. You describe a design system once,
as data; DS-Guard generates a system-specific guidance skill (so the agent knows the rules) and a
deterministic checker (so violations are caught automatically). It ships no design system of its
own — you bring the design system; DS-Guard enforces it.

## Concepts in one minute

- **Engine** (`ds-guard`) — the reusable machine. You install it once. It generates and validates.
- **Definition** — your design system as data: tokens (values) + `rules.json` (policy) + optional
  per-component notes. Lives in your design system's repo.
- **Per-system package** (e.g. `acme-design-system`) — what the engine generates from a
  definition: a specific guidance skill + a self-contained checker. Apps install this, not the
  engine.

Two audiences below: **maintainers** create and publish enforcement; **app developers** consume it.

---

## Part 1 — For design-system maintainers

### 1. Install the engine (once)

```bash
/plugin marketplace add your-org/claude-plugins
/plugin install ds-guard@your-org
# or, while developing the engine itself:
claude --plugin-dir ./ds-guard
```

### 2. Scaffold a definition

In your design system's repo:

```bash
/dsguard:init acme
```

This creates:

```
design/
├── tokens/            # design values as DTCG tokens
│   ├── primitives.json
│   └── semantic.json
├── rules.json         # the enforceable policy
└── references/        # optional per-component contracts (markdown)
```

### 3. Fill in the definition

**Tokens** — record your values, or point at an existing token source if you have one. Use the
semantic layer (named by intent) for anything components reference.

**`rules.json`** — the policy the checker enforces. Start minimal; only include what applies:

```json
{
  "name": "acme",
  "casing": "sentence",
  "textAlign": { "banned": ["justify"], "centerOnlyShort": true },
  "type": { "scaleOnly": true, "bodyMinPx": 16 },
  "shadows": { "policy": "allowlist", "allowed": ["sm", "md"] },
  "radius": { "allowed": ["sm", "md", "lg", "full"] },
  "fonts": { "ui": "sans", "editorial": "serif",
             "editorialContexts": ["article body", "marketing hero"] },
  "arbitraryAllowlist": ["max-w-[72ch]"],
  "freeformRules": "Brand teal is fill-only; never body text. Status colour must travel with an icon + label.",
  "tokenSetComplete": true
}
```

Anything the schema can't express goes in `freeformRules` (the agent reads it; the checker can't
enforce it) or as a `references/<component>.md` contract.

Set `tokenSetComplete: true` once your token list is authoritative — that turns
"looks-like-a-token-but-undefined" findings from advisories into hard failures.

### 4. Generate the enforcement package

```bash
/dsguard:generate
```

Produces `acme-design-system/`: a specific guidance skill, a self-contained checker, its config,
the gate hook, and a plugin manifest. Re-run any time the definition changes — the outputs are
regenerated, never hand-edited, so they can't drift from the definition.

### 5. Test locally

```bash
claude --plugin-dir ./acme-design-system
/dsguard:check examples/      # run the checker over sample markup
```

### 6. Publish for the team

```bash
/plugin marketplace add your-org/design-systems
# acme-design-system now appears in the marketplace for apps to install
```

### 7. Update & version

When the design changes: edit the definition, bump the version, `/dsguard:generate`, republish.
Apps adopt the new version deliberately (a normal plugin update), so nothing changes under them
silently.

---

## Part 2 — For app developers

### 1. Install the design system's package

```bash
/plugin install acme-design-system@your-org
```

You do **not** need the engine — the package is self-contained.

### 2. Build UI as usual

The guidance skill triggers automatically when you do UI work. It carries only Acme's approved
vocabulary and rules, and it loads on demand — it isn't sitting in context the rest of the time.
You build; the agent composes from the approved tokens.

### 3. Read the checker's output

The checker runs automatically after UI edits (and on demand). Findings come in two severities:

- **ERROR** — a hard violation (a raw value, an off-scale size, a disallowed shadow, a value
  outside the system). Blocks "done"; fix it.
- **warn** — an advisory (a plausible-but-undefined value, or something needing human eyes, like
  whether an editorial font is really being used editorially). Review, don't necessarily block.

Run it yourself any time:

```bash
/dsguard:check src
```

### 4. The automatic gate

If the gate hook is enabled, the checker runs when the agent finishes editing UI and a hard
violation blocks completion — so drift can't slip through because someone forgot to check.

### 5. Request a subjective review

For things the checker can't measure — visual hierarchy, spacing rhythm, "does this match intent":

```bash
/dsguard:review Button
```

This runs an independent reviewer (fresh context, not the thing that built the component) and
returns specific feedback. Treat it as a second opinion, not a gate — it's the least precise layer.

---

## Command reference

| Command | Who | Does |
|---|---|---|
| `/dsguard:init <name>` | Maintainer | Scaffold a definition (`design/tokens`, `rules.json`, `references/`) |
| `/dsguard:generate` | Maintainer | Generate the per-system guidance skill + checker package |
| `/dsguard:check <path>` | App dev | Run the deterministic checker; report findings + pass/fail |
| `/dsguard:review <component>` | App dev | Independent review of unmeasurable qualities |

---

## Known limits (be realistic)

- **The checker is static.** It reads markup, not rendered pixels — it can't judge hierarchy,
  rhythm, or whether an editorial font is contextually correct. Use the reviewer and visual
  regression for that.
- **A truly novel pattern may pass silently.** To avoid false alarms, the checker skips what it
  can't classify. Generating its permitted set from an authoritative token list
  (`tokenSetComplete: true`) shrinks this gap to near zero.
- **`freeformRules` are advisory.** The agent is told them; the checker can't enforce them. The
  more of your policy you can express in the schema, the more becomes a hard gate.
- **The schema is intentionally small.** If a rule doesn't fit, that's expected — use the
  free-form section rather than forcing it, and only ask for a schema addition once the same rule
  shows up across several design systems.
