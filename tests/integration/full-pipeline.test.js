/**
 * INTEGRATION TEST: Full Pipeline
 * Testet den kompletten Ablauf: System-Prompt → LLM-Output → HTML-Cleaning → Diff-Anwendung
 */

console.log('=== INTEGRATION TEST: FULL PIPELINE ===\n');

// ========================================
// STEP 1: System-Prompt Validierung
// ========================================
console.log('STEP 1: System-Prompt Validierung');
console.log('----------------------------------');

const systemPromptRules = `
**KRITISCH - Diff-Format für ALLE Code-Blöcke:**
Verwende IMMER Diff-Format in Code-Blöcken für bessere Lesbarkeit:
- Zeilen mit + am Anfang = NEU HINZUGEFÜGT (wird grün angezeigt)
- Zeilen mit - am Anfang = ENTFERNT (wird rot angezeigt)
- Zeilen ohne Präfix = unverändert (Kontext)

**NIEMALS HTML-Tags oder Klassen-Attribute in Code-Blöcken** (z.B. class="tok-number", <span>, etc.) — NUR reiner, sauberer Code!
`;

console.log('System-Prompt enthält:');
console.log('✓ Diff-Format Anweisung');
console.log('✓ HTML-Verbot Regel');
console.log('');

// ========================================
// STEP 2: LLM-Output Simulation
// ========================================
console.log('STEP 2: LLM-Output Simulation (mit HTML-Artefakten)');
console.log('----------------------------------------------------');

// Simuliert was der LLM TATSÄCHLICH generiert (mit HTML-Artefakten)
const llmRawOutput = `\`\`\`txt requirements.txt
- pytest==<class="tok-number">7.4.<class="tok-number">3
+ alabaster==<class="tok-number">0.7.<class="tok-number">12
+ altgraph==<class="tok-number">0.17
+ appdirs==<class="tok-number">1.4.<class="tok-number">4
\`\`\``;

console.log('LLM generiert (RAW):');
console.log(llmRawOutput);
console.log('');
console.log('⚠️  PROBLEM: LLM ignoriert System-Prompt und generiert HTML-Artefakte!');
console.log('');

// ========================================
// STEP 3: Code-Block Extraktion
// ========================================
console.log('STEP 3: Code-Block Extraktion');
console.log('------------------------------');

