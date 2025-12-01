import type { UrbanSpec } from 'urban-grammar';

export type Targets = {
    compute?: string,
    db?: string,
    map?: string[] | string,
    plot?: string
}

export type AutkGrammarSpec = UrbanSpec;

export { ColorMapInterpolator } from 'urban-grammar';

