/**
 * @module AutkMapAttribution
 * Credits for data providers, such as the attribution a tile source requires.
 *
 * A credit is a piece of text, optionally linking to the provider's page, as
 * licences like OpenStreetMap's ask for. Credits are written as plain strings,
 * `{ text, url }` entries or a list of either, are validated once, and are drawn
 * as text and anchor elements, never as markup, so a credit cannot inject HTML.
 */

/** One credit: text, optionally a link. */
export interface TileCredit {
    /** Text shown. */
    text: string;
    /** Page the text links to. Must be an `http` or `https` URL. */
    url?: string;
}

/** Credit as an application writes it: text, an entry with a link, or a list of either. */
export type TileAttribution = string | TileCredit | ReadonlyArray<string | TileCredit>;

/** Branding shown with the provider credits, including on maps without tile imagery. */
export const AUTARK_CREDIT: TileCredit = { text: 'Made with Autark', url: 'https://www.autarkjs.org' };

/**
 * Whether a string is an `http` or `https` URL, the only kinds a credit may link to.
 *
 * @param value - Candidate URL.
 * @returns `true` for a parseable `http:` or `https:` URL.
 */
export function isHttpUrl(value: string): boolean {
    try {
        const { protocol } = new URL(value);
        return protocol === 'http:' || protocol === 'https:';
    } catch {
        return false;
    }
}

/**
 * Turns the accepted attribution forms into a list of credits.
 *
 * @param attribution - A string, a credit or a list of either.
 * @returns Credits with trimmed, non-empty text.
 * @throws If there is no credit, a credit has no text, or a link is not an `http(s)` URL.
 */
export function normalizeAttribution(attribution: TileAttribution): TileCredit[] {
    const entries: ReadonlyArray<string | TileCredit> =
        typeof attribution === 'string' || !Array.isArray(attribution) ? [attribution as string | TileCredit] : attribution;

    const credits = entries.map((entry): TileCredit => {
        const text = typeof entry === 'string' ? entry : entry?.text;
        if (typeof text !== 'string' || text.trim().length === 0) {
            throw new Error('Tile source needs an attribution: tile providers require the credit to be shown.');
        }
        if (typeof entry === 'string' || entry.url === undefined) return { text: text.trim() };
        if (typeof entry.url !== 'string' || !isHttpUrl(entry.url)) {
            throw new Error(`Attribution link for "${text.trim()}" must be an http or https URL.`);
        }
        return { text: text.trim(), url: entry.url };
    });
    if (credits.length === 0) {
        throw new Error('Tile source needs an attribution: tile providers require the credit to be shown.');
    }
    return credits;
}

/**
 * Merges credit lists, dropping repeats, so providers shared by several layers are credited once.
 *
 * @param lists - Credit lists, in the order to keep.
 * @returns One list without duplicate text-and-link pairs.
 */
export function mergeCredits(lists: ReadonlyArray<readonly TileCredit[]>): TileCredit[] {
    const seen = new Set<string>();
    const merged: TileCredit[] = [];
    for (const list of lists) {
        for (const credit of list) {
            const id = `${credit.text}\u0000${credit.url ?? ''}`;
            if (seen.has(id)) continue;
            seen.add(id);
            merged.push(credit);
        }
    }
    return merged;
}

/** The part of `document` that {@link createAttributionElement} uses. */
export interface AttributionDocument {
    createElement(tag: 'span' | 'a'): HTMLElement;
    createTextNode(text: string): Node;
}

/**
 * Builds the element that shows credits.
 *
 * Text goes in as text nodes. A credit with a link becomes an anchor that opens
 * in a new tab without giving the page access to this one; links that are not
 * `http(s)` are shown as plain text. The element takes pointer events itself,
 * so its links work even though the map's overlay layer ignores them.
 *
 * @param doc - Document to create elements with.
 * @param credits - Credits to show.
 * @returns The element, or `null` when there is nothing to show.
 */
export function createAttributionElement(doc: AttributionDocument, credits: readonly TileCredit[]): HTMLElement | null {
    if (credits.length === 0) return null;

    const root = doc.createElement('span');
    root.className = 'autk-map-attribution';
    root.tabIndex = 0;
    root.title = credits.map(credit => credit.text).join(' · ');
    Object.assign(root.style, {
        position: 'absolute', left: '10px', bottom: '10px', width: 'max-content', maxWidth: 'calc(100% - 20px)',
        boxSizing: 'border-box', fontFamily: 'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
        fontSize: '10px', lineHeight: '12px', fontWeight: '400', letterSpacing: 'normal', color: '#737379',
        background: 'rgba(255,255,255,0.6)', padding: '0 4px',
        textAlign: 'left', whiteSpace: 'nowrap', overflowX: 'auto', scrollbarWidth: 'none', pointerEvents: 'auto',
    });

    credits.forEach((credit, index) => {
        if (index > 0) root.appendChild(doc.createTextNode(' · '));
        if (credit.url !== undefined && isHttpUrl(credit.url)) {
            const link = doc.createElement('a') as HTMLAnchorElement;
            link.textContent = credit.text;
            link.href = credit.url;
            link.target = '_blank';
            link.rel = 'noopener noreferrer';
            link.className = 'autk-map-credit';
            const isAutark = credit.url === AUTARK_CREDIT.url && credit.text === AUTARK_CREDIT.text;
            Object.assign(link.style, { color: isAutark ? '#3451b2' : 'inherit', font: 'inherit', textDecoration: 'none' });
            root.appendChild(link);
        } else {
            root.appendChild(doc.createTextNode(credit.text));
        }
    });
    return root;
}
