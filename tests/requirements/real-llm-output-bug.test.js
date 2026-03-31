/**
 * REQUIREMENT TEST: Real LLM Output Bug
 * 
 * ACTUAL LLM OUTPUT FROM SCREENSHOT:
 * pytest==class="tok-number">7.4.class="tok-number">3
 * 
 * The LLM is generating class="tok-number"> DIRECTLY in text
 * NOT as <span class="tok-number">
 * 
 * This is DIFFERENT from what we tested before!
 */

console.log('=== REAL LLM OUTPUT BUG TEST ===\n');

// Current cleanHtmlArtifacts from aiClient.ts
function cleanHtmlArtifacts(text) {
  let cleaned = text;
  
  // FIRST: Decode HTML entities
  cleaned = cleaned.replace(/&gt;/g, '>');
  cleaned = cleaned.replace(/&lt;/g, '<');
  cleaned = cleaned.replace(/&quot;/g, '"');
  cleaned = cleaned.replace(/&#39;/g, "'");
  cleaned = cleaned.replace(/&amp;/g, '&');
  
  // Remove HTML syntax highlighting artifacts
  cleaned = cleaned.replace(/<[^>]+>/g, '');
  cleaned = cleaned.replace(/class="[^"]*">/g, '');
  cleaned = cleaned.replace(/style="[^"]*">/g, '');
  cleaned = cleaned.replace(/data-[a-z-]+="[^"]*">/g, '');
  cleaned = cleaned.replace(/class="[^"]*"/g, '');
  cleaned = cleaned.replace(/style="[^"]*"/g, '');
  cleaned = cleaned.replace(/data-[a-z-]+="[^"]*"/g, '');
  cleaned = cleaned.replace(/<(class|style|data-[a-z-]+)=/g, '');
  cleaned = cleaned.replace(/[<>]/g, '');
  
  return cleaned;
}

// Test with ACTUAL LLM output from screenshot
const tests = [
  {
    name: 'ACTUAL LLM OUTPUT - pytest line',
    input: 'pytest==class="tok-number">7.4.class="tok-number">3',
    expected: 'pytest==7.4.3'
  },
  {
    name: 'ACTUAL LLM OUTPUT - alabaster line',
    input: 'alabaster==class="tok-number">0.7.class="tok-number">12',
    expected: 'alabaster==0.7.12'
  },
  {
    name: 'ACTUAL LLM OUTPUT - altgraph line',
    input: 'altgraph==class="tok-number">0.17',
    expected: 'altgraph==0.17'
  },
  {
    name: 'ACTUAL LLM OUTPUT - appdirs line',
    input: 'appdirs==class="tok-number">1.4.class="tok-number">4',
    expected: 'appdirs==1.4.4'
  }
];

let passed = 0;
let failed = 0;

console.log('TEST CASES (REAL LLM OUTPUT)');
console.log('-----------------------------\n');

tests.forEach((test, i) => {
  const result = cleanHtmlArtifacts(test.input);
  const testPassed = result === test.expected;
  
  if (testPassed) {
    console.log(`✅ Test ${i + 1}: ${test.name}`);
    passed++;
  } else {
    console.log(`❌ Test ${i + 1}: ${test.name}`);
    console.log(`   Input:    "${test.input}"`);
    console.log(`   Expected: "${test.expected}"`);
    console.log(`   Got:      "${result}"`);
    console.log('');
    
    // Show what patterns are in the input
    console.log('   Patterns found:');
    const classMatches = test.input.match(/class="[^"]*">/g);
    if (classMatches) {
      console.log(`   - class="..."> patterns: ${classMatches.length}`);
      classMatches.forEach(m => console.log(`     * ${m}`));
    }
    console.log('');
    
    failed++;
  }
});

console.log('='.repeat(70));
console.log('SUMMARY');
console.log('='.repeat(70));
console.log(`Passed: ${passed}/${tests.length}`);
console.log(`Failed: ${failed}/${tests.length}`);

if (failed > 0) {
  console.log('\n⚠️  CRITICAL: cleanHtmlArtifacts does NOT work on REAL LLM output!');
  console.log('\nThe regex /class="[^"]*">/g DOES match these patterns.');
  console.log('But something else is wrong.');
  console.log('\nPOSSIBLE CAUSES:');
  console.log('1. cleanHtmlArtifacts is NOT being called at all');
  console.log('2. cleanHtmlArtifacts is called AFTER the text is already in chat');
  console.log('3. The text goes through a different code path');
  console.log('4. VS Code is caching old version');
  process.exit(1);
} else {
  console.log('\n✅ All tests pass - cleanHtmlArtifacts works correctly');
  console.log('If user still sees the bug, the function is not being called!');
  process.exit(0);
}
