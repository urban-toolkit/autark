/**
 * SpecValidator - Validates AutarkSpec against JSON Schema
 */

import Ajv from 'ajv';
// Bundled at build time (see the @autark-schema alias in the vite configs).
// Bundling instead of fetching keeps validation working when the runtime is
// loaded from a blob:/data: URL (e.g. as an anywidget module) or offline.
import schema from '@autark-schema';
import type { AutarkSpec } from './types.js';
import { SpecValidationError } from './types.js';

export class SpecValidator {
  private ajv: Ajv;
  private validateFn: ReturnType<Ajv['compile']> | null = null;

  constructor() {
    this.ajv = new Ajv({
      allErrors: true,
      verbose: true,
      strict: false, // Disable strict mode to allow conditional required properties
    });

    this.validateFn = this.ajv.compile(schema);
  }

  /**
   * Ensure schema is loaded before validation.
   */
  private async ensureSchemaLoaded(): Promise<void> {
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
