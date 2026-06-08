// Tests for ds-guard checker.mjs — routing (T038/T039) + skeleton smoke tests.
// Rule checks do not exist yet (added in T024), so these focus on routing,
// discovery, and well-formed CheckReport output.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  discoverSourceFiles,
  loadCheckerConfig,
  loadRoutingManifest,
  resolveSystemForFile,
  matchGlob,
  globToRegExp,
  checkPath,
  buildReport,
  formatText,
  formatJson,
  runCheck,
} from '../../ds-guard/scripts/checker.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE_MANIFEST = path.join(__dirname, '..', 'fixtures', 'ds-guard.config.json');
const FIXTURES = path.join(__dirname, '..', 'fixtures');
const BAD_BUTTON = path.join(FIXTURES, 'known-bad', 'components', 'BadButton.tsx');
const GOOD_BUTTON = path.join(FIXTURES, 'known-good', 'components', 'GoodButton.tsx');
const AUTH_BAD = path.join(FIXTURES, 'known-bad', 'components', 'AuthoritativeBad.tsx');

// CheckerConfig mirroring the known-good definition fixture
// (tests/fixtures/known-good/definition). Kept as a literal here so the checker
// tests are self-contained and do not depend on generate.mjs.
const ACME_CONFIG = {
  systemName: 'acme',
  schemaVersion: '1.0.0',
  tokenSetComplete: true,
  approvedTokenNames: [
    'color.brand.teal',
    'color.brand.ink',
    'color.neutral.white',
    'color.text.primary',
    'color.text.onBrand',
    'color.surface.brand',
    'spacing.xs',
    'spacing.sm',
    'spacing.md',
    'fontSize.body',
    'fontSize.heading',
    'radius.sm',
    'radius.md',
    'radius.lg',
  ],
  approvedColors: ['#0A7E8C', '#0B1F2A', '#FFFFFF'],
  approvedTypeScale: ['16px', '24px'],
  approvedSpacing: ['4px', '8px', '16px'],
  approvedRadius: ['radius.sm', 'radius.md', 'radius.lg', '4px', '8px', '16px'],
  approvedShadows: ['shadow.sm', 'shadow.md'],
  approvedElevation: [],
  approvedMotion: [],
  approvedFonts: { ui: 'font.sans', editorial: 'font.serif' },
  bannedTextAlignments: ['justify'],
  centerOnlyShort: true,
  casing: 'sentence',
  typePolicy: { scaleOnly: true, bodyMinPx: 14 },
  arbitraryAllowlist: ['max-w-[72ch]'],
  freeformRules: '',
};

// ---------------------------------------------------------------------------
// Routing manifest loading
// ---------------------------------------------------------------------------

test('loadRoutingManifest reads the fixture manifest with two systems', () => {
  const manifest = loadRoutingManifest(FIXTURE_MANIFEST);
  assert.ok(manifest, 'manifest should load');
  assert.equal(manifest.schemaVersion, '1.0.0');
  assert.equal(manifest.systems.length, 2);
  assert.equal(manifest.systems[0].name, 'system-a');
  assert.equal(manifest.systems[1].name, 'system-b');
});

test('loadRoutingManifest returns null for a missing file', () => {
  assert.equal(loadRoutingManifest(path.join(__dirname, 'does-not-exist.json')), null);
});

// ---------------------------------------------------------------------------
// resolveSystemForFile — first-match routing (FR-001b)
// ---------------------------------------------------------------------------

test('a file under packages/app-a resolves to system-a', () => {
  const manifest = loadRoutingManifest(FIXTURE_MANIFEST);
  const system = resolveSystemForFile('packages/app-a/src/Button.tsx', manifest);
  assert.ok(system);
  assert.equal(system.name, 'system-a');
});

test('a file under packages/app-b resolves to system-b', () => {
  const manifest = loadRoutingManifest(FIXTURE_MANIFEST);
  const system = resolveSystemForFile('packages/app-b/src/Card.tsx', manifest);
  assert.ok(system);
  assert.equal(system.name, 'system-b');
});

test('a file matching no pattern resolves to null (skipped) without throwing', () => {
  const manifest = loadRoutingManifest(FIXTURE_MANIFEST);
  let system;
  assert.doesNotThrow(() => {
    system = resolveSystemForFile('packages/app-c/src/Other.tsx', manifest);
  });
  assert.equal(system, null);
});

test('resolveSystemForFile normalizes Windows backslashes', () => {
  const manifest = loadRoutingManifest(FIXTURE_MANIFEST);
  const system = resolveSystemForFile('packages\\app-a\\src\\Button.tsx', manifest);
  assert.ok(system);
  assert.equal(system.name, 'system-a');
});