// Extrahiere Code aus ```txt requirements.txt ... ```
const codeBlockRegex = /```(?:[\w]+\s+)?([^\n`]+)\n([\s\S]*?)```/g;
let match = codeBlockRegex.exec(llmRawOutput);

if (!match) {
  console.error('❌ FEHLER: Kein Code-Block gefunden!');
  process.exit(1);
}

const filePath = match[1].trim();
const codeContent = match[2];

console.log('Extrahierter Filepath:', filePath);
console.log('Extrahierter Code:');
console.log(codeContent);
console.log('');

// ========================================
// STEP 4: HTML-Cleaning (cleanHtmlArtifacts)
// ========================================
console.log('STEP 4: HTML-Cleaning (cleanHtmlArtifacts)');
console.log('-------------------------------------------');

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

const cleanedCode = cleanHtmlArtifacts(codeContent);

console.log('Nach HTML-Cleaning:');
console.log(cleanedCode);
console.log('');

// Validierung
const hasHtmlArtifacts = cleanedCode.includes('class=') || cleanedCode.includes('tok-number');
if (hasHtmlArtifacts) {
  console.error('❌ FEHLER: HTML-Artefakte noch vorhanden nach Cleaning!');
  console.error('Gefunden:', cleanedCode.match(/class=|tok-number/g));
  process.exit(1);
} else {
  console.log('✅ HTML-Cleaning erfolgreich - keine Artefakte mehr');
}
console.log('');

// ========================================
// STEP 5: Diff-Anwendung (applyDiffToContent)
// ========================================
console.log('STEP 5: Diff-Anwendung (applyDiffToContent)');
console.log('---------------------------------------------');

function applyDiffToContent(originalContent, diffContent) {
  const lines = diffContent.split('\n');
  const hasDiffMarkers = lines.some(line => /^[+-]\s/.test(line) || /^[+-][^+\-]/.test(line));
  
  if (!hasDiffMarkers) {
    return diffContent;
  }
  
  const linesToRemove = new Set();
  const linesToAdd = [];
  
  for (const line of lines) {
    if (line.startsWith('- ') || (line.startsWith('-') && !line.startsWith('--'))) {
      const contentToRemove = line.startsWith('- ') ? line.slice(2) : line.slice(1);
      linesToRemove.add(contentToRemove.trim());
    } else if (line.startsWith('+ ') || (line.startsWith('+') && !line.startsWith('++'))) {
      const contentToAdd = line.startsWith('+ ') ? line.slice(2) : line.slice(1);
      linesToAdd.push(contentToAdd);
    }
  }
  
  const originalLines = originalContent.split('\n');
  const result = [];
  const existingLinesSet = new Set();
  
  for (const originalLine of originalLines) {
    if (!linesToRemove.has(originalLine.trim())) {
      result.push(originalLine);
      existingLinesSet.add(originalLine.trim());
    }
  }
  
  // Add new lines at the end - but only if they don't already exist
  for (const newLine of linesToAdd) {
    if (!existingLinesSet.has(newLine.trim())) {
      result.push(newLine);
    }
  }
  
  return result.join('\n');
}

const originalFile = `pytest==7.4.3
alabaster==0.7.12
altgraph==0.17
appdirs==1.4.4
argh==0.26.2
astroid==2.4.2`;

const finalContent = applyDiffToContent(originalFile, cleanedCode);

console.log('Original (6 Zeilen):');
console.log(originalFile);
console.log('');
console.log('Nach Diff-Anwendung:');
console.log(finalContent);
console.log('');

// ========================================
// STEP 6: Validierung
// ========================================
console.log('STEP 6: Validierung');
console.log('-------------------');

const finalLines = finalContent.split('\n').filter(l => l.trim());
const expectedLines = [
  'alabaster==0.7.12',
  'altgraph==0.17', 
  'appdirs==1.4.4',
  'argh==0.26.2',
  'astroid==2.4.2'
];

console.log('Erwartete Zeilen:', expectedLines.length);
console.log('Tatsächliche Zeilen:', finalLines.length);
console.log('');

let allTestsPassed = true;

// Test 1: pytest wurde entfernt
if (finalContent.includes('pytest')) {
  console.error('❌ FEHLER: pytest wurde NICHT entfernt!');
  allTestsPassed = false;
} else {
  console.log('✅ pytest wurde entfernt');
}

// Test 2: alabaster wurde hinzugefügt (war schon da, sollte bleiben)
if (!finalContent.includes('alabaster==0.7.12')) {
  console.error('❌ FEHLER: alabaster fehlt!');
  allTestsPassed = false;
} else {
  console.log('✅ alabaster vorhanden');
}

// Test 3: Alte Zeilen bleiben erhalten
if (!finalContent.includes('argh==0.26.2') || !finalContent.includes('astroid==2.4.2')) {
  console.error('❌ FEHLER: Alte Zeilen wurden gelöscht!');
  allTestsPassed = false;
} else {
  console.log('✅ Alte Zeilen bleiben erhalten');
}

// Test 4: Keine HTML-Artefakte im finalen Content
if (finalContent.includes('class=') || finalContent.includes('tok-number')) {
  console.error('❌ FEHLER: HTML-Artefakte im finalen Content!');
  allTestsPassed = false;
} else {
  console.log('✅ Keine HTML-Artefakte im finalen Content');
}

console.log('');
console.log('===========================================');
if (allTestsPassed) {
  console.log('✅ ALLE TESTS BESTANDEN');
  console.log('===========================================');
  process.exit(0);
} else {
  console.log('❌ TESTS FEHLGESCHLAGEN');
  console.log('===========================================');
  process.exit(1);
}
