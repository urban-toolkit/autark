/**
 * Line icons of the workspace, drawn for this case study (24 × 24 grid,
 * `currentColor`), so the toolbox follows the page colors.
 */

const AXES = '<path d="M4 3.5v16.5h16.5"/>';

/** Inner SVG of each icon. */
const PATHS: Record<string, string> = {
    // ---- Charts
    scatter: `${AXES}<circle cx="8.5" cy="15" r="1.4" fill="currentColor"/><circle cx="12" cy="10" r="1.4" fill="currentColor"/><circle cx="16" cy="13" r="1.4" fill="currentColor"/><circle cx="18" cy="7" r="1.4" fill="currentColor"/>`,
    line: `${AXES}<path d="M6.5 15.5l4-5 3.5 3 5-7"/><circle cx="10.5" cy="10.5" r="1.1" fill="currentColor"/><circle cx="14" cy="13.5" r="1.1" fill="currentColor"/>`,
    histogram: `${AXES}<path d="M7 20v-6h3v6M10 20V9h3v11M13 20v-8h3v8M16 20v-4h3v4"/>`,
    heatmatrix: '<rect x="4" y="4" width="16" height="16" rx="1.5"/><path d="M9.3 4v16M14.7 4v16M4 9.3h16M4 14.7h16"/><rect x="9.3" y="9.3" width="5.4" height="5.4" fill="currentColor" stroke="none"/><rect x="4" y="14.7" width="5.3" height="5.3" fill="currentColor" stroke="none" opacity=".45"/>',
    pcoords: '<path d="M5 4v16M12 4v16M19 4v16"/><path d="M5 7l7 9 7-6M5 16l7-8 7 9"/>',
    table: '<rect x="3.5" y="4.5" width="17" height="15" rx="1.5"/><path d="M3.5 9h17M3.5 13.5h17M10 4.5v15"/>',
    boxplot: '<path d="M12 3.5v4.5M12 16v4.5M9 3.5h6M9 20.5h6"/><rect x="7" y="8" width="10" height="8" rx="1"/><path d="M7 11.5h10"/>',
    sankey: '<rect x="3.5" y="4" width="2.5" height="7"/><rect x="3.5" y="13" width="2.5" height="7"/><rect x="18" y="5" width="2.5" height="14"/><path d="M6 7.5c6 0 6 3 12 3M6 16.5c6 0 6-2 12-2"/>',
    pie: '<circle cx="12" cy="12" r="8"/><path d="M12 12V4M12 12l6.5 4.7"/>',
    donut: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="4"/><path d="M12 4v4M18.9 16l-3.4-2"/>',
    area: `${AXES}<path d="M6 17l4-6 4 3 5-7v13H6z" fill="currentColor" fill-opacity=".25"/>`,
    calendar: '<rect x="4" y="5" width="16" height="15" rx="1.5"/><path d="M4 9h16M8 3v4M16 3v4"/><circle cx="8.5" cy="13" r=".9" fill="currentColor"/><circle cx="12" cy="13" r=".9" fill="currentColor"/><circle cx="15.5" cy="13" r=".9" fill="currentColor"/><circle cx="8.5" cy="16.5" r=".9" fill="currentColor"/><circle cx="12" cy="16.5" r=".9" fill="currentColor"/>',
    bubble: '<circle cx="8" cy="14" r="4"/><circle cx="15.5" cy="8.5" r="3"/><circle cx="17" cy="16.5" r="1.8"/>',
    hexbin: '<path d="M7 4.5l3 1.7v3.5L7 11.4 4 9.7V6.2zM14 4.5l3 1.7v3.5l-3 1.7-3-1.7V6.2zM10.5 10.8l3 1.7V16l-3 1.7-3-1.7v-3.5z"/><path d="M14 4.5l3 1.7v3.5l-3 1.7-3-1.7V6.2z" fill="currentColor" fill-opacity=".35"/>',
    waffle: '<rect x="4" y="4" width="4.5" height="4.5" rx=".8" fill="currentColor"/><rect x="9.75" y="4" width="4.5" height="4.5" rx=".8" fill="currentColor"/><rect x="15.5" y="4" width="4.5" height="4.5" rx=".8"/><rect x="4" y="9.75" width="4.5" height="4.5" rx=".8" fill="currentColor"/><rect x="9.75" y="9.75" width="4.5" height="4.5" rx=".8"/><rect x="15.5" y="9.75" width="4.5" height="4.5" rx=".8"/><rect x="4" y="15.5" width="4.5" height="4.5" rx=".8"/><rect x="9.75" y="15.5" width="4.5" height="4.5" rx=".8"/><rect x="15.5" y="15.5" width="4.5" height="4.5" rx=".8"/>',
    stacked: `${AXES}<path d="M7 20v-9h3.5v9M12 20V7h3.5v13M7 15.5h3.5M12 13h3.5M17 20v-5h3v5M17 17.5h3"/>`,
    treemap: '<rect x="3.5" y="3.5" width="17" height="17" rx="1.5"/><path d="M11 3.5v17M11 12h9.5M15.5 12v8.5M3.5 14h7.5"/>',
    sunburst: '<circle cx="12" cy="12" r="3.5"/><path d="M12 3.5a8.5 8.5 0 0 1 8.5 8.5h-5A3.5 3.5 0 0 0 12 8.5z" fill="currentColor" fill-opacity=".35"/><circle cx="12" cy="12" r="8.5"/><path d="M12 3.5v5M3.5 12h5M15.5 12h5"/>',
    radar: '<path d="M12 3.5l8 6-3 9.5H7L4 9.5z"/><path d="M12 7.5l4.5 3.2-1.7 5.3H9.2l-1.7-5.3z" fill="currentColor" fill-opacity=".3"/><path d="M12 12V3.5M12 12l8-2.5M12 12l5 7M12 12l-5 7M12 12L4 9.5"/>',
    ecdf: `${AXES}<path d="M6 18h3v-3h3v-4h3V8h3V5.5h2"/>`,
    pareto: `${AXES}<path d="M6.5 20V8h2.5v12M10.5 20v-7.5H13V20M14.5 20v-4h2.5v4"/><path d="M7.5 9l4-3 4.5-1.5 3-.5"/>`,
    chord: '<circle cx="12" cy="12" r="8.5"/><path d="M5.5 7.5c4 3 4 5 1 9.5M18.5 7.5C13 9 11 12 12 20.5M14 3.7c-1 5-3.5 7.5-10.4 6.4"/>',
    density: `${AXES}<path d="M5.5 19c3 0 3.5-12 6.5-12s3.5 12 6.5 12"/>`,
    violin: '<path d="M12 3c-1.5 3-4 3.5-4 7s3 3.5 3 6-2 3.5-2 5h6c0-1.5-2-2.5-2-5s3-2.5 3-6-2.5-4-4-7z"/><path d="M10 12h4"/>',
    // ---- Tools
    map: '<path d="M3.5 6.5l5.5-2.5 6 2.5 5.5-2.5v13.5L15 20l-6-2.5-5.5 2.5z"/><path d="M9 4v13.5M15 6.5V20"/>',
    transforms: '<path d="M4 6h5l3 6-3 6H4M20 6h-5l-3 6 3 6h5"/><circle cx="12" cy="12" r="1.3" fill="currentColor"/>',
    lab: '<path d="M9.5 3.5h5M10.5 3.5v6l-5.5 9.5a1.2 1.2 0 0 0 1 1.8h12a1.2 1.2 0 0 0 1-1.8L13.5 9.5v-6"/><path d="M7.5 15h9"/>',
    clear: '<path d="M4 7h16M9.5 7V4.5h5V7M6.5 7l1 12.5h9l1-12.5M10 11v5M14 11v5"/>',
    close: '<path d="M6 6l12 12M18 6L6 18"/>',
    arrow: '<path d="M4 12h15M13 6l6 6-6 6"/>',
    run: '<path d="M8 5.5v13l10-6.5z" fill="currentColor"/>',
};

/**
 * SVG markup of an icon.
 *
 * @param name Icon name; an unknown name draws an empty square.
 * @param size Rendered size in pixels.
 */
export function icon(name: string, size = 20): string {
    const body = PATHS[name] ?? '<rect x="4" y="4" width="16" height="16" rx="2"/>';
    return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
}
