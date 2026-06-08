import { test } from "node:test";
import assert from "node:assert/strict";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  validateDefinition,
  validateDefinitionFile,
} from "../../ds-guard/scripts/validate-definition.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURES = join(__dirname, "..", "fixtures");

const GOOD_RULES = join(FIXTURES, "known-good", "definition", "rules.json");
const MISSING_NAME = join(
  FIXTURES,
  "known-bad",
  "definition",
  "rules-missing-name.json"
);
const CONFLICT = join(FIXTURES, "known-bad", "definition", "rules-conflict.json");

test("valid rules.json (all optional fields) → empty errors", () => {
  const errors = validateDefinitionFile(GOOD_RULES);
  assert.deepEqual(
    errors,
    [],
    `expected no errors, got:\n${errors.join("\n")}`
  );
});

test("rules.json missing required 'name' → error listing 'name'", () => {
  const errors = validateDefinitionFile(MISSING_NAME);
  assert.ok(errors.length > 0, "expected at least one error");
  assert.ok(
    errors.some((e) => /\bname\b/.test(e)),
    `expected an error mentioning 'name', got:\n${errors.join("\n")}`
  );
});

test("rules.json with shadows conflict → error listing conflict", () => {
  const errors = validateDefinitionFile(CONFLICT);
  assert.ok(errors.length > 0, "expected at least one error");
  assert.ok(
    errors.some((e) => /conflict/i.test(e) && /shadow/i.test(e)),
    `expected a shadows conflict error, got:\n${errors.join("\n")}`
  );
});

test("validateDefinition rejects non-object input", () => {
  assert.ok(validateDefinition(null).length > 0);
  assert.ok(validateDefinition([]).length > 0);
  assert.ok(validateDefinition("nope").length > 0);
});
