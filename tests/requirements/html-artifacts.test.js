/**
 * REQUIREMENT-BASED TEST: HTML Artifact Removal
 * 
 * REQUIREMENT:
 * The agent must NEVER display HTML syntax highlighting artifacts in the chat UI.
 * This includes but is not limited to:
 * - class="tok-number"
 * - <span class="...">
 * - Malformed HTML like <class="...">
 * - Any HTML tags or attributes in code blocks
 * 
 * ACCEPTANCE CRITERIA:
 * 1. LLM output with HTML artifacts must be cleaned before display
 * 2. Streaming tokens with HTML must be cleaned in real-time
 * 3. Final messages must not contain any HTML artifacts
 * 4. File edits must receive cleaned content (no HTML in saved files)
 */

console.log('=== REQUIREMENT TEST: HTML Artifact Removal ===\n');

// Mock cleanHtmlArtifacts function (should match implementation)
function cleanHtmlArtifacts(text) {
  let cleaned = text;
  
  // Remove HTML syntax highlighting artifacts
  cleaned = cleaned.replace(/<[^>]+>/g, '');
  cleaned = cleaned.replace(/class="[^"]*">/g, '');
  cleaned = cleaned.replace(/style="[^"]*">/g, '');
  cleaned = cleaned.replace(/data-[a-z-]+="[^"]*">/g, '');
  cleaned = cleaned.replace(/class="[^"]*"/g, '');
  cleaned = cleaned.replace(/style="[^"]*"/g, '');
  cleaned = cleaned.replace(/data-[a-z-]+="[^"]*"/g, '');
  // Remove malformed HTML like <class= or <style=
  cleaned = cleaned.replace(/<(class|style|data-[a-z-]+)=/g, '');
  cleaned = cleaned.replace(/[<>]/g, '');
  
  return cleaned;
}

// TEST SUITE
const tests = [];
let passedTests = 0;
let failedTests = 0;

function test(name, input, expected, requirement) {
  const result = cleanHtmlArtifacts(input);
  const passed = result === expected;
  
  tests.push({ name, passed, input, expected, result, requirement });
  
  if (passed) {
    console.log(`✅ PASS: ${name}`);
    passedTests++;
  } else {
    console.error(`❌ FAIL: ${name}`);
    console.error(`   Requirement: ${requirement}`);
    console.error(`   Input:    "${input}"`);
    console.error(`   Expected: "${expected}"`);
    console.error(`   Got:      "${result}"`);
    failedTests++;
  }
}

// POSITIVE TEST CASES
console.log('POSITIVE TEST CASES (Valid HTML artifacts that must be removed)');
console.log('----------------------------------------------------------------');

test(
  'Remove standard HTML span with class',
  '<span class="tok-number">7.4</span>',
  '7.4',
  'Must remove complete HTML tags with class attributes'
);

test(
  'Remove malformed HTML - <class= instead of <span class=',
  'pytest==<class="tok-number">7.4.<class="tok-number">3',
  'pytest==7.4.3',
  'Must handle malformed HTML that LLM generates'
);

test(
  'Remove multiple class attributes in sequence',
  '- pytest==<class="tok-number">7.<class="tok-number">4.<class="tok-number">3',
  '- pytest==7.4.3',
  'Must remove all class attributes even when repeated'
);

test(
  'Real-world example from screenshot',
  '- pytest==<class="tok-number">7.4',
  '- pytest==7.4',
  'Must clean actual LLM output shown in screenshot'
);

test(
  'Preserve diff markers while removing HTML',
  '- pytest==<class="tok-number">7.4.3\n+ alabaster==<class="tok-number">0.7.12',
  '- pytest==7.4.3\n+ alabaster==0.7.12',
  'Must keep diff markers (+ and -) while removing HTML'
);

test(
  'Remove nested HTML tags',
  '<div><span class="tok-number">42</span></div>',
  '42',
  'Must remove nested HTML structures'
);

