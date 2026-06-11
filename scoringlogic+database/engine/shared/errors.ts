/**
 * engine/shared/errors.ts
 *
 * Typed error classes for the analysis engine.
 *
 * Rules:
 * - All engine errors extend EngineError.
 * - Every error carries a machine-readable `code` for programmatic handling.
 * - No error class contains domain logic — they are pure data carriers.
 * - The frontend and test consumers catch EngineError, not generic Error.
 */

// ─── BASE ─────────────────────────────────────────────────────────────────────

/**
 * Base class for all engine errors.
 * Always check `error instanceof EngineError` before accessing `.code`.
 */
export class EngineError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "EngineError";
    this.code = code;
    // Restore prototype chain in transpiled environments.
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

// ─── DATABASE ERRORS ─────────────────────────────────────────────────────────

/**
 * Thrown when the database envelope fails schema version validation.
 *
 * The engine does not silently degrade on unsupported schema versions.
 * Callers must handle this error and either migrate the database or
 * use a compatible engine version.
 */
export class SchemaVersionError extends EngineError {
  readonly foundVersion: string;
  readonly supportedVersions: readonly string[];

  constructor(foundVersion: string, supportedVersions: readonly string[]) {
    super(
      "SCHEMA_VERSION_UNSUPPORTED",
      `Database schema version "${foundVersion}" is not supported. ` +
        `Supported versions: ${supportedVersions.join(", ")}.`
    );
    this.name = "SchemaVersionError";
    this.foundVersion = foundVersion;
    this.supportedVersions = supportedVersions;
  }
}

/**
 * Thrown when the database JSON fails structural validation.
 * Carries the list of validation failure messages for diagnostics.
 */
export class DatabaseValidationError extends EngineError {
  readonly failures: readonly string[];

  constructor(failures: readonly string[]) {
    super(
      "DATABASE_VALIDATION_FAILED",
      `Database validation failed with ${failures.length} error(s): ${failures[0]}`
    );
    this.name = "DatabaseValidationError";
    this.failures = failures;
  }
}

// ─── PIPELINE ERRORS ─────────────────────────────────────────────────────────

/**
 * Thrown when the raw INCI input string is empty or contains no parseable tokens.
 */
export class EmptyInputError extends EngineError {
  constructor() {
    super("EMPTY_INPUT", "The INCI input string is empty or contains no parseable tokens.");
    this.name = "EmptyInputError";
  }
}

/**
 * Thrown when a required pipeline dependency (e.g., the lookup index) has not
 * been initialized before the pipeline is called.
 */
export class PipelineNotInitializedError extends EngineError {
  readonly missingDependency: string;

  constructor(missingDependency: string) {
    super(
      "PIPELINE_NOT_INITIALIZED",
      `Pipeline dependency "${missingDependency}" has not been initialized. ` +
        `Call buildLookupIndex() before running the pipeline.`
    );
    this.name = "PipelineNotInitializedError";
    this.missingDependency = missingDependency;
  }
}

// ─── PROFILE ERRORS ──────────────────────────────────────────────────────────

/**
 * Thrown when a HairProfile contains an invalid field value.
 * Carries the field name and the invalid value for diagnostics.
 */
export class InvalidProfileError extends EngineError {
  readonly field: string;
  readonly invalidValue: unknown;

  constructor(field: string, invalidValue: unknown) {
    super(
      "INVALID_PROFILE",
      `HairProfile field "${field}" has invalid value: ${JSON.stringify(invalidValue)}.`
    );
    this.name = "InvalidProfileError";
    this.field = field;
    this.invalidValue = invalidValue;
  }
}
