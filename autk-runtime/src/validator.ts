/**
 * SpecValidator - Validates AutarkSpec against JSON Schema
 */

import Ajv from 'ajv';
import type { AutarkSpec } from './types.js';
import { SpecValidationError } from './types.js';

export class SpecValidator {
  private ajv: Ajv;
  private validateFn: ReturnType<Ajv['compile']> | null = null;
  private schemaPromise: Promise<void>;

  constructor() {
    this.ajv = new Ajv({
      allErrors: true,
      verbose: true,
      strict: false, // Disable strict mode to allow conditional required properties
    });

    // Load schema asynchronously for browser compatibility
    this.schemaPromise = this.loadSchema();
  }

  /**
   * Load the JSON Schema from the server.
   * This avoids using import assertions which aren't browser-compatible.
   */
  private async loadSchema(): Promise<void> {
    try {
      // Fetch schema from the runtime server (same origin as the runtime module)
      const runtimeUrl = new URL(import.meta.url);
      const schemaUrl = new URL('/schema/autark-spec-v0.1.json', runtimeUrl.origin);
      const response = await fetch(schemaUrl.toString());
      if (!response.ok) {
        throw new Error(`Failed to load schema: ${response.status}`);
      }
      const schema = await response.json();
      this.validateFn = this.ajv.compile(schema);
    } catch (error) {
      console.error('Failed to load schema:', error);
      const wrappedError = new Error(
        'Schema loading failed. Make sure schema/autark-spec-v0.1.json is accessible.'
      ) as Error & { cause?: unknown };
      wrappedError.cause = error;
      throw wrappedError;
    }
  }

  /**
   * Ensure schema is loaded before validation.
   */
  private async ensureSchemaLoaded(): Promise<void> {
    await this.schemaPromise;
    if (!this.validateFn) {
      throw new Error('Schema validation function not initialized');
    }
  }

  /**
   * Validate a spec against the JSON Schema.
   * Throws SpecValidationError if validation fails.
   */
  async validate(spec: AutarkSpec): Promise<void> {
    await this.ensureSchemaLoaded();

    const valid = this.validateFn!(spec);

    if (!valid && this.validateFn!.errors) {
      const errorMessages = this.validateFn!.errors.map((err) => {
        const path = err.instancePath || 'root';
        const message = err.message || 'Unknown error';
        return `${path}: ${message}`;
      });

      throw new SpecValidationError(
        `Spec validation failed:\n${errorMessages.join('\n')}`,
        this.validateFn!.errors
      );
    }
  }

  /**
   * Check if a spec is valid without throwing.
   */
  async isValid(spec: AutarkSpec): Promise<boolean> {
    try {
      await this.validate(spec);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get validation errors for a spec.
   */
  async getErrors(spec: AutarkSpec): Promise<unknown[] | null> {
    await this.ensureSchemaLoaded();
    this.validateFn!(spec);
    return this.validateFn!.errors || null;
  }
}