test('first-match semantics: earlier system in array order wins', () => {
  // Both systems could match the same path; the first one (broad-a) must win.
  const manifest = {
    schemaVersion: '1.0.0',
    systems: [
      { name: 'broad-a', pluginDir: 'a', patterns: ['packages/**'] },
      { name: 'broad-b', pluginDir: 'b', patterns: ['packages/**'] },
    ],
  };
  const system = resolveSystemForFile('packages/app-b/src/X.tsx', manifest);
  assert.equal(system.name, 'broad-a');
});

test('first-match semantics: reordering systems flips the winner', () => {
  const manifest = {
    schemaVersion: '1.0.0',
    systems: [
      { name: 'broad-b', pluginDir: 'b', patterns: ['packages/**'] },
      { name: 'broad-a', pluginDir: 'a', patterns: ['packages/**'] },
    ],
  };
  const system = resolveSystemForFile('packages/app-b/src/X.tsx', manifest);
  assert.equal(system.name, 'broad-b');
});

test('resolveSystemForFile with null manifest returns null', () => {
  assert.equal(resolveSystemForFile('packages/app-a/x.tsx', null), null);
});

// ---------------------------------------------------------------------------
// Glob matcher
// ---------------------------------------------------------------------------

test('globToRegExp / matchGlob handle **, * and literals', () => {
  assert.ok(matchGlob('packages/app-a/src/deep/Button.tsx', 'packages/app-a/**'));
  assert.ok(matchGlob('packages/app-a/Button.tsx', 'packages/app-a/*.tsx'));
  assert.ok(!matchGlob('packages/app-a/src/Button.tsx', 'packages/app-a/*.tsx'));
  assert.ok(matchGlob('a/b/c.css', '**/*.css'));
  assert.ok(!matchGlob('a/b/c.js', '**/*.css'));
  assert.ok(globToRegExp('packages/app-a/**') instanceof RegExp);
});

// ---------------------------------------------------------------------------
// Discovery + smoke test of checkPath / report shape
// ---------------------------------------------------------------------------

