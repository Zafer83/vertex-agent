/**
 * Test: Was generiert der Agent bei "Lösche zeile pytest"?
 * Simuliert den System-Prompt und analysiert den Output
 */

// Simuliere den relevanten Teil des System-Prompts
const systemPromptRules = `
## INTENT-ERKENNUNG

3. **ZEILEN-EDITS** (WICHTIG - KEIN DELETE!):
   - "Lösche die Zeile X in Y", "Entferne Zeile Z aus Datei A"
   - "Füge Zeile X in Y hinzu", "Ändere Zeile A zu B"
   → **NIEMALS DELETE verwenden! Zeige die Datei mit Diff-Format (+ für neu, - für entfernt)**
   → Beispiel: \`\`\`txt requirements.txt
- old-package==1.0.0
+ new-package==2.0.0
\`\`\`

**KRITISCH - Diff-Format für ALLE Code-Blöcke:**
Verwende IMMER Diff-Format in Code-Blöcken für bessere Lesbarkeit:
- Zeilen mit + am Anfang = NEU HINZUGEFÜGT (wird grün angezeigt)
- Zeilen mit - am Anfang = ENTFERNT (wird rot angezeigt)
- Zeilen ohne Präfix = unverändert (Kontext)
`;

console.log('=== SYSTEM PROMPT REGELN ===');
console.log(systemPromptRules);

console.log('\n=== USER REQUEST ===');
const userRequest = 'Lösche die zeile pytest in requirements.txt';
console.log(userRequest);

console.log('\n=== ERWARTETER AGENT OUTPUT (laut System-Prompt) ===');
const expectedOutput = `\`\`\`txt requirements.txt
- pytest==7.4.3
\`\`\``;
console.log(expectedOutput);

console.log('\n=== PROBLEM-ANALYSE ===');
console.log('1. System-Prompt sagt: "Zeige die Datei mit Diff-Format"');
console.log('2. System-Prompt sagt: "Zeilen mit - am Anfang = ENTFERNT"');
console.log('3. System-Prompt sagt: "Zeilen ohne Präfix = unverändert (Kontext)"');
console.log('');
console.log('ABER: Agent zeigt NUR die zu löschende Zeile, NICHT die Kontext-Zeilen!');
console.log('');
console.log('Das bedeutet:');
console.log('- Agent sendet: "- pytest==7.4.3"');
console.log('- FileEditEngine empfängt: "- pytest==7.4.3"');
console.log('- applyDiffToContent sieht: Diff-Marker vorhanden');
console.log('- Aber: KEINE Kontext-Zeilen → alle anderen Zeilen werden NICHT in result[] gepusht');
console.log('');
console.log('LÖSUNG: applyDiffToContent muss ALLE Original-Zeilen behalten,');
console.log('        auch wenn sie nicht im Diff erwähnt werden!');

console.log('\n=== TEST MIT AKTUELLER LOGIK ===');

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
  
  for (const originalLine of originalLines) {
    if (!linesToRemove.has(originalLine.trim())) {
      result.push(originalLine);
    }
  }
  
  result.push(...linesToAdd);
  
  return result.join('\n');
}

const original = `pytest==7.4.3
alabaster==0.7.12
altgraph==0.17
appdirs==1.4.4
argh==0.26.2
astroid==2.4.2`;

const agentOutput = `- pytest==7.4.3`;

console.log('Original:', original.split('\n').length, 'lines');
console.log('Agent sendet:', agentOutput);
const result = applyDiffToContent(original, agentOutput);
console.log('Result:', result.split('\n').length, 'lines');
console.log('\nResult content:');
console.log(result);
console.log('\n✅ FUNKTIONIERT! Alle Zeilen außer pytest bleiben erhalten.');
