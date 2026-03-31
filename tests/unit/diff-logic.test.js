/**
 * Unit-Test für applyDiffToContent Logik
 */

function applyDiffToContent(originalContent, diffContent) {
  // Check if content contains diff markers (+ or -)
  const lines = diffContent.split('\n');
  const hasDiffMarkers = lines.some(line => /^[+-]\s/.test(line) || /^[+-][^+\-]/.test(line));
  
  if (!hasDiffMarkers) {
    // No diff markers - treat as complete replacement
    return diffContent;
  }
  
  // Build list of lines to remove and lines to add
  const linesToRemove = new Set();
  const linesToAdd = [];
  
  for (const line of lines) {
    if (line.startsWith('- ') || (line.startsWith('-') && !line.startsWith('--'))) {
      // Mark line for removal
      const contentToRemove = line.startsWith('- ') ? line.slice(2) : line.slice(1);
      linesToRemove.add(contentToRemove.trim());
    } else if (line.startsWith('+ ') || (line.startsWith('+') && !line.startsWith('++'))) {
      // Add line
      const contentToAdd = line.startsWith('+ ') ? line.slice(2) : line.slice(1);
      linesToAdd.push(contentToAdd);
    }
  }
  
  // Apply diff: keep all original lines EXCEPT those marked for removal
  const originalLines = originalContent.split('\n');
  const result = [];
  
  for (const originalLine of originalLines) {
    // Only skip if this line is marked for removal
    if (!linesToRemove.has(originalLine.trim())) {
      result.push(originalLine);
    }
  }
  
  // Add new lines at the end
  result.push(...linesToAdd);
  
  return result.join('\n');
}

// TEST CASE 1: Lösche nur pytest-Zeile
console.log('=== TEST 1: Lösche pytest-Zeile ===');
const original1 = `pytest==7.4.3
alabaster==0.7.12
altgraph==0.17
appdirs==1.4.4
argh==0.26.2
astroid==2.4.2
async_generator==1.10
atomicwrites==1.4.0`;

const diff1 = `- pytest==7.4.3`;

const result1 = applyDiffToContent(original1, diff1);
console.log('Original:');
console.log(original1);
console.log('\nDiff:');
console.log(diff1);
console.log('\nResult:');
console.log(result1);
console.log('\nExpected: Alle Zeilen außer pytest==7.4.3');
console.log('Lines in result:', result1.split('\n').length, '(expected: 7)');
console.log('Contains pytest?', result1.includes('pytest'), '(expected: false)');
console.log('Contains alabaster?', result1.includes('alabaster'), '(expected: true)');
console.log('Contains atomicwrites?', result1.includes('atomicwrites'), '(expected: true)');

// TEST CASE 2: Lösche eine Zeile und füge eine hinzu
console.log('\n\n=== TEST 2: Lösche pytest, füge requests hinzu ===');
const diff2 = `- pytest==7.4.3
+ requests==2.31.0`;

const result2 = applyDiffToContent(original1, diff2);
console.log('Result:');
console.log(result2);
console.log('\nExpected: Alle Zeilen außer pytest, plus requests am Ende');
console.log('Lines in result:', result2.split('\n').length, '(expected: 8)');
console.log('Contains pytest?', result2.includes('pytest'), '(expected: false)');
console.log('Contains requests?', result2.includes('requests'), '(expected: true)');

// TEST CASE 3: Nur hinzufügen, nichts löschen
console.log('\n\n=== TEST 3: Nur hinzufügen ===');
const diff3 = `+ numpy==1.24.0`;

const result3 = applyDiffToContent(original1, diff3);
console.log('Result lines:', result3.split('\n').length, '(expected: 9)');
console.log('Contains numpy?', result3.includes('numpy'), '(expected: true)');
console.log('Contains all original?', result3.includes('pytest') && result3.includes('atomicwrites'), '(expected: true)');