test('discoverSourceFiles finds source files and skips node_modules + dot dirs', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dsguard-disc-'));
  try {
    fs.writeFileSync(path.join(tmp, 'Button.tsx'), 'export const x = 1;\n');
    fs.writeFileSync(path.join(tmp, 'styles.css'), '.a{}\n');
    fs.writeFileSync(path.join(tmp, 'README.md'), '# nope\n');
    fs.mkdirSync(path.join(tmp, 'node_modules'));
    fs.writeFileSync(path.join(tmp, 'node_modules', 'dep.js'), 'module.exports={};\n');
    fs.mkdirSync(path.join(tmp, '.git'));
    fs.writeFileSync(path.join(tmp, '.git', 'config.js'), '//x\n');

    const found = discoverSourceFiles(tmp).map((p) => path.basename(p)).sort();
    assert.deepEqual(found, ['Button.tsx', 'styles.css']);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('discoverSourceFiles on a missing path returns empty array', () => {
  assert.deepEqual(discoverSourceFiles(path.join(os.tmpdir(), 'dsguard-nope-xyz')), []);
});

test('checkPath on a directory yields a well-formed CheckReport with passed:true', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dsguard-check-'));
  try {
    fs.writeFileSync(path.join(tmp, 'A.tsx'), 'export const A = () => null;\n');
    const config = { systemName: 'acme' };
    const report = checkPath(tmp, config);

    assert.equal(report.systemName, 'acme');
    assert.equal(typeof report.checkedAt, 'string');
    assert.ok(!Number.isNaN(Date.parse(report.checkedAt)), 'checkedAt is ISO-8601');
    assert.equal(report.targetPath, tmp);
    assert.deepEqual(report.findings, []);
    assert.equal(report.errorCount, 0);
    assert.equal(report.warnCount, 0);
    assert.equal(report.passed, true);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('checkPath in routed mode skips files that match no system', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dsguard-route-'));
  try {
    // unmatched file — must be skipped silently, no throw
    const unmatchedDir = path.join(tmp, 'packages', 'app-c', 'src');
    fs.mkdirSync(unmatchedDir, { recursive: true });
    fs.writeFileSync(path.join(unmatchedDir, 'X.tsx'), 'export const X = 1;\n');

    const manifest = loadRoutingManifest(FIXTURE_MANIFEST);
    let report;
    assert.doesNotThrow(() => {
      report = checkPath(tmp, null, { manifest, manifestDir: tmp });
    });
    assert.equal(report.passed, true);
    assert.deepEqual(report.findings, []);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// Report builder + text formatting
// ---------------------------------------------------------------------------

test('buildReport computes counts and passed flag', () => {
  const findings = [
    { file: 'a.tsx', line: 1, severity: 'ERROR', ruleClass: 'color', message: 'bad', value: '#fff' },
    { file: 'a.tsx', line: 2, severity: 'warn', ruleClass: 'typeScale', message: 'maybe', value: '13px' },
  ];
  const report = buildReport({ systemName: 'acme', targetPath: 'src/', findings });
  assert.equal(report.errorCount, 1);
  assert.equal(report.warnCount, 1);
  assert.equal(report.passed, false);
});

test('formatText emits PASS summary for a clean report', () => {
  const report = buildReport({ systemName: 'acme', targetPath: 'src/', findings: [] });
  const text = formatText(report, 47);
  assert.match(text, /Checked 47 files\. No violations found\./);
  assert.match(text, /PASS/);
});

test('formatText emits FAIL summary with findings lines', () => {
  const findings = [
    { file: 'a.tsx', line: 3, severity: 'ERROR', ruleClass: 'color', message: 'not allowed', value: '#fff' },
    { file: 'b.tsx', line: 9, severity: 'warn', ruleClass: 'typeScale', message: 'looks like a token', value: '13px' },
  ];
  const report = buildReport({ systemName: 'acme', targetPath: 'src/', findings });
  const text = formatText(report);
  assert.match(text, /a\.tsx:3 {2}ERROR {2}color {2}not allowed/);
  assert.match(text, /Found 1 error, 1 warning\./);
  assert.match(text, /FAIL/);
});

// ---------------------------------------------------------------------------
// Config loading
// ---------------------------------------------------------------------------

test('loadCheckerConfig returns null for a missing config (exit-code-2 path)', () => {
  assert.equal(loadCheckerConfig(path.join(__dirname, 'no-such-config.json')), null);
});

// ---------------------------------------------------------------------------
// Rule checks (T024) — zero false negatives / zero false positives (SC-2)
// ---------------------------------------------------------------------------

test('known-bad BadButton.tsx FAILS with the three expected violations', () => {
  const report = checkPath(BAD_BUTTON, ACME_CONFIG);
  assert.equal(report.passed, false, 'BadButton must FAIL');

  const byClass = new Map(report.findings.map((f) => [f.ruleClass, f]));
  // Zero false negatives: every seeded violation is caught.
  assert.ok(byClass.has('color'), 'raw colour #FF0000 must be flagged');
  assert.ok(byClass.has('typeScale'), 'off-scale 13px must be flagged');
  assert.ok(byClass.has('radius'), 'disallowed 99px radius must be flagged');

  assert.equal(byClass.get('color').value, '#FF0000');
  assert.equal(byClass.get('typeScale').value, '13px');
  assert.equal(byClass.get('radius').value, '99px');

  // Each finding carries file + 1-indexed location.
  for (const f of report.findings) {
    assert.equal(f.file, BAD_BUTTON);
    assert.ok(Number.isInteger(f.line) && f.line > 0, 'line is 1-indexed');
    assert.equal(f.severity, 'ERROR', 'raw literals with an allowlist are hard errors');
  }
});

test('known-bad fixture produces exactly three findings (no spurious extras)', () => {
  const report = checkPath(BAD_BUTTON, ACME_CONFIG);
  assert.equal(report.findings.length, 3);
  assert.equal(report.errorCount, 3);
  assert.equal(report.warnCount, 0);
});

test('known-good GoodButton.tsx PASSES with zero findings (no false positives)', () => {
  const report = checkPath(GOOD_BUTTON, ACME_CONFIG);
  assert.deepEqual(report.findings, []);
  assert.equal(report.errorCount, 0);
  assert.equal(report.warnCount, 0);
  assert.equal(report.passed, true);
});

test('text output format renders findings and FAIL for known-bad', () => {
  const report = checkPath(BAD_BUTTON, ACME_CONFIG);
  const text = formatText(report);
  assert.match(text, /ERROR {2}color/);
  assert.match(text, /ERROR {2}typeScale/);
  assert.match(text, /ERROR {2}radius/);
  assert.match(text, /Found 3 errors, 0 warnings\./);
  assert.match(text, /FAIL/);
});

test('json output format emits a well-formed CheckReport for known-bad', () => {
  const report = checkPath(BAD_BUTTON, ACME_CONFIG);
  const parsed = JSON.parse(formatJson(report));
  assert.equal(parsed.passed, false);
  assert.equal(parsed.errorCount, 3);
  assert.equal(parsed.findings.length, 3);
  assert.ok(parsed.findings.every((f) => typeof f.file === 'string' && f.line > 0));
});

// ---------------------------------------------------------------------------
// Exit codes via runCheck (command-check.md) — 0 PASS / 1 FAIL / 2 config error
// ---------------------------------------------------------------------------

function withTempConfig(config, fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dsguard-cfg-'));
  const configPath = path.join(dir, 'checker-config.json');
  fs.writeFileSync(configPath, JSON.stringify(config));
  try {
    return fn(configPath);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

test('runCheck exits 1 (FAIL) on the known-bad fixture', () => {
  withTempConfig(ACME_CONFIG, (configPath) => {
    const { exitCode, report } = runCheck({ targetPath: BAD_BUTTON, configPath });
    assert.equal(exitCode, 1);
    assert.equal(report.passed, false);
  });
});

test('runCheck exits 0 (PASS) on the known-good fixture', () => {
  withTempConfig(ACME_CONFIG, (configPath) => {
    const { exitCode, report } = runCheck({ targetPath: GOOD_BUTTON, configPath });
    assert.equal(exitCode, 0);
    assert.equal(report.passed, true);
  });
});

test('runCheck exits 2 on a missing checker-config (config error)', () => {
  const { exitCode, report, error } = runCheck({
    targetPath: GOOD_BUTTON,
    configPath: path.join(os.tmpdir(), 'dsguard-no-config-xyz.json'),
  });
  assert.equal(exitCode, 2);
  assert.equal(report, null);
  assert.match(error, /No checker-config\.json found/);
});

test('runCheck exits 2 when the target path does not exist (I/O error)', () => {
  withTempConfig(ACME_CONFIG, (configPath) => {
    const { exitCode, error } = runCheck({
      targetPath: path.join(os.tmpdir(), 'dsguard-missing-target-xyz.tsx'),
      configPath,
    });
    assert.equal(exitCode, 2);
    assert.match(error, /Path not found/);
  });
});

test('arbitraryAllowlist bypasses an otherwise-flagged value', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dsguard-allow-'));
  try {
    const file = path.join(tmp, 'Allow.tsx');
    // A raw radius literal that is explicitly allow-listed must not be flagged.
    fs.writeFileSync(file, "const s = { borderRadius: '42px' };\n");
    const cfg = { ...ACME_CONFIG, arbitraryAllowlist: ['42px'] };
    const report = checkPath(file, cfg);
    assert.deepEqual(report.findings, []);
    assert.equal(report.passed, true);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('tokenSetComplete:false keeps raw-literal violations as hard errors', () => {
  // Raw literals carry an explicit allowlist, so they are ERROR regardless of
  // tokenSetComplete (which only governs token-shaped-but-undefined values).
  const cfg = { ...ACME_CONFIG, tokenSetComplete: false };
  const report = checkPath(BAD_BUTTON, cfg);
  assert.equal(report.errorCount, 3);
  assert.equal(report.passed, false);
});

// ---------------------------------------------------------------------------
// Read-only safety (T024 / NFR-005) — a check run never mutates the target
// ---------------------------------------------------------------------------

/** Snapshot every file under a directory as relpath → { size, content }. */
function snapshotDir(root) {
  const snap = new Map();
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.isFile()) {
        snap.set(path.relative(root, full), fs.readFileSync(full, 'utf8'));
      }
    }
  };
  walk(root);
  return snap;
}

test('checker never creates, modifies, or deletes files in the target path (NFR-005)', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dsguard-ro-'));
  try {
    // A mix of violating and conforming source, plus a non-source file.
    fs.copyFileSync(BAD_BUTTON, path.join(tmp, 'BadButton.tsx'));
    fs.copyFileSync(GOOD_BUTTON, path.join(tmp, 'GoodButton.tsx'));
    fs.writeFileSync(path.join(tmp, 'notes.md'), '# untouched\n');

    const before = snapshotDir(tmp);

    // Run both the library path and the orchestrator (which also touches config).
    const report = checkPath(tmp, ACME_CONFIG);
    assert.equal(report.passed, false, 'mixed fixture should FAIL');
    const configPath = path.join(tmp, '..', `cfg-${path.basename(tmp)}.json`);
    fs.writeFileSync(configPath, JSON.stringify(ACME_CONFIG));
    try {
      runCheck({ targetPath: tmp, configPath });
    } finally {
      fs.rmSync(configPath, { force: true });
    }

    const after = snapshotDir(tmp);

    assert.deepEqual([...after.keys()].sort(), [...before.keys()].sort(), 'file set changed');
    for (const [rel, content] of before) {
      assert.equal(after.get(rel), content, `content of ${rel} changed`);
    }
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// Authoritative checking (T037 / US9 / FR-012) — tokenSetComplete governs the
// severity of plausible-but-undefined token references.
// ---------------------------------------------------------------------------

test('tokenSetComplete:true → undefined-but-plausible token is a hard ERROR', () => {
  const cfg = { ...ACME_CONFIG, tokenSetComplete: true };
  const report = checkPath(AUTH_BAD, cfg);
  const finding = report.findings.find((f) => f.value === 'color.brand.coral');
  assert.ok(finding, 'undefined token must be flagged');
  assert.equal(finding.ruleClass, 'tokenShape');
  assert.equal(finding.severity, 'ERROR');
  assert.equal(report.passed, false, 'authoritative mode fails the build');
});

test('tokenSetComplete:false → same value is an advisory warn (build passes)', () => {
  const cfg = { ...ACME_CONFIG, tokenSetComplete: false };
  const report = checkPath(AUTH_BAD, cfg);
  const finding = report.findings.find((f) => f.value === 'color.brand.coral');
  assert.ok(finding, 'undefined token must still be surfaced');
  assert.equal(finding.ruleClass, 'tokenShape');
  assert.equal(finding.severity, 'warn');
  assert.equal(report.errorCount, 0);
  assert.equal(report.passed, true, 'advisory mode does not fail the build');
});

test('a conforming token reference always passes, in both modes', () => {
  for (const tokenSetComplete of [true, false]) {
    const cfg = { ...ACME_CONFIG, tokenSetComplete };
    const report = checkPath(AUTH_BAD, cfg);
    assert.ok(
      !report.findings.some((f) => f.value === 'color.brand.teal'),
      `defined token must never be flagged (tokenSetComplete=${tokenSetComplete})`
    );
  }
});

test('ordinary property access is not mistaken for a token reference', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dsguard-prop-'));
  try {
    const file = path.join(tmp, 'Plain.tsx');
    // None of these dotted paths start with a known token group, so none are
    // token-shaped for this system.
    fs.writeFileSync(
      file,
      'const x = props.onClick;\nconst y = React.useState;\nconst z = theme.spacing.unit;\n'
    );
    const report = checkPath(file, ACME_CONFIG);
    assert.deepEqual(report.findings, []);
    assert.equal(report.passed, true);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// Performance (T042 / NFR-002) — the checker completes well under the
// measurable bound from plan.md: < 5 seconds on a typical project
// (50–500 component files). We exercise 200 .tsx files, comfortably inside
// that band, and assert wall-clock completion under 5000 ms.
// ---------------------------------------------------------------------------

test('checker scans 200 .tsx files in under 5 seconds (NFR-002)', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dsguard-perf-'));
  try {
    // Generate a realistic mix: every third file carries the three seeded
    // violations (so the rule engine does real work), the rest conform.
    const violating = [
      'import React from "react";',
      'export function Drift({ label }: { label: string }) {',
      '  return (',
      '    <button style={{ color: "#FF0000", fontSize: "13px", borderRadius: "99px" }}>',
      '      {label}',
      '    </button>',
      '  );',
      '}',
      '',
    ].join('\n');
    const conforming = [
      'import React from "react";',
      'import { colors, spacing, radius } from "./tokens";',
      'export function Conform({ label }: { label: string }) {',
      '  return (',
      '    <button style={{ color: colors["brand-teal"], padding: spacing.md, borderRadius: radius.sm }}>',
      '      {label}',
      '    </button>',
      '  );',
      '}',
      '',
    ].join('\n');

    const FILE_COUNT = 200;
    let expectedErrors = 0;
    for (let i = 0; i < FILE_COUNT; i += 1) {
      const isViolating = i % 3 === 0;
      if (isViolating) expectedErrors += 3;
      fs.writeFileSync(
        path.join(tmp, `Comp${i}.tsx`),
        isViolating ? violating : conforming
      );
    }

    const start = process.hrtime.bigint();
    const report = checkPath(tmp, ACME_CONFIG);
    const elapsedMs = Number(process.hrtime.bigint() - start) / 1e6;

    // Sanity: the run actually did the work (zero false negatives at scale).
    assert.equal(report.errorCount, expectedErrors, 'every seeded violation is caught at scale');

    assert.ok(
      elapsedMs < 5000,
      `checker took ${elapsedMs.toFixed(0)}ms for ${FILE_COUNT} files; NFR-002 bound is 5000ms`
    );
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
