import { ColorMapDomainStrategy, type ColorHEX, type ColorMapConfig } from '@urban-toolkit/autk-core';

// Published CORINE colors present in the Lisbon crop, in class order.
export const CORINE_CLASSES = [
    ['Continuous urban fabric', '#e6004d'],
    ['Discontinuous urban fabric', '#ff0000'],
    ['Industrial or commercial units', '#cc4df2'],
    ['Road and rail networks', '#cc0000'],
    ['Port areas', '#e6cccc'],
    ['Airports', '#e6cce6'],
    ['Construction sites', '#ff4dff'],
    ['Green urban areas', '#ffa6ff'],
    ['Sport and leisure facilities', '#ffe6ff'],
    ['Non-irrigated arable land', '#ffffa8'],
    ['Permanently irrigated land', '#ffff00'],
    ['Olive groves', '#e6a600'],
    ['Pastures', '#e6e64d'],
    ['Complex cultivation patterns', '#ffe64d'],
    ['Agriculture with natural vegetation', '#e6cc4d'],
    ['Broad-leaved forest', '#80ff00'],
    ['Coniferous forest', '#00a600'],
    ['Mixed forest', '#4dff00'],
    ['Natural grasslands', '#ccf24d'],
    ['Moors and heathland', '#a6ff80'],
    ['Transitional woodland and shrub', '#a6f200'],
    ['Inland marshes', '#a6a6ff'],
    ['Salt marshes', '#ccccff'],
    ['Estuaries', '#a6ffe6'],
] satisfies [string, ColorHEX][];

export const CORINE_PALETTE = {
    type: 'categorical',
    domainSpec: { type: ColorMapDomainStrategy.USER, params: CORINE_CLASSES.map(([name]) => name) },
    colors: CORINE_CLASSES.map(([, color]) => color),
} satisfies ColorMapConfig;
