import { test } from "node:test";
import assert from "node:assert/strict";
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  existsSync,
  rmSync,
  cpSync,
  lstatSync,
  readdirSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { generatePlugin } from "../../ds-guard/scripts/generate.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const GOOD_DEF = join(__dirname, "..", "fixtures", "known-good", "definition");

/** Make a throwaway temp directory; registered for cleanup by the caller. */
function tmp() {
  return mkdtempSync(join(tmpdir(), "dsguard-gen-"));
}

/** Read+parse the generated checker-config.json under an output dir. */
function readConfig(outDir) {
  return JSON.parse(readFileSync(join(outDir, "checker-config.json"), "utf8"));
}

test("generation from known-good fixture produces correct checker-config fields", () => {
  const work = tmp();
  try {
    const outDir = join(work, "out");
    const { name } = generatePlugin({ definitionDir: GOOD_DEF, outDir });
    assert.equal(name, "acme");

    const cfg = readConfig(outDir);
    assert.equal(cfg.systemName, "acme");
    assert.equal(cfg.schemaVersion, "1.0.0");
    assert.equal(cfg.tokenSetComplete, true);
    assert.equal(cfg.casing, "sentence");

    // Colors resolved from primitives + semantic aliases (dedup, sorted).
    assert.deepEqual(cfg.approvedColors, ["#0A7E8C", "#0B1F2A", "#FFFFFF"]);
    // Dimension tokens split by group into type scale vs spacing.
    assert.deepEqual(cfg.approvedTypeScale, ["16px", "24px"]);
    assert.deepEqual(cfg.approvedSpacing, ["16px", "4px", "8px"]);
    // radius.allowed names resolve to names + values.
    assert.ok(cfg.approvedRadius.includes("radius.sm"));
    assert.ok(cfg.approvedRadius.includes("4px"));
    // Pass-through fields.
    assert.deepEqual(cfg.bannedTextAlignments, ["justify"]);
    assert.equal(cfg.typePolicy.scaleOnly, true);
    assert.equal(cfg.typePolicy.bodyMinPx, 14);
    assert.equal(cfg.approvedFonts.ui, "font.sans");
    assert.ok(typeof cfg.freeformRules === "string" && cfg.freeformRules.length > 0);
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
});

test("unresolved {alias} tokens never leak into approved sets", () => {
  // Reproduces the init-stub case: a semantic alias points at a primitive the
  // maintainer has since removed/replaced, so it stays a `{…}` placeholder. It
  // must be dropped, not emitted as an approved literal value.
  const work = tmp();
  try {
    const def = join(work, "definition");
    mkdirSync(join(def, "tokens"), { recursive: true });
    writeFileSync(
      join(def, "rules.json"),
      JSON.stringify({ name: "myds", schemaVersion: "1.0.0" })
    );
    writeFileSync(
      join(def, "tokens", "primitives.json"),
      JSON.stringify({
        color: { brand: { teal: { $type: "color", $value: "#00897B" } } },
      })
    );
    // The alias target `color.brand.example` does not exist → unresolvable.
    writeFileSync(
      join(def, "tokens", "semantic.json"),
      JSON.stringify({
        color: { text: { primary: { $type: "color", $value: "{color.brand.example}" } } },
      })
    );

    const outDir = join(work, "out");
    generatePlugin({ definitionDir: def, outDir });
    const cfg = readConfig(outDir);

    assert.deepEqual(cfg.approvedColors, ["#00897B"], "only the resolved colour is approved");
    assert.ok(
      !cfg.approvedColors.some((c) => /^\{.+\}$/.test(c)),
      "no {alias} placeholder may appear in approvedColors"
    );
    // And it must not surface in the skill vocabulary either.
    const skill = readFileSync(join(outDir, "skills", "myds-design-system.md"), "utf8");
    assert.ok(!skill.includes("{color.brand.example}"), "placeholder absent from skill");
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
});

test("guidance skill contains the same approved vocabulary", () => {
  const work = tmp();
  try {
    const outDir = join(work, "out");
    generatePlugin({ definitionDir: GOOD_DEF, outDir });
    const skill = readFileSync(join(outDir, "skills", "acme-design-system.md"), "utf8");
    // Vocabulary from the config appears in the skill body.
    assert.match(skill, /#0A7E8C/);
    assert.match(skill, /## Approved Vocabulary/);
    assert.match(skill, /## Enforceable Rules/);
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
});

test("generated skill has a trigger structure derived from the definition (US4)", () => {
  const work = tmp();
  try {
    const outDir = join(work, "out");
    generatePlugin({ definitionDir: GOOD_DEF, outDir });
    const skill = readFileSync(join(outDir, "skills", "acme-design-system.md"), "utf8");

    // Frontmatter trigger block: keywords + summary are both present.
    assert.match(skill, /^---\n[\s\S]*?\ntrigger:\n[\s\S]*?\n---/);
    assert.match(skill, /\n {2}keywords:/);
    assert.match(skill, /\n {2}summary:/);

    // Keywords are non-empty and derived from the definition: a rule-class
    // keyword and a token-derived keyword both appear.
    const kwLine = skill.match(/\n {2}keywords:\s*(\[[^\]]*\])/);
    assert.ok(kwLine, "keywords line present");
    const keywords = JSON.parse(kwLine[1]);
    assert.ok(Array.isArray(keywords) && keywords.length > 0, "keywords non-empty");
    assert.ok(keywords.includes("acme"), "system name keyword present");
    assert.ok(keywords.includes("color"), "token-group keyword present");
    assert.ok(keywords.includes("teal"), "token-leaf keyword present");
    assert.ok(keywords.includes("radius"), "rule-class keyword present");

    // Summary is a single line referencing the system.
    const sumLine = skill.match(/\n {2}summary:\s*"([^"]*)"/);
    assert.ok(sumLine, "summary line present");
    assert.match(sumLine[1], /acme design system:/);

    // Body section present and contains approved vocabulary.
    assert.match(skill, /## Approved Vocabulary/);
    assert.match(skill, /#0A7E8C/);
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
});

test("idempotent: two runs are byte-identical except generatedAt", () => {
  const work = tmp();
  try {
    const a = join(work, "a");
    const b = join(work, "b");
    generatePlugin({ definitionDir: GOOD_DEF, outDir: a, now: new Date("2020-01-01T00:00:00.000Z") });
    generatePlugin({ definitionDir: GOOD_DEF, outDir: b, now: new Date("2026-06-08T12:00:00.000Z") });

    const stripTs = (s) => s.replace(/"generatedAt":\s*"[^"]*"/g, '"generatedAt":"<ts>"');

    const cfgA = stripTs(readFileSync(join(a, "checker-config.json"), "utf8"));
    const cfgB = stripTs(readFileSync(join(b, "checker-config.json"), "utf8"));
    assert.equal(cfgA, cfgB, "checker-config.json differs beyond generatedAt");

    const skillA = readFileSync(join(a, "skills", "acme-design-system.md"), "utf8");
    const skillB = readFileSync(join(b, "skills", "acme-design-system.md"), "utf8");
    assert.equal(skillA, skillB, "guidance skill is not byte-identical");

    const manA = stripTs(readFileSync(join(a, ".claude-plugin", "plugin.json"), "utf8"));
    const manB = stripTs(readFileSync(join(b, ".claude-plugin", "plugin.json"), "utf8"));
    assert.equal(manA, manB, "plugin.json differs beyond generatedAt");
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
});

test("regenerating after a definition change updates both artifacts with zero drift (US5)", () => {
  const work = tmp();
  try {
    // Work on a throwaway COPY of the fixture — never mutate the checked-in one.
    const def = join(work, "definition");
    cpSync(GOOD_DEF, def, { recursive: true });

    // Baseline generation.
    const base = join(work, "base");
    generatePlugin({ definitionDir: def, outDir: base });
    const baseCfg = readConfig(base);
    assert.ok(baseCfg.approvedColors.includes("#0A7E8C"), "baseline has original teal");
    assert.equal(baseCfg.casing, "sentence", "baseline casing");

    // --- Change ONLY the definition (no manual edits to generated output) ---
    const primPath = join(def, "tokens", "primitives.json");
    const prim = JSON.parse(readFileSync(primPath, "utf8"));
    prim.color.brand.coral = { $value: "#FF5A5F" }; // add a new colour token
    prim.color.brand.teal.$value = "#0A7E8D"; // change an existing colour value
    writeFileSync(primPath, JSON.stringify(prim, null, 2));

    const rulesPath = join(def, "rules.json");
    const rules = JSON.parse(readFileSync(rulesPath, "utf8"));
    rules.casing = "uppercase"; // change a rule
    writeFileSync(rulesPath, JSON.stringify(rules, null, 2));

    // Regenerate into a fresh dir.
    const next = join(work, "next");
    generatePlugin({ definitionDir: def, outDir: next });
    const nextCfg = readConfig(next);
    const nextSkill = readFileSync(join(next, "skills", "acme-design-system.md"), "utf8");

    // Added token → present in BOTH artifacts.
    assert.ok(nextCfg.approvedColors.includes("#FF5A5F"), "new colour in config");
    assert.match(nextSkill, /#FF5A5F/, "new colour in skill vocabulary");

    // Changed token value → new value present, old value FULLY absent (no drift).
    assert.ok(nextCfg.approvedColors.includes("#0A7E8D"), "changed colour value in config");
    assert.ok(!nextCfg.approvedColors.includes("#0A7E8C"), "old colour value gone from config");
    assert.match(nextSkill, /#0A7E8D/, "changed colour value in skill");
    assert.ok(!nextSkill.includes("#0A7E8C"), "old colour value gone from skill");

    // Changed rule → reflected in structured config field and skill body.
    assert.equal(nextCfg.casing, "uppercase", "rule change reflected in config");
    assert.match(nextSkill, /\*\*Casing\*\*: uppercase/, "rule change reflected in skill");

    // The generated checker config cannot contradict the definition: every
    // approved colour traces back to a current token value.
    assert.deepEqual(
      [...nextCfg.approvedColors].sort(),
      ["#0A7E8D", "#0B1F2A", "#FF5A5F", "#FFFFFF"],
      "approved colours exactly track the changed definition"
    );
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
});

test("generated plugin contains a complete UI gate hook (US6)", () => {
  const work = tmp();
  try {
    const outDir = join(work, "out");
    generatePlugin({ definitionDir: GOOD_DEF, outDir });

    const hookPath = join(outDir, "hooks", "ui-gate.md");
    assert.ok(existsSync(hookPath), "hooks/ui-gate.md must be generated");
    const hook = readFileSync(hookPath, "utf8");

    // No unfilled template placeholders survived generation.
    assert.ok(!hook.includes("{{"), "all template placeholders must be filled");

    // Trigger condition is a UI-edit completion event.
    assert.match(hook, /event:\s*ui-edit-complete/);
    assert.match(hook, /UI-edit completion/i);

    // References the checker command / frozen checker script.
    assert.match(hook, /\/dsguard:check/);
    assert.match(hook, /checker\.mjs/);

    // Blocks the workflow on exit code 1 (FAIL).
    assert.match(hook, /blocking:\s*true/);
    assert.match(hook, /exit code/i);
    assert.match(hook, /\bBlock\b/);
    assert.match(hook, /\b1\b[^\n]*FAIL/);
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
});

test("generated plugin is self-contained (US8)", () => {
  const work = tmp();
  try {
    const outDir = join(work, "out");
    const { name } = generatePlugin({ definitionDir: GOOD_DEF, outDir });

    // All runtime artifacts are present in the plugin directory.
    const required = [
      "scripts/checker.mjs",
      "checker-config.json",
      join("skills", `${name}-design-system.md`),
      "hooks/ui-gate.md",
      join(".claude-plugin", "plugin.json"),
    ];
    for (const rel of required) {
      assert.ok(existsSync(join(outDir, rel)), `missing ${rel}`);
    }

    // checker.mjs is a real copy (frozen), not a symlink, and is the engine's
    // checker byte-for-byte.
    const copied = join(outDir, "scripts", "checker.mjs");
    assert.ok(!lstatSync(copied).isSymbolicLink(), "checker.mjs must be a copy, not a symlink");
    const engineChecker = join(__dirname, "..", "..", "ds-guard", "scripts", "checker.mjs");
    assert.equal(
      readFileSync(copied, "utf8"),
      readFileSync(engineChecker, "utf8"),
      "frozen checker must match the engine checker byte-for-byte"
    );

    // No generated file references the engine directory — the plugin works with
    // ds-guard/ absent.
    const walk = (dir) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = join(dir, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (entry.isFile()) {
          // The frozen checker is the engine source itself; its own internal
          // comments are not a runtime dependency, so exclude it from the scan.
          if (full === copied) continue;
          const text = readFileSync(full, "utf8");
          assert.ok(
            !/ds-guard[\\/]/.test(text),
            `generated file ${entry.name} references the engine directory: ds-guard/`
          );
        }
      }
    };
    walk(outDir);
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
});

test("invalid definition → hard error and no output files", () => {
  const work = tmp();
  try {
    const def = join(work, "def");
    mkdirSync(join(def, "tokens"), { recursive: true });
    // Missing required `name` → invalid.
    writeFileSync(join(def, "rules.json"), JSON.stringify({ schemaVersion: "1.0.0" }));
    writeFileSync(
      join(def, "tokens", "primitives.json"),
      JSON.stringify({ color: { $type: "color", a: { $value: "#000000" } } })
    );

    const outDir = join(work, "out");
    assert.throws(
      () => generatePlugin({ definitionDir: def, outDir }),
      /Definition invalid/
    );
    assert.equal(existsSync(outDir), false, "no output directory should be created on failure");
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
});

test("missing definition → 'Run /dsguard:init first' error", () => {
  const work = tmp();
  try {
    assert.throws(
      () => generatePlugin({ definitionDir: join(work, "nope"), outDir: join(work, "out") }),
      /Run \/dsguard:init first/
    );
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
});
