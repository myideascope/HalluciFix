import { PurgeCSS } from 'purgecss';
import fs from 'fs';
import path from 'path';

async function analyzeCSS() {
  const purgeCSS = new PurgeCSS();

  const result = await purgeCSS.purge({
    content: [
      'src/**/*.{js,ts,jsx,tsx,html}',
      'index.html'
    ],
    css: ['src/index.css'],
    safelist: [
      // Common dynamic classes
      /^bg-/,
      /^text-/,
      /^border-/,
      /^hover:/,
      /^focus:/,
      /^dark:/,
      /^lg:/,
      /^md:/,
      /^sm:/,
      /^xl:/,
      // Custom utilities
      'bg-primary',
      'bg-primary-hover',
      'bg-surface',
      'bg-surface-hover',
      'text-primary',
      'text-secondary',
      'text-tertiary',
      'border-default',
      'shadow-custom-sm',
      'shadow-custom-md',
      'shadow-custom-lg'
    ]
  });

  const originalSize = fs.statSync('src/index.css').size;
  const purgedCSS = result[0].css;
  const purgedSize = Buffer.byteLength(purgedCSS, 'utf8');

  console.log('CSS Analysis Results:');
  console.log(`Original CSS size: ${originalSize} bytes`);
  console.log(`Purged CSS size: ${purgedSize} bytes`);
  console.log(`Reduction: ${((originalSize - purgedSize) / originalSize * 100).toFixed(2)}%`);

  // Write purged CSS to a temporary file for comparison
  fs.writeFileSync('dist/purged.css', purgedCSS);

  // Analyze what was removed
  const originalLines = fs.readFileSync('src/index.css', 'utf8').split('\n');
  const purgedLines = purgedCSS.split('\n');

  console.log(`\nOriginal lines: ${originalLines.length}`);
  console.log(`Purged lines: ${purgedLines.length}`);

  return {
    originalSize,
    purgedSize,
    reduction: ((originalSize - purgedSize) / originalSize * 100)
  };
}

analyzeCSS().catch(console.error);