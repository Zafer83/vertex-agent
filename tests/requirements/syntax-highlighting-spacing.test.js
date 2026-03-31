/**
 * REQUIREMENT-BASED TEST: Syntax Highlighting Must Preserve Spaces
 * 
 * REQUIREMENT:
 * Syntax highlighting must NOT remove spaces between keywords and identifiers.
 * 
 * BUG FROM SCREENSHOT:
 * "def broken_function" is displayed as "defbroken_function" (no space)
 * 
 * ACCEPTANCE CRITERIA:
 * 1. Keywords must have space after them: "def function" not "deffunction"
 * 2. All whitespace must be preserved in code
 * 3. Syntax highlighting should only ADD <span> tags, not REMOVE content
 * 4. This must work for all languages (Python, JavaScript, TypeScript, etc.)
 */

console.log('=== REQUIREMENT TEST: Syntax Highlighting Spacing ===\n');

// Simulate highlightCodeLine function from chatPanel.ts
function highlightCodeLine(language, line) {
  var lang = String(language || "code").toLowerCase();
  var work = String(line || "");
  var prefix = "";

  if ((work.startsWith("+") && !work.startsWith("+++")) || (work.startsWith("-") && !work.startsWith("---"))) {
    prefix = work.slice(0, 1);
    work = work.slice(1);
  }

  // Escape HTML FIRST - entire line
  work = work.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  var keywordSets = {
    javascript: ["const", "let", "var", "function", "return", "if", "else", "for", "while", "switch", "case", "break", "continue", "class", "extends", "new", "import", "from", "export", "default", "async", "await", "try", "catch", "finally", "throw", "typeof", "instanceof"],
    typescript: ["const", "let", "var", "function", "return", "if", "else", "for", "while", "switch", "case", "break", "continue", "class", "extends", "new", "import", "from", "export", "default", "async", "await", "try", "catch", "finally", "throw", "type", "interface", "implements", "enum", "public", "private", "protected", "readonly"],
    python: ["def", "class", "return", "if", "elif", "else", "for", "while", "in", "import", "from", "as", "try", "except", "finally", "raise", "with", "lambda", "pass", "break", "continue", "yield", "async", "await"],
    bash: ["if", "then", "else", "fi", "for", "do", "done", "case", "esac", "while", "function", "in", "export", "local"],
    sh: ["if", "then", "else", "fi", "for", "do", "done", "case", "esac", "while", "function", "in", "export", "local"],
    json: [],
    diff: [],
  };

  var constants = ["true", "false", "null", "undefined", "none"];
  var keywords = keywordSets[lang] || keywordSets.javascript;

  if (lang === "json") {
    work = work.replace(/(&quot;[^&]+&quot;)(?=\\s*:)/g, function(match) {
      return '<span class="hl-prop">' + match + '</span>';
    });
  }

  work = work.replace(/(&quot;[^&]*?&quot;|&#39;[^&]*?&#39;)/g, function(match) {
    return '<span class="hl-string">' + match + '</span>';
  });
  work = work.replace(/\b(\d+(?:\.\d+)?)\b/g, function(match) {
    return '<span class="hl-number">' + match + '</span>';
  });

  if (keywords.length > 0) {
    var kwRegex = new RegExp("\\b(" + keywords.join("|") + ")\\b", "g");
    work = work.replace(kwRegex, function(match) {
      return '<span class="hl-keyword">' + match + '</span>';
    });
  }

  var constRegex = new RegExp("\\b(" + constants.join("|") + ")\\b", "gi");
  work = work.replace(constRegex, function(match) {
    return '<span class="hl-const">' + match + '</span>';
  });

  // Function names - but skip if already highlighted (keywords/constants are wrapped in spans)
  work = work.replace(/\b([A-Za-z_][A-Za-z0-9_]*)(\s*)(?=\()/g, function(fullMatch, name, spaces) {
    // Skip if this is already wrapped in a span (keyword or constant)
    if (fullMatch.includes('<span')) return fullMatch;
    return '<span class="hl-fn">' + name + '</span>' + spaces;
  });

  if (lang === "python" || lang === "bash" || lang === "sh" || lang === "yaml" || lang === "yml" || lang === "toml") {
    work = work.replace(/(#.*)$/g, function(match) {
      return '<span class="hl-comment">' + match + '</span>';
    });
  } else {
    work = work.replace(/(\/\/.*)$/g, function(match) {
      return '<span class="hl-comment">' + match + '</span>';
    });
  }

  return prefix + work;
}

// Helper to strip HTML tags for comparison
function stripHtmlTags(html) {
  return html.replace(/<[^>]+>/g, '');
}

// Helper to count spaces in string
function countSpaces(str) {
  return (str.match(/ /g) || []).length;
}

// TEST SUITE
const tests = [];
let passedTests = 0;
let failedTests = 0;

function test(name, language, input, requirement) {
  const result = highlightCodeLine(language, input);
  const strippedResult = stripHtmlTags(result);
  
  // Check 1: Content must be identical (ignoring HTML tags)
  const contentPreserved = strippedResult === input;
  
  // Check 2: Spaces must be preserved
  const inputSpaces = countSpaces(input);
  const resultSpaces = countSpaces(strippedResult);
  const spacesPreserved = inputSpaces === resultSpaces;
  
  // Check 3: No content should be removed
  const lengthPreserved = strippedResult.length === input.length;
  
  const passed = contentPreserved && spacesPreserved && lengthPreserved;
  
  tests.push({ 
    name, 
    passed, 
    input, 
    result: strippedResult,
    inputSpaces,
    resultSpaces,
    inputLength: input.length,
    resultLength: strippedResult.length,
    requirement 
  });
  
  if (passed) {
    console.log(`✅ PASS: ${name}`);
    passedTests++;
  } else {
    console.error(`❌ FAIL: ${name}`);
    console.error(`   Requirement: ${requirement}`);
    console.error(`   Input:  "${input}"`);
    console.error(`   Result: "${strippedResult}"`);
    console.error(`   Input spaces: ${inputSpaces}, Result spaces: ${resultSpaces}`);
    console.error(`   Input length: ${input.length}, Result length: ${strippedResult.length}`);
    
    // Show character-by-character comparison
    if (!contentPreserved) {
      console.error(`   Character comparison:`);
      for (let i = 0; i < Math.max(input.length, strippedResult.length); i++) {
        if (input[i] !== strippedResult[i]) {
          console.error(`     Position ${i}: expected '${input[i]}' (${input.charCodeAt(i)}), got '${strippedResult[i]}' (${strippedResult.charCodeAt(i) || 'undefined'})`);
        }
      }
    }
    
    failedTests++;
  }
}

// PYTHON TESTS (Bug from screenshot)
console.log('PYTHON TESTS (Bug from screenshot)');
console.log('-----------------------------------');

test(
  'Python: def function with space',
  'python',
  'def broken_function(x, y',
  'Must preserve space between "def" and "broken_function"'
);

test(
  'Python: def with underscore',
  'python',
  'def my_function():',
  'Must preserve space after "def" keyword'
);

test(
  'Python: class definition',
  'python',
  'class MyClass:',
  'Must preserve space between "class" and "MyClass"'
);

test(
  'Python: return statement',
  'python',
  'return result',
  'Must preserve space between "return" and "result"'
);

test(
  'Python: if statement',
  'python',
  'if x > 5:',
  'Must preserve all spaces in condition'
);

test(
  'Python: for loop',
  'python',
  'for i in range(10):',
  'Must preserve spaces in for loop'
);

// JAVASCRIPT TESTS
console.log('\nJAVASCRIPT TESTS');
console.log('----------------');

test(
  'JavaScript: function declaration',
  'javascript',
  'function myFunction() {',
  'Must preserve space between "function" and "myFunction"'
);

test(
  'JavaScript: const declaration',
  'javascript',
  'const result = x + y',
  'Must preserve all spaces in declaration'
);

test(
  'JavaScript: if statement',
  'javascript',
  'if (condition) {',
  'Must preserve spaces in if statement'
);

test(
  'JavaScript: return statement',
  'javascript',
  'return value',
  'Must preserve space between "return" and "value"'
);

// TYPESCRIPT TESTS
console.log('\nTYPESCRIPT TESTS');
console.log('----------------');

test(
  'TypeScript: interface definition',
  'typescript',
  'interface MyInterface {',
  'Must preserve space between "interface" and "MyInterface"'
);

test(
  'TypeScript: type definition',
  'typescript',
  'type MyType = string',
  'Must preserve all spaces in type definition'
);

// EDGE CASES
console.log('\nEDGE CASES');
console.log('----------');

test(
  'Multiple spaces between keyword and identifier',
  'python',
  'def  function_with_two_spaces():',
  'Must preserve multiple spaces'
);

test(
  'Tab character after keyword',
  'python',
  'def\tfunction_with_tab():',
  'Must preserve tab character'
);

test(
  'Keyword at end of line',
  'python',
  '    return',
  'Must preserve trailing space after keyword'
);

test(
  'Multiple keywords in one line',
  'python',
  'if x in range(10):',
  'Must preserve spaces between multiple keywords'
);

test(
  'Keyword followed by parenthesis',
  'python',
  'def()',
  'Must handle keyword directly followed by parenthesis'
);

// WHITESPACE PRESERVATION
console.log('\nWHITESPACE PRESERVATION');
console.log('-----------------------');

test(
  'Leading spaces',
  'python',
  '    def function():',
  'Must preserve leading indentation'
);

test(
  'Trailing spaces',
  'python',
  'def function():   ',
  'Must preserve trailing spaces'
);

test(
  'Mixed whitespace',
  'python',
  '  def  function( x,  y ):',
  'Must preserve all whitespace including multiple spaces'
);

// SUMMARY
console.log('\n' + '='.repeat(70));
console.log('TEST SUMMARY');
console.log('='.repeat(70));
console.log(`Total tests: ${tests.length}`);
console.log(`✅ Passed: ${passedTests}`);
console.log(`❌ Failed: ${failedTests}`);
console.log(`Success rate: ${((passedTests / tests.length) * 100).toFixed(1)}%`);

if (failedTests > 0) {
  console.log('\n⚠️  REQUIREMENT NOT MET');
  console.log('Syntax highlighting is REMOVING spaces from code!');
  console.log('\nThis is a CRITICAL BUG that breaks code readability.');
  console.log('\nROOT CAUSE:');
  console.log('The highlightCodeLine() function is likely using regex');
  console.log('that captures keywords but not the spaces after them.');
  console.log('\nFIX:');
  console.log('Ensure regex replacements preserve ALL whitespace.');
  console.log('Use word boundaries (\\b) correctly and capture spaces.');
  process.exit(1);
} else {
  console.log('\n✅ REQUIREMENT MET');
  console.log('All spaces are preserved in syntax highlighting.');
  process.exit(0);
}
