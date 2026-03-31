/**
 * REQUIREMENT TEST: LLM Broken HTML Output
 * 
 * PROBLEM FROM USER:
 * Chat displays:
 * pytest==
 * class
 * ="tok-number">7.4.
 * class
 * ="tok-number">3
 * 
 * ROOT CAUSE:
 * LLM generates broken HTML like <class="tok-number"> instead of <span class="tok-number">
 * This broken HTML is being displayed as TEXT instead of being cleaned
 * 
 * REQUIREMENT:
 * LLM output with broken HTML must be cleaned before displaying in chat
 */

console.log('=== LLM BROKEN HTML OUTPUT TEST ===\n');

// Simulate what LLM actually generates (broken HTML)
const llmOutput = `pytest==<class="tok-number">7.4.<class="tok-number">3
alabaster==<class="tok-number">0.7.<class="tok-number">12
altgraph==<class="tok-number">0.17
appdirs==<class="tok-number">1.4.<class="tok-number">4`;

console.log('LLM RAW OUTPUT:');
console.log(llmOutput);
console.log('');

// What user sees in chat (broken)
const brokenChatDisplay = `pytest==
class
="tok-number">7.4.
class
="tok-number">3
alabaster==
class
="tok-number">0.7.
class
="tok-number">12`;

console.log('BROKEN CHAT DISPLAY (what user sees):');
console.log(brokenChatDisplay);
console.log('');

// cleanHtmlArtifacts function (should remove broken HTML)
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

// Expected clean output
const expectedClean = `pytest==7.4.3
alabaster==0.7.12
altgraph==0.17
appdirs==1.4.4`;

console.log('EXPECTED CLEAN OUTPUT:');
console.log(expectedClean);
console.log('');

// Test the cleaning
const actualClean = cleanHtmlArtifacts(llmOutput);

console.log('ACTUAL CLEAN OUTPUT:');
console.log(actualClean);
console.log('');

// Verify
const passed = actualClean === expectedClean;

console.log('='.repeat(70));
console.log('TEST RESULT');
console.log('='.repeat(70));

if (passed) {
  console.log('✅ PASS: cleanHtmlArtifacts removes broken HTML correctly');
  console.log('');
  console.log('DIAGNOSIS:');
  console.log('The cleanHtmlArtifacts function WORKS correctly.');
  console.log('');
  console.log('PROBLEM:');
  console.log('cleanHtmlArtifacts is NOT being called in chatPanel.ts!');
  console.log('');
  console.log('EVIDENCE:');
  console.log('Line 21-23 in chatPanel.ts says:');
  console.log('// Note: cleanHtmlArtifacts removed from chatPanel.ts');
  console.log('// HTML cleaning is only done in aiClient.ts for file edits');
  console.log('// The UI needs to render HTML for syntax highlighting');
  console.log('');
  console.log('FIX:');
  console.log('We need to clean LLM output BEFORE sending to chat UI.');
  console.log('But we need to be smart:');
  console.log('1. Clean broken HTML from LLM (like <class="tok-number">)');
  console.log('2. Keep legitimate HTML for syntax highlighting (like <span class="tok-keyword">)');
  console.log('');
  console.log('SOLUTION:');
  console.log('Clean LLM output in aiClient.ts BEFORE it goes to chat.');
  console.log('The highlightCodeLine() in chatPanel.ts will ADD proper HTML.');
  process.exit(0);
} else {
  console.log('❌ FAIL: cleanHtmlArtifacts does not work correctly');
  console.log('Expected:', expectedClean);
  console.log('Got:', actualClean);
  process.exit(1);
}
