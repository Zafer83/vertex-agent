/**
 * Test: Warum erscheinen HTML-Artefakte im Chat?
 * Simuliert Agent-Output und prüft wo HTML-Cleaning fehlt
 */

console.log('=== PROBLEM ===');
console.log('Im Chat wird angezeigt:');
const chatDisplay = `pytest==class="tok-number">7.4.class="tok-number">3
+ alabaster==class="tok-number">0.7.class="tok-number">12`;
console.log(chatDisplay);

console.log('\n=== ANALYSE ===');
console.log('1. In der DATEI ist der Code korrekt (pytest==7.4.3)');
console.log('2. Im CHAT wird HTML angezeigt (class="tok-number")');
console.log('');
console.log('Das bedeutet:');
console.log('- cleanHtmlArtifacts() funktioniert für FileEditEngine (Datei ist sauber)');
console.log('- ABER: Der Agent-Output für das Chat-UI wird NICHT gereinigt');
console.log('');
console.log('Der Agent generiert vermutlich:');
const agentRawOutput = `\`\`\`txt requirements.txt
- pytest==<class="tok-number">7.4.<class="tok-number">3
+ alabaster==<class="tok-number">0.7.<class="tok-number">12
\`\`\``;
console.log(agentRawOutput);

console.log('\n=== LÖSUNG ===');
console.log('Das Chat-UI muss den Agent-Output AUCH durch cleanHtmlArtifacts schicken');
console.log('ODER: Der Agent darf gar keine HTML-Artefakte generieren');
console.log('');
console.log('Prüfen:');
console.log('1. Wo kommt das HTML her? (LLM generiert es direkt?)');
console.log('2. Wird der Chat-Content gereinigt bevor er angezeigt wird?');
console.log('3. chatPanel.ts - wie wird der Agent-Output gerendert?');

console.log('\n=== TEST: HTML-CLEANING ===');

function cleanHtmlArtifacts(code) {
  let cleaned = code;
  
  // Remove HTML syntax highlighting artifacts
  cleaned = cleaned.replace(/<[^>]+>/g, '');
  cleaned = cleaned.replace(/class="[^"]*">/g, '');
  cleaned = cleaned.replace(/style="[^"]*">/g, '');
  cleaned = cleaned.replace(/data-[a-z-]+="[^"]*">/g, '');
  cleaned = cleaned.replace(/class="[^"]*"/g, '');
  cleaned = cleaned.replace(/style="[^"]*"/g, '');
  cleaned = cleaned.replace(/data-[a-z-]+="[^"]*"/g, '');
  cleaned = cleaned.replace(/[<>]/g, '');
  
  return cleaned;
}

const dirtyOutput = `pytest==<class="tok-number">7.4.<class="tok-number">3
alabaster==<class="tok-number">0.7.<class="tok-number">12`;

console.log('Dirty output:');
console.log(dirtyOutput);

const cleanOutput = cleanHtmlArtifacts(dirtyOutput);
console.log('\nCleaned output:');
console.log(cleanOutput);

console.log('\n✅ cleanHtmlArtifacts funktioniert!');
console.log('Problem: Chat-UI wendet diese Funktion nicht an');
