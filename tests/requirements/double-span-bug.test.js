/**
 * REQUIREMENT TEST: Double Span Bug
 * 
 * USER REPORT:
 * <span <span="" class="tok-keyword">class</span>="tok-number"&gt;0.17
 * 
 * PROBLEMS:
 * 1. Double <span> tags
 * 2. Escaped HTML (&gt; instead of >)
 * 3. Malformed HTML structure
 * 
 * This suggests LLM is generating very broken HTML that cleanHtmlArtifacts doesn't catch
 */

console.log('=== DOUBLE SPAN BUG TEST ===\n');

// Updated cleanHtmlArtifacts with HTML entity decoding
function cleanHtmlArtifacts(text) {
  let cleaned = text;
  
  // FIRST: Decode HTML entities (LLM sometimes generates &gt;, &lt;, etc.)
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
  // Remove malformed HTML like <class= or <style=
  cleaned = cleaned.replace(/<(class|style|data-[a-z-]+)=/g, '');
  cleaned = cleaned.replace(/[<>]/g, '');
  
  return cleaned;
}

// Test cases based on user's report
const tests = [
  {
    name: 'User reported bug - double span with escaped HTML',
    input: 'altgraph==<span <span="" class="tok-keyword">class</span>="tok-number"&gt;0.17',
    expected: 'altgraph==0.17'
  },
  {
    name: 'Escaped greater-than',
    input: 'value&gt;5',
    expected: 'value5' // After removing < and >
  },
  {
    name: 'Nested malformed spans',
    input: '<span class="tok-number"><span class="tok-number">7.4</span></span>',
    expected: '7.4'
  },
  {
    name: 'Mixed escaped and unescaped',
    input: 'pytest==<class="tok-number"&gt;7.4',
    expected: 'pytest==7.4'
  }
];

let passed = 0;
let failed = 0;

console.log('TEST CASES');
console.log('----------\n');

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
    failed++;
  }
  console.log('');
});

console.log('='.repeat(70));
console.log('SUMMARY');
console.log('='.repeat(70));
console.log(`Passed: ${passed}/${tests.length}`);
console.log(`Failed: ${failed}/${tests.length}`);

if (failed > 0) {
  console.log('\n⚠️  PROBLEM: cleanHtmlArtifacts does NOT handle all cases');
  console.log('\nMISSING PATTERNS:');
  console.log('1. Escaped HTML entities (&gt;, &lt;, &quot;)');
  console.log('2. Nested/double span tags');
  console.log('3. Malformed attributes like <span <span="">');
  console.log('\nSOLUTION:');
  console.log('Add HTML entity decoding BEFORE removing tags');
  console.log('Add more aggressive pattern matching for broken HTML');
  process.exit(1);
} else {
  console.log('\n✅ All tests pass');
  process.exit(0);
}
