/**
 * Type declaration for the bundled Autark JSON Schema.
 *
 * The `@autark-schema` alias resolves to `schema/autark-spec-v0.1.json` at the
 * repo root (see vite.config.js / vite.widget.config.js) so the schema is
 * inlined into the bundle instead of fetched at runtime.
 */
declare module '@autark-schema' {
  const schema: Record<string, unknown>;
  export default schema;
}
