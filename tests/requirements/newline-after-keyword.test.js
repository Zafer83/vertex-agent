/**
 * REQUIREMENT TEST: Newline After Keyword Bug
 * 
 * USER REPORT:
 * def
 * calculate_sum
 * (x: float, y: float) -> float:
 * 
 * Expected: "def calculate_sum"
 * Got: "def\ncalculate_sum" (newline instead of space)
 * 
 * HYPOTHESIS:
 * cleanHtmlArtifacts might be removing spaces or converting them to newlines
 */

console.log('=== NEWLINE AFTER KEYWORD TEST ===\n');

// cleanHtmlArtifacts function
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

// Test cases
const tests = [
  {
    name: 'Simple keyword with space',
    input: 'def calculate_sum',
    expected: 'def calculate_sum'
  },
  {
    name: 'Keyword with newline (should preserve)',
    input: 'def\ncalculate_sum',
    expected: 'def\ncalculate_sum'
  },
  {
    name: 'Keyword with HTML and space',
    input: 'def<class="tok-keyword"> calculate_sum',
    expected: 'def calculate_sum'
  },
  {
    name: 'Keyword with HTML and newline',
    input: 'def<class="tok-keyword">\ncalculate_sum',
    expected: 'def\ncalculate_sum'
  },
  {
    name: 'Multiple spaces',
    input: 'def  calculate_sum',
    expected: 'def  calculate_sum'
  },
  {
    name: 'Tab character',
    input: 'def\tcalculate_sum',
    expected: 'def\tcalculate_sum'
  },
  {
    name: 'Real LLM output with broken HTML',
    input: 'def<class="tok-keyword"> calculate_sum<class="tok-fn">(x: float, y: float)',
    expected: 'def calculate_sum(x: float, y: float)'
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
    
    // Show character codes for debugging
    console.log(`   Expected chars: ${test.expected.split('').map(c => c.charCodeAt(0)).join(', ')}`);
    console.log(`   Got chars:      ${result.split('').map(c => c.charCodeAt(0)).join(', ')}`);
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
  console.log('\n⚠️  PROBLEM DETECTED');
  console.log('cleanHtmlArtifacts is modifying whitespace incorrectly!');
  process.exit(1);
} else {
  console.log('\n✅ ALL TESTS PASS');
  console.log('cleanHtmlArtifacts preserves whitespace correctly.');
  console.log('');
  console.log('If user still sees newlines after keywords, the problem is:');
  console.log('1. LLM is generating newlines (not spaces)');
  console.log('2. Something else is converting spaces to newlines');
  console.log('3. Browser rendering issue');
  process.exit(0);
}
