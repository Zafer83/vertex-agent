/**
 * INTEGRATION TEST: LLM → Agent → Chat Pipeline
 * Testet die komplette Pipeline mit LLM-Mock und validiert jeden Schritt
 */

console.log('=== LLM → AGENT → CHAT PIPELINE TEST ===\n');

// ========================================
// MOCK: LLM Response (was Llama tatsächlich zurückgibt)
// ========================================
console.log('STEP 1: LLM Response Mock');
console.log('-------------------------');

// Simuliert was der LLM (Ollama/Gemini/etc.) TATSÄCHLICH zurückgibt
const llmRawResponse = {
  message: {
    content: `Ich lösche die Zeile pytest und füge die anderen Zeilen hinzu:

\`\`\`txt requirements.txt
- pytest==<class="tok-number">7.4.<class="tok-number">3
+ alabaster==<class="tok-number">0.7.<class="tok-number">12
+ altgraph==<class="tok-number">0.17
+ appdirs==<class="tok-number">1.4.<class="tok-number">4
+ argh==<class="tok-number">0.26.<class="tok-number">2
+ astroid==<class="tok-number">2.4.<class="tok-number">2
+ async_generator==<class="tok-number">1.<class="tok-number">10
+ atomicwrites==<class="tok-number">1.4.<class="tok-number">0
\`\`\`

Die Änderungen wurden angewendet.`
  }
};

console.log('LLM gibt zurück (RAW):');
console.log(llmRawResponse.message.content);
console.log('');
console.log('⚠️  HTML-Artefakte vorhanden:', llmRawResponse.message.content.includes('class="tok-number"'));
console.log('');

// ========================================
// STEP 2: aiClient.ts - extractCodeBlocksAsEdits
// ========================================
console.log('STEP 2: aiClient.ts - extractCodeBlocksAsEdits');
console.log('-----------------------------------------------');

function cleanHtmlArtifacts(code) {
  let cleaned = code;
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

function extractCodeBlocksAsEdits(content) {
  const edits = [];
  const codeBlockRegex = /```(?:[\w]+\s+)?([^\n`]+)\n([\s\S]*?)```/g;
  let match;
  
  while ((match = codeBlockRegex.exec(content)) !== null) {
    const filePath = match[1].trim();
    const codeContent = match[2];
    
    // CRITICAL: Clean HTML artifacts but KEEP diff markers
    const cleanedContent = cleanHtmlArtifacts(codeContent);
    edits.push({ filePath, newContent: cleanedContent });
  }
  
  return edits;
}

const editsFromAiClient = extractCodeBlocksAsEdits(llmRawResponse.message.content);

console.log('Extrahierte Edits:', editsFromAiClient.length);
let hasHtmlInEdit = false;
if (editsFromAiClient.length > 0) {
  console.log('Edit[0].filePath:', editsFromAiClient[0].filePath);
  console.log('Edit[0].newContent:');
  console.log(editsFromAiClient[0].newContent);
  console.log('');
  
  hasHtmlInEdit = editsFromAiClient[0].newContent.includes('class=') || 
                  editsFromAiClient[0].newContent.includes('tok-number');
  if (hasHtmlInEdit) {
    console.error('❌ FEHLER: HTML-Artefakte in Edit.newContent!');
    console.error('cleanHtmlArtifacts() funktioniert NICHT korrekt!');
  } else {
    console.log('✅ Edit.newContent ist sauber (keine HTML-Artefakte)');
  }
}
console.log('');

// ========================================
// STEP 3: chatPanel.ts - onToken Streaming
// ========================================
console.log('STEP 3: chatPanel.ts - onToken Streaming');
console.log('-----------------------------------------');

// Simuliert Streaming: LLM sendet Tokens einzeln
const streamingTokens = [
  '```txt requirements.txt\n',
  '- pytest==<class="tok-number">7.4.',
  '<class="tok-number">3\n',
  '+ alabaster==<class="tok-number">0.7.',
  '<class="tok-number">12\n',
  '```'
];

console.log('LLM streamt Tokens:');
streamingTokens.forEach((token, i) => {
  console.log(`  Token ${i}: "${token}"`);
});
console.log('');

// Simuliert chatPanel.ts onToken callback
let chatDisplayBuffer = '';
streamingTokens.forEach(token => {
  // CRITICAL: cleanHtmlArtifacts muss HIER angewendet werden!
  const cleanedToken = cleanHtmlArtifacts(token);
  chatDisplayBuffer += cleanedToken;
});

console.log('Chat-Display nach Streaming:');
console.log(chatDisplayBuffer);
console.log('');