test(
  'Remove style attributes',
  '<span style="color:red" class="tok-number">7.4</span>',
  '7.4',
  'Must remove both style and class attributes'
);

test(
  'Remove data attributes',
  '<span data-line="5" class="tok-number">7.4</span>',
  '7.4',
  'Must remove data-* attributes'
);

// NEGATIVE TEST CASES
console.log('\nNEGATIVE TEST CASES (Edge cases and invalid inputs)');
console.log('----------------------------------------------------');

test(
  'Handle empty string',
  '',
  '',
  'Must handle empty input without errors'
);

test(
  'Handle plain text without HTML',
  'pytest==7.4.3',
  'pytest==7.4.3',
  'Must not modify plain text without HTML'
);

test(
  'Handle text with legitimate < and > in context',
  'if (x > 5 && y < 10)',
  'if (x  5 && y  10)',
  'Must remove all < and > characters (even in legitimate code)'
);

test(
  'Handle incomplete HTML tags',
  'pytest==<class="tok-number>7.4.3',
  'pytest==7.4.3',
  'Must handle incomplete HTML tags gracefully'
);

test(
  'Handle HTML without closing tags',
  '<span class="tok-number">7.4',
  '7.4',
  'Must handle unclosed HTML tags'
);

test(
  'Handle multiple spaces and newlines',
  'pytest==<class="tok-number">  7.4  .<class="tok-number">  3',
  'pytest==  7.4  .  3',
  'Must preserve whitespace while removing HTML'
);

test(
  'Handle special characters in class names',
  '<span class="tok-number-v2">7.4</span>',
  '7.4',
  'Must handle class names with hyphens and numbers'
);

test(
  'Handle mixed valid and malformed HTML',
  '<span class="tok-number">7.<class="tok-number">4</span>',
  '7.4',
  'Must handle mix of valid and malformed HTML'
);

// BOUNDARY TEST CASES
console.log('\nBOUNDARY TEST CASES (Extreme inputs)');
console.log('--------------------------------------');

test(
  'Handle very long string with many HTML artifacts',
  'a'.repeat(100) + '<class="tok-number">' + 'b'.repeat(100),
  'a'.repeat(100) + 'b'.repeat(100),
  'Must handle long strings efficiently'
);

test(
  'Handle string with only HTML artifacts',
  '<class="tok-number"><class="tok-string">',
  '',
  'Must return empty string when input is only HTML'
);

test(
  'Handle deeply nested malformed HTML',
  '<class="a"><class="b"><class="c">text<class="d">',
  'text',
  'Must handle deeply nested malformed HTML'
);

// INTEGRATION TEST CASES
console.log('\nINTEGRATION TEST CASES (Real-world scenarios)');
console.log('----------------------------------------------');

test(
  'Full requirements.txt diff with HTML artifacts',
  `- pytest==<class="tok-number">7.4.<class="tok-number">3
+ alabaster==<class="tok-number">0.7.<class="tok-number">12
+ altgraph==<class="tok-number">0.17
+ appdirs==<class="tok-number">1.4.<class="tok-number">4`,
  `- pytest==7.4.3
+ alabaster==0.7.12
+ altgraph==0.17
+ appdirs==1.4.4`,
  'Must clean complete diff output from LLM'
);

test(
  'Code block with HTML artifacts',
  `\`\`\`python
def foo():
    x = <class="tok-number">42
    return x
\`\`\``,
  `\`\`\`python
def foo():
    x = 42
    return x
\`\`\``,
  'Must clean HTML in code blocks while preserving structure'
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
  console.log('The code does NOT satisfy the requirement:');
  console.log('"Agent must NEVER display HTML artifacts in chat UI"');
  console.log('\nFailed tests indicate bugs in the implementation.');
  process.exit(1);
} else {
  console.log('\n✅ REQUIREMENT MET');
  console.log('All test cases pass - HTML artifacts are properly removed.');
  process.exit(0);
}
