/** Client-side color treatments for raster basemaps; baked-in features remain. */
export type TileTheme = 'original' | 'light' | 'dark';

const PALETTES = {
    light: { ink: [132, 145, 160], paper: [247, 249, 252] },
    dark: { ink: [143, 158, 178], paper: [27, 35, 48] },
} as const;

/** Remaps image luminance to a restrained palette without changing pixel alpha. */
export function themeTilePixels(pixels: Uint8ClampedArray, theme: TileTheme): void {
    if (theme === 'original') return;
    const { ink, paper } = PALETTES[theme];
    for (let i = 0; i < pixels.length; i += 4) {
        const luminance = (0.2126 * pixels[i]! + 0.7152 * pixels[i + 1]! + 0.0722 * pixels[i + 2]!) / 255;
        for (let channel = 0; channel < 3; channel++) {
            pixels[i + channel] = ink[channel]! + (paper[channel]! - ink[channel]!) * luminance;
        }
    }
}

/** Creates a themed bitmap. The caller owns both the input and returned bitmap. */
export function applyTileTheme(image: ImageBitmap, theme: Exclude<TileTheme, 'original'>): ImageBitmap {
    const canvas = new OffscreenCanvas(image.width, image.height);
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) throw new Error('Raster tile themes require a 2D canvas context.');
    context.drawImage(image, 0, 0);
    const pixels = context.getImageData(0, 0, image.width, image.height);
    themeTilePixels(pixels.data, theme);
    context.putImageData(pixels, 0, 0);
    return canvas.transferToImageBitmap();
}
