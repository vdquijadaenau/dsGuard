# Research: DS-Guard — Design System Enforcement Engine

**Branch**: `001-ds-guard-engine` | **Date**: 2026-06-08

## Key Decisions

### 1. Plugin Platform

**Decision**: Claude Code plugins (`.claude-plugin/plugin.json` manifest; components at plugin
root) for both the engine and the generated per-system artifact.

**Rationale**: The user guide and PRD explicitly specify Claude Code plugins. This is the
native distribution and runtime mechanism for skills, commands, hooks, and agents in the
Claude Code ecosystem. It provides built-in on-demand loading (skill metadata always present,
body loaded when triggered) which directly satisfies FR-005.

**Alternatives considered**:
- Standalone CLI tool: No native agent integration; does not satisfy on-demand guidance (FR-005)
- VS Code extension: Platform-specific; does not integrate with agent workflow

---

### 2. Definition Format

**Decision**: DTCG (Design Tokens Community Group) W3C format for token values (JSON files);
a small JSON schema (`rules.json`) for enforceable policy; markdown for free-form rules and
per-component contracts.

**Rationale**: DTCG is the emerging standard for design tokens; it is tool-agnostic and
supported by Style Dictionary, Theo, and Figma tokens. Using it as the value format means
maintainers who already have DTCG tokens do not re-enter values (satisfying US1 scenario 2).
The separate `rules.json` keeps values and policy cleanly separated and independently
versioned. Markdown for free-form rules and contracts requires no additional tooling.

**Alternatives considered**:
- YAML for tokens: DTCG is JSON by spec; converting YAML → DTCG adds a transform step
- Single combined file: Mixes values and policy, making either harder to evolve independently
- Custom DSL: Higher implementation and learning cost with no ecosystem benefit

---

### 3. Checker Architecture

**Decision**: Refactor the Daybreak prototype checker: generic invariants (framework keyword
lists, default palette names, scan patterns) stay in code; per-system permitted sets (approved
colours, type scale, shadows, radius, fonts, casing, alignment bans, arbitrary allowlist) move
to a loaded `checker-config.json`; each check is conditional on the rule's presence in the
config; `tokenSetComplete: true` switches advisory findings to hard failures (FR-012).

**Rationale**: The prototype already works; generalising it is lower risk than building a
new checker. The separation of generic invariants (code) from per-system sets (config) satisfies
Constitution Principles I and IV: the engine contains no design-system values; the config
contains only the generated system's values.

**Alternatives considered**:
- AST-based parser: More precise but high implementation cost; text-pattern scanning covers
  the majority of real-world violations and is easier to extend
- CSS-in-JS specific parsers: Too narrow; the checker must handle `.tsx`, `.css`, `.js`, and
  React Native StyleSheet source

---

### 4. Generation Mechanism

**Decision**: Template-fill generation: each template file uses `{{TOKEN}}` placeholders; the
generator reads the definition, extracts values, and performs substitution to produce the
per-system plugin files. No external templating library; simple `String.replace()` or a
minimal implementation.

**Rationale**: Simple, zero-dependency, auditable. Template files are plain text — the
guidance skill template is markdown, the config template is JSON with placeholders. This makes
the generation step transparent and easy to test for idempotency (same input → same output).

**Alternatives considered**:
- Mustache/Handlebars: Adds dependency; overkill for the number of template files
- Code generation via AST manipulation: Far higher complexity than needed

---

### 5. Style Dictionary Integration (Optional Path)

**Decision**: Style Dictionary integration is optional. When a `sd.config.json` exists in the
definition directory, the generator runs a Style Dictionary build first and uses its output
to populate `checker-config.json`'s permitted sets. This is what enables `tokenSetComplete`
to be meaningful — the permitted set is derived mechanically from the canonical source.

**Rationale**: This satisfies FR-012 (authoritative checking) without making Style Dictionary
a hard dependency. Maintainers who already use Style Dictionary get zero-extra-work authoritative
checking; those who don't can still use DS-Guard with manually-specified permitted sets.

---

### 6. Multi-System Routing

**Decision**: `ds-guard.config.json` at the consuming project root maps path globs to system
names. The checker reads this file at startup; first matching glob wins; files matching no
glob are skipped without error.

**Rationale**: Path-glob routing is the familiar pattern (mirrors ESLint `overrides`, tsconfig
`include`). No per-file annotation means the consuming app's source files stay clean. First-
match semantics are predictable and auditable.

**Alternatives considered**:
- Per-file annotation: Pollutes source files; error-prone; harder to bulk-migrate
- Directory convention: Too rigid; real projects rarely have clean per-system directory splits

---

### 7. Distribution (Copy-In Script)

**Decision**: The generated per-system plugin directory is distributed as a directory copy.
Maintainers copy/share the generated `<system-name>/` directory; app developers drop it into
their project root (or a `plugins/` directory) and load it with `claude --plugin-dir`.

**Rationale**: No registry dependency; works with any file-sharing mechanism (git submodule,
zip, internal artifact store). The per-system plugin is self-contained: a frozen checker copy
+ config + skill + hook. Satisfies FR-011 (engine absent at runtime) and FR-014 (one-step
adoption).

---

### 8. Reviewer Implementation

**Decision**: The reviewer (`/dsguard:review <component>`) is implemented as a Claude Code
agent command that spawns a fresh-context agent with the component source and the guidance
skill loaded. The agent produces specific feedback on unmeasurable qualities (hierarchy,
spacing rhythm, intent). The reviewer is explicitly not the agent that built the component.

**Rationale**: A fresh-context agent cannot hallucinate agreement with its own prior output.
Satisfies FR-010 (independent review) and the constitution's Principle II (model judgment as
explicit last-resort, clearly labelled).