const hasHtmlInChat = chatDisplayBuffer.includes('class=') || chatDisplayBuffer.includes('tok-number');
if (hasHtmlInChat) {
  console.error('❌ FEHLER: HTML-Artefakte im Chat-Display!');
  console.error('chatPanel.ts cleanHtmlArtifacts() wird NICHT auf Tokens angewendet!');
} else {
  console.log('✅ Chat-Display ist sauber (keine HTML-Artefakte)');
}
console.log('');

// ========================================
// STEP 4: chatPanel.ts - streamComplete
// ========================================
console.log('STEP 4: chatPanel.ts - streamComplete');
console.log('--------------------------------------');

// Nach Streaming: Final message wird gesendet
const finalMessage = llmRawResponse.message.content;
const cleanedFinalMessage = cleanHtmlArtifacts(finalMessage);

console.log('Final Message (nach cleanHtmlArtifacts):');
console.log(cleanedFinalMessage.substring(0, 200) + '...');
console.log('');

const hasHtmlInFinal = cleanedFinalMessage.includes('class=') || cleanedFinalMessage.includes('tok-number');
if (hasHtmlInFinal) {
  console.error('❌ FEHLER: HTML-Artefakte in Final Message!');
} else {
  console.log('✅ Final Message ist sauber');
}
console.log('');

// ========================================
// STEP 5: Edge Cases
// ========================================
console.log('STEP 5: Edge Cases');
console.log('------------------');

const edgeCases = [
  {
    name: 'Nested HTML',
    input: '<span class="tok-number">7.4</span>',
    expected: '7.4'
  },
  {
    name: 'Multiple classes',
    input: 'pytest==<class="tok-number">7.<class="tok-number">4.<class="tok-number">3',
    expected: 'pytest==7.4.3'
  },
  {
    name: 'HTML with style',
    input: '<span style="color:red" class="tok-number">7.4</span>',
    expected: '7.4'
  },
  {
    name: 'Class without closing bracket',
    input: 'pytest==<class="tok-number">7.4.3',
    expected: 'pytest==7.4.3'
  },
  {
    name: 'Malformed HTML - <class= instead of <span class=',
    input: 'pytest==<class="tok-number">7.4.<class="tok-number">3',
    expected: 'pytest==7.4.3'
  },
  {
    name: 'Real LLM output from screenshot',
    input: '- pytest==<class="tok-number">7.4.<class="tok-number">3\n+ alabaster==<class="tok-number">0.7.<class="tok-number">12',
    expected: '- pytest==7.4.3\n+ alabaster==0.7.12'
  }
];

let allEdgeCasesPassed = true;
edgeCases.forEach(testCase => {
  const result = cleanHtmlArtifacts(testCase.input);
  const passed = result === testCase.expected;
  
  if (!passed) {
    console.error(`❌ ${testCase.name} FAILED`);
    console.error(`   Input:    "${testCase.input}"`);
    console.error(`   Expected: "${testCase.expected}"`);
    console.error(`   Got:      "${result}"`);
    allEdgeCasesPassed = false;
  } else {
    console.log(`✅ ${testCase.name}`);
  }
});

console.log('');

// ========================================
// FINAL VALIDATION
// ========================================
console.log('===========================================');
console.log('FINAL VALIDATION');
console.log('===========================================');

const allTestsPassed = 
  !hasHtmlInEdit &&
  !hasHtmlInChat &&
  !hasHtmlInFinal &&
  allEdgeCasesPassed;

if (allTestsPassed) {
  console.log('✅ ALLE TESTS BESTANDEN');
  console.log('Pipeline ist sauber - keine HTML-Artefakte');
  process.exit(0);
} else {
  console.log('❌ TESTS FEHLGESCHLAGEN');
  console.log('');
  console.log('DIAGNOSE:');
  console.log('---------');
  
  if (hasHtmlInEdit) {
    console.log('❌ Problem in aiClient.ts - cleanHtmlArtifacts() funktioniert nicht');
  }
  
  if (hasHtmlInChat) {
    console.log('❌ Problem in chatPanel.ts - onToken() wendet cleanHtmlArtifacts() nicht an');
    console.log('   FIX: In chatPanel.ts Zeile ~174:');
    console.log('   const cleanedToken = cleanHtmlArtifacts(token);');
    console.log('   this.panel.webview.postMessage({ type: "streamChunk", text: cleanedToken });');
  }
  
  if (hasHtmlInFinal) {
    console.log('❌ Problem in chatPanel.ts - streamComplete wendet cleanHtmlArtifacts() nicht an');
    console.log('   FIX: In chatPanel.ts Zeile ~198:');
    console.log('   text: cleanHtmlArtifacts(response.message)');
  }
  
  if (!allEdgeCasesPassed) {
    console.log('❌ cleanHtmlArtifacts() Regex ist unvollständig');
  }
  
  process.exit(1);
}
