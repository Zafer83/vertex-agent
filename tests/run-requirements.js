const { readdirSync } = require('fs');
const { join } = require('path');
const { execFileSync } = require('child_process');

const dir = join(__dirname, 'requirements');
const files = readdirSync(dir).filter(f => f.endsWith('.test.js')).sort();

console.log(`Running ${files.length} requirement test files...\n`);

let failed = 0;

for (const file of files) {
  const path = join(dir, file);
  console.log(`▶ ${file}`);
  try {
    execFileSync(process.execPath, [path], { stdio: 'inherit' });
  } catch (err) {
    console.error(`\n✗ ${file} failed (exit code ${err.status})`);
    failed++;
  }
  console.log('');
}

if (failed > 0) {
  console.error(`✗ ${failed} of ${files.length} test files failed.`);
  process.exit(1);
}

console.log(`✓ All ${files.length} requirement test files passed.`);
