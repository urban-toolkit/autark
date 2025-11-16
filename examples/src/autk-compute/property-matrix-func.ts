import { GeojsonCompute } from 'autk-compute';
import { FeatureCollection } from 'geojson';

export class PropertyMatrixFunc {
  public async run(): Promise<void> {
    const imageWidth = 128;
    const imageHeight = 128;
    const targetColor = 128.0; // The color we want to find

    // Create synthetic GeoJSON with image data as matrices
    const geojson: FeatureCollection = {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          geometry: { type: 'Point', coordinates: [-73.935242, 40.73061] }, // NYC
          properties: {
            name: 'Image A - 25% target color',
            image: this.generateImage(imageWidth, imageHeight, targetColor, 0.25),
          },
        },
        {
          type: 'Feature',
          geometry: { type: 'Point', coordinates: [-118.243683, 34.052235] }, // LA
          properties: {
            name: 'Image B - 50% target color',
            image: this.generateImage(imageWidth, imageHeight, targetColor, 0.5),
          },
        },
        {
          type: 'Feature',
          geometry: { type: 'Point', coordinates: [-87.629798, 41.878113] }, // Chicago
          properties: {
            name: 'Image C - 75% target color',
            image: this.generateImage(imageWidth, imageHeight, targetColor, 0.75),
          },
        },
      ],
    };

    console.log('Processing images with dimensions:', `${imageWidth}x${imageHeight}`);
    console.log('Target color value:', targetColor);
    console.log('Total pixels per image:', imageWidth * imageHeight);

    const geojsonCompute = new GeojsonCompute();

    // Calculate percentage of pixels matching the target color
    console.log('\n=== Calculating Color Percentage in Images ===');
    const result = await geojsonCompute.computeFunctionIntoProperties({
      geojson,
      variableMapping: {
        img: 'image',
      },
      matrixVariables: {
        img: { rows: imageHeight, cols: imageWidth },
      },
      outputColumnName: 'color_percentage',
      wglsFunction: `
        // Count pixels that match the exact target color (128.0)
        let targetColor = 128.0;
        var matchCount = 0u;
        var totalPixels = img_rows * img_cols;
        
        for (var r = 0u; r < img_rows; r++) {
          for (var c = 0u; c < img_cols; c++) {
            let idx = r * img_cols + c;
            let pixelValue = img[idx];
            
            // Check for exact match
            if (pixelValue == targetColor) {
              matchCount++;
            }
          }
        }
        
        // Return percentage (0-100)
        return (f32(matchCount) / f32(totalPixels)) * 100.0;
      `,
    });

    console.log('\n=== Results ===');
    result.features.forEach((feature) => {
      const name = feature.properties?.name;
      const percentage = feature.properties?.compute?.color_percentage;
      console.log(`${name}: ${percentage?.toFixed(2)}% of pixels match color ${targetColor}`);
    });

    console.log('\n=== Image Analysis Complete ===');
  }

  public print(): void {
    const div = document.getElementById('output');
    if (div) {
      div.innerHTML = `
        <h2>Image Color Analysis Complete!</h2>
        <p>Check the console for detailed results.</p>
        <p>Test performed:</p>
        <ul>
          <li>✅ 128x128 pixel images analyzed</li>
          <li>✅ Exact color matching (value: 128)</li>
          <li>✅ Percentage calculation on GPU</li>
          <li>✅ Multiple images processed in parallel</li>
        </ul>
        <p><b>All image computations executed successfully on GPU!</b></p>
      `;
    }
  }

  // Helper function to generate a synthetic 128x128 image with patterns
  private generateImage(width: number, height: number, targetColor: number, colorPercentage: number): number[][] {
    const image: number[][] = [];
    const totalPixels = width * height;
    const targetPixelCount = Math.floor(totalPixels * colorPercentage);

    // Create array and fill with random colors (0-255)
    for (let row = 0; row < height; row++) {
      const rowData: number[] = [];
      for (let col = 0; col < width; col++) {
        rowData.push(Math.floor(Math.random() * 256));
      }
      image.push(rowData);
    }

    // Now replace some pixels with the target color to match the desired percentage
    let pixelsSet = 0;
    for (let row = 0; row < height && pixelsSet < targetPixelCount; row++) {
      for (let col = 0; col < width && pixelsSet < targetPixelCount; col++) {
        image[row][col] = targetColor;
        pixelsSet++;
      }
    }

    return image;
  }
}

async function main() {
  const example = new PropertyMatrixFunc();

  await example.run();
  example.print();
}

main();
