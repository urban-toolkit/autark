/** Templates of the built-in plots or transforms registered in a `built-in.ts`. */
export function builtInTemplates(srcDir: string, kind?: 'plots' | 'transforms'): { exported: string; module: string; code: string }[];

/** TypeScript module holding the templates of the built-in plots and transforms. */
export function templatesModule(srcDir: string): string;
