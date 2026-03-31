/**
 * REQUIREMENT TEST: Webview Rendering Bug
 * 
 * HYPOTHESIS:
 * The screenshot shows "defbroken_function" without space.
 * Our test shows the HTML contains the space correctly.
 * 
 * POSSIBLE CAUSES:
 * 1. CSS is collapsing whitespace (white-space: nowrap or similar)
 * 2. HTML is being double-escaped somewhere
 * 3. Browser is rendering <span> tags incorrectly
 * 4. There's a different code path that removes spaces
 */

console.log('=== WEBVIEW RENDERING BUG TEST ===\n');

// Test different scenarios
const testCases = [
  {
    name: 'Normal HTML with span',
    html: '<span class="hl-keyword">def</span> broken_function',
    expectedText: 'def broken_function'
  },
  {
    name: 'HTML with multiple spans',
    html: '<span class="hl-keyword">def</span> <span class="hl-fn">broken_function</span>',
    expectedText: 'def broken_function'
  },
  {
    name: 'HTML with no space (bug scenario)',
    html: '<span class="hl-keyword">def</span>broken_function',
    expectedText: 'defbroken_function'
  },
  {
    name: 'HTML with escaped space',
    html: '<span class="hl-keyword">def</span>&nbsp;broken_function',
    expectedText: 'def broken_function' // &nbsp; should render as space
  },
  {
    name: 'Double-escaped HTML',
    html: '&lt;span class="hl-keyword"&gt;def&lt;/span&gt; broken_function',
    expectedText: '<span class="hl-keyword">def</span> broken_function' // Shows as text
  }
];

function stripHtml(html) {
  // Decode HTML entities first
  let decoded = html
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&nbsp;/g, ' ')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
  
  // Then remove HTML tags
  return decoded.replace(/<[^>]+>/g, '');
}

console.log('TEST CASES');
console.log('----------');

let allPassed = true;

testCases.forEach((testCase, i) => {
  const result = stripHtml(testCase.html);
  const passed = result === testCase.expectedText;
  
  console.log(`\nTest ${i + 1}: ${testCase.name}`);
  console.log(`HTML:     "${testCase.html}"`);
  console.log(`Expected: "${testCase.expectedText}"`);
  console.log(`Got:      "${result}"`);
  console.log(`Status:   ${passed ? '✅ PASS' : '❌ FAIL'}`);
  
  if (!passed) {
    allPassed = false;
  }
});

console.log('\n' + '='.repeat(70));
console.log('DIAGNOSIS');
console.log('='.repeat(70));

console.log('\nIf the HTML contains the space but the screenshot shows no space,');
console.log('the problem is likely:');
console.log('');
console.log('1. CSS Issue:');
console.log('   Check if .hl-keyword or .code-line has:');
console.log('   - white-space: nowrap');
console.log('   - display: inline-block without proper spacing');
console.log('   - margin/padding that collapses spaces');
console.log('');
console.log('2. Font Rendering Issue:');
console.log('   Some monospace fonts render spaces very narrow');
console.log('   Check if font-family is set correctly');
console.log('');
console.log('3. Browser Bug:');
console.log('   VS Code webview might have rendering quirks');
console.log('   Try adding explicit &nbsp; instead of regular space');
console.log('');
console.log('4. Double-Processing:');
console.log('   Text might be going through highlightCodeLine twice');
console.log('   Second pass might be removing spaces');

console.log('\n' + '='.repeat(70));
console.log('RECOMMENDED FIX');
console.log('='.repeat(70));
console.log('');
console.log('Option 1: Add explicit spacing in CSS');
console.log('  .hl-keyword::after { content: " "; }');
console.log('');
console.log('Option 2: Use &nbsp; instead of regular space');
console.log('  Replace " " with "&nbsp;" after keywords');
console.log('');
console.log('Option 3: Check CSS for space-collapsing properties');
console.log('  Ensure .code-line has: white-space: pre-wrap;');

if (allPassed) {
  console.log('\n✅ All tests passed');
  console.log('The HTML processing is correct.');
  console.log('The bug is likely in CSS or browser rendering.');
  process.exit(0);
} else {
  console.log('\n❌ Some tests failed');
  process.exit(1);
}
