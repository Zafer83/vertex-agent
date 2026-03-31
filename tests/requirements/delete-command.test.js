/**
 * REQUIREMENT-BASED TEST: DELETE Command Interpretation
 * 
 * REQUIREMENT:
 * When user says "Lösche pytest" or "delete pytest", the agent must:
 * 1. Interpret this as a line deletion, NOT a file deletion
 * 2. Generate a diff with "- pytest==7.4.3" (or similar)
 * 3. NOT generate "rm -rf pytest" command
 * 4. NOT generate ```bash pytest\nDELETE``` format
 * 
 * ACCEPTANCE CRITERIA:
 * 1. "Lösche pytest" → generates diff format, not DELETE command
 * 2. "Lösche die zeile pytest" → generates diff format
 * 3. "Lösche pytest==7.4.3" → generates diff format
 * 4. Only "Lösche pytest.py" or "Lösche requirements.txt" → DELETE command
 */

console.log('=== REQUIREMENT TEST: DELETE Command Interpretation ===\n');

// Mock intent detection functions
function isDeleteIntent(text) {
  const lower = text.toLowerCase();
  return lower.includes('lösche') || lower.includes('delete') || lower.includes('entferne') || lower.includes('remove');
}

function isLineLevelEditIntent(text) {
  const lower = text.toLowerCase();
  const lineSignals = [
    'zeile', 'line', 'eintrag', 'entry',
    'füge hinzu', 'add', 'ändere', 'change', 'modify',
    'ersetze', 'replace'
  ];
  return lineSignals.some(signal => lower.includes(signal));
}

function isFileDeleteIntent(text) {
  const lower = text.toLowerCase();
  
  // If explicit line-level keywords, NOT a file delete
  const hasLineKeyword = /zeile|line|eintrag|entry/i.test(text);
  const hasContextKeyword = /aus|from|in.*hinzu|in.*add/i.test(text);
  
  if (hasLineKeyword || hasContextKeyword) {
    return false; // Line deletion, not file deletion
  }
  
  // File delete: has file extension or explicit file reference
  const hasFileExtension = /\.(py|js|ts|txt|json|yaml|yml|md|html|css)(\s|$)/i.test(text);
  const hasFileKeyword = /datei|file|ordner|folder|directory/i.test(text);
  
  return isDeleteIntent(text) && (hasFileExtension || hasFileKeyword);
}

function shouldGenerateDiff(text) {
  if (!isDeleteIntent(text)) return false;
  if (isFileDeleteIntent(text)) return false; // File delete → use DELETE command
  return true; // Line delete → use diff format
}

// TEST SUITE
const tests = [];
let passedTests = 0;
let failedTests = 0;

function test(name, input, expectedDiff, expectedDelete, requirement) {
  const shouldDiff = shouldGenerateDiff(input);
  const shouldDelete = isFileDeleteIntent(input);
  
  const passed = (shouldDiff === expectedDiff) && (shouldDelete === expectedDelete);
  
  tests.push({ name, passed, input, expectedDiff, expectedDelete, shouldDiff, shouldDelete, requirement });
  
  if (passed) {
    console.log(`✅ PASS: ${name}`);
    passedTests++;
  } else {
    console.error(`❌ FAIL: ${name}`);
    console.error(`   Requirement: ${requirement}`);
    console.error(`   Input: "${input}"`);
    console.error(`   Expected: Diff=${expectedDiff}, Delete=${expectedDelete}`);
    console.error(`   Got:      Diff=${shouldDiff}, Delete=${shouldDelete}`);
    failedTests++;
  }
}

// POSITIVE TEST CASES - Should generate DIFF
console.log('POSITIVE TEST CASES (Should generate DIFF format)');
console.log('--------------------------------------------------');

test(
  'User says "Lösche pytest"',
  'Lösche pytest',
  true,  // Should generate diff
  false, // Should NOT generate DELETE
  'Must interpret as line deletion, not file deletion'
);

test(
  'User says "Lösche die zeile pytest"',
  'Lösche die zeile pytest in requirements.txt',
  true,
  false,
  'Explicit "zeile" keyword means line deletion'
);

test(
  'User says "delete pytest"',
  'delete pytest',
  true,
  false,
  'English "delete" without file extension means line deletion'
);

test(
  'User says "Entferne pytest==7.4.3"',
  'Entferne pytest==7.4.3',
  true,
  false,
  'Package name with version is a line, not a file'
);

test(
  'User says "Lösche pytest und füge alabaster hinzu"',
  'Lösche pytest und füge alabaster==0.7.12 hinzu',
  true,
  false,
  'Combined delete+add operation means line edit'
);

// NEGATIVE TEST CASES - Should generate DELETE command
console.log('\nNEGATIVE TEST CASES (Should generate DELETE command)');
console.log('-----------------------------------------------------');

test(
  'User says "Lösche pytest.py"',
  'Lösche pytest.py',
  false, // Should NOT generate diff
  true,  // Should generate DELETE
  'File with extension means file deletion'
);

test(
  'User says "Lösche requirements.txt"',
  'Lösche requirements.txt',
  false,
  true,
  'File with .txt extension means file deletion'
);

test(
  'User says "Lösche die Datei pytest.py"',
  'Lösche die Datei pytest.py',
  false,
  true,
  'Explicit "Datei" keyword means file deletion'
);

test(
  'User says "delete file requirements.txt"',
  'delete file requirements.txt',
  false,
  true,
  'Explicit "file" keyword means file deletion'
);

// EDGE CASES
console.log('\nEDGE CASES (Ambiguous inputs)');
console.log('-------------------------------');

test(
  'User says "Lösche pytest aus requirements.txt"',
  'Lösche pytest aus requirements.txt',
  true,
  false,
  'Context "aus requirements.txt" means delete line FROM file'
);

test(
  'User says "Lösche alles"',
  'Lösche alles',
  true,
  false,
  'Ambiguous - default to diff format (safer)'
);

test(
  'User says "Lösche den Ordner pytest"',
  'Lösche den Ordner pytest',
  false,
  true,
  'Explicit "Ordner" means directory deletion'
);

// SUMMARY
console.log('\n' + '='.repeat(70));
console.log('TEST SUMMARY');
console.log('='.repeat(70));
console.log(`Total tests: ${tests.length}`);
console.log(`✅ Passed: ${passedTests}`);
console.log(`❌ Failed: ${failedTests}`);
console.log(`Success rate: ${((passedTests / tests.length) * 100).toFixed(1)}%`);

if (failedTests > 0) {
  console.log('\n⚠️  REQUIREMENT NOT MET');
  console.log('The code does NOT correctly distinguish between:');
  console.log('- Line deletion (should use diff format)');
  console.log('- File deletion (should use DELETE command)');
  process.exit(1);
} else {
  console.log('\n✅ REQUIREMENT MET');
  console.log('DELETE command interpretation is correct.');
  process.exit(0);
}
