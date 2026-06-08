import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import Ajv from "ajv";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SCHEMA_PATH = join(__dirname, "..", "schema", "rules-schema.json");

const schema = JSON.parse(readFileSync(SCHEMA_PATH, "utf8"));

const ajv = new Ajv({ allErrors: true, strict: false });
const validate = ajv.compile(schema);

/**
 * Validate a parsed rules object against the DS-Guard rules schema.
 *
 * @param {unknown} rulesObject - A parsed rules.json document (JS object).
 * @returns {string[]} Array of human-readable error strings. Empty means valid.
 */
export function validateDefinition(rulesObject) {
  const errors = [];

  if (rulesObject === null || typeof rulesObject !== "object" || Array.isArray(rulesObject)) {
    errors.push("rules.json: expected a JSON object at the top level");
    return errors;
  }

  const valid = validate(rulesObject);
  if (!valid && Array.isArray(validate.errors)) {
    for (const err of validate.errors) {
      const path = err.instancePath || "";
      if (err.keyword === "required" && err.params && err.params.missingProperty) {
        const prop = err.params.missingProperty;
        const where = path ? `${path}` : "";
        errors.push(`rules.json${where}: missing required field "${prop}"`);
      } else if (err.keyword === "additionalProperties" && err.params && err.params.additionalProperty) {
        errors.push(`rules.json${path}: unexpected property "${err.params.additionalProperty}"`);
      } else {
        errors.push(`rules.json${path}: ${err.message}`);
      }
    }
  }

  // Explicit, human-readable conflict check: shadows.policy "none" with a
  // non-empty shadows.allowed array. The schema also encodes this, but ajv's
  // if/then report can be cryptic, so we surface a clear message here too.
  const shadows = rulesObject.shadows;
  if (
    shadows &&
    typeof shadows === "object" &&
    !Array.isArray(shadows) &&
    shadows.policy === "none" &&
    Array.isArray(shadows.allowed) &&
    shadows.allowed.length > 0
  ) {
    errors.push(
      "shadows: conflicting rules — policy is 'none' but shadows.allowed is non-empty"
    );
  }

  return errors;
}

/**
 * Read and JSON-parse a rules file, then validate it.
 *
 * @param {string} rulesPath - Path to a rules.json file.
 * @returns {string[]} Array of human-readable error strings. Empty means valid.
 */
export function validateDefinitionFile(rulesPath) {
  let raw;
  try {
    raw = readFileSync(rulesPath, "utf8");
  } catch (err) {
    return [`rules.json: could not read file at "${rulesPath}" — ${err.message}`];
  }

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    return [`rules.json: invalid JSON in "${rulesPath}" — ${err.message}`];
  }

  return validateDefinition(parsed);
}
