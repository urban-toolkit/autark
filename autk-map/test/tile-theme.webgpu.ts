import { applyTileTheme } from '../src/tile-theme';

/** Real browser bitmap/canvas conversion, including transparent pixels and ownership. */
export async function runWebGpuCases() {
    const canvas = new OffscreenCanvas(4, 1);
    const context = canvas.getContext('2d')!;
    context.putImageData(new ImageData(new Uint8ClampedArray([
        0, 0, 0, 255, 255, 255, 255, 255, 255, 0, 0, 128, 0, 0, 0, 0,
    ]), 4, 1), 0, 0);
    const original = canvas.transferToImageBitmap();
    const checks: string[] = [];
    try {
        for (const theme of ['light', 'dark'] as const) {
            const themed = applyTileTheme(original, theme);
            try {
                context.clearRect(0, 0, 4, 1);
                context.drawImage(themed, 0, 0);
                const pixels = context.getImageData(0, 0, 4, 1).data;
                if (pixels[3] !== 255 || Math.abs(pixels[11]! - 128) > 1 || pixels[15] !== 0) throw new Error(`${theme}: alpha changed`);
                if (theme === 'dark' ? pixels[0]! <= pixels[4]! : pixels[0]! >= pixels[4]!) throw new Error(`${theme}: wrong contrast`);
                if (original.width !== 4 || themed.width !== 4 || themed.height !== 1) throw new Error(`${theme}: bitmap ownership or dimensions changed`);
                checks.push(`${theme}: bitmap conversion, contrast, alpha, dimensions, and input ownership`);
            } finally { themed.close(); }
        }
        return { status: 'passed', checks };
    } finally { original.close(); }
}
