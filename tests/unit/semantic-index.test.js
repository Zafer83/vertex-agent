/**
 * Unit tests for src/agent/semanticIndex.ts — BM25 tokenisation and ranking.
 *
 * Tests the pure logic (tokeniser, BM25 scoring) without VS Code or real files.
 * The SemanticIndex class is re-implemented inline (no vscode imports needed).
 *
 * Run: node tests/unit/semantic-index.test.js
 */

let passed = 0;
let failed = 0;

function assert(condition, testName) {
  if (condition) {
    console.log(`  ✅ ${testName}`);
    passed++;
  } else {
    console.log(`  ❌ FAILED: ${testName}`);
    failed++;
  }
}

function assertApprox(actual, expected, tolerance, testName) {
  const ok = Math.abs(actual - expected) <= tolerance;
  if (ok) {
    console.log(`  ✅ ${testName} (${actual.toFixed(4)})`);
    passed++;
  } else {
    console.log(`  ❌ FAILED: ${testName} — expected ~${expected}, got ${actual.toFixed(4)}`);
    failed++;
  }
}

// ─── Inline tokeniser (mirrors semanticIndex.ts) ──────────────────────────────

const STOP_WORDS = new Set([
  "the", "is", "at", "in", "on", "to", "a", "an", "and", "or", "of", "for",
  "it", "be", "as", "by", "we", "if", "so", "up", "do", "go",
]);

function tokenize(text) {
  const withSpaces = text
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2");

  return withSpaces
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(t => t.length >= 2 && !STOP_WORDS.has(t));
}

// ─── Inline BM25 engine ────────────────────────────────────────────────────────

const K1 = 1.5;
const B  = 0.75;

class SemanticIndex {
  constructor() {
    this.docs = new Map();           // docId → { tf, length, path }
    this.invertedIndex = new Map();  // token → Set<docId>
    this.totalTokens = 0;
  }

  addDocument(docId, text, relativePath) {
    const tokens = tokenize(text);
    if (tokens.length === 0) return;

    const tf = new Map();
    for (const token of tokens) {
      tf.set(token, (tf.get(token) ?? 0) + 1);
    }

    this.docs.set(docId, { tf, length: tokens.length, path: relativePath });
    this.totalTokens += tokens.length;

    for (const token of tf.keys()) {
      if (!this.invertedIndex.has(token)) this.invertedIndex.set(token, new Set());
      this.invertedIndex.get(token).add(docId);
    }
  }

  search(query, topK = 10) {
    if (this.docs.size === 0) return [];
    const queryTokens = [...new Set(tokenize(query))];
    if (queryTokens.length === 0) return [];

    const avgLen = this.totalTokens / this.docs.size;
    const scores = new Map();

    for (const qToken of queryTokens) {
      const df = this.invertedIndex.get(qToken)?.size ?? 0;
      if (df === 0) continue;

      const idf = Math.log((this.docs.size - df + 0.5) / (df + 0.5) + 1);

      for (const docId of this.invertedIndex.get(qToken)) {
        const doc = this.docs.get(docId);
        const tf = doc.tf.get(qToken) ?? 0;
        const tfNorm = (tf * (K1 + 1)) / (tf + K1 * (1 - B + B * (doc.length / avgLen)));
        scores.set(docId, (scores.get(docId) ?? 0) + idf * tfNorm);
      }
    }

    return [...scores.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, topK)
      .map(([docId, score]) => ({ path: this.docs.get(docId).path, score }));
  }

  get size() { return this.docs.size; }
}

// ─────────────────────────────────────────────────────────────────────────────

console.log("\n=== 1. Tokeniser ===");

const tokens1 = tokenize("getUserById returns the user object");
assert(tokens1.includes("get"),      "camelCase split: 'get'");
assert(tokens1.includes("user"),     "camelCase split: 'user'");
assert(!tokens1.includes("by"),      "stop word 'by' filtered from camelCase split");
assert(tokens1.includes("id"),       "camelCase split: 'id'");
assert(tokens1.includes("returns"),  "word 'returns' kept");
assert(!tokens1.includes("the"),     "stop word 'the' removed");
assert(tokens1.includes("object"),   "'object' kept (not a stop word, length ≥ 2)");

const tokens2 = tokenize("AuthenticationService handles JWT tokens");
assert(tokens2.includes("authentication"), "PascalCase → 'authentication'");
assert(tokens2.includes("service"),        "PascalCase → 'service'");
assert(tokens2.includes("handles"),        "'handles' kept");
assert(tokens2.includes("jwt"),            "'jwt' lowercase kept");
assert(tokens2.includes("tokens"),         "'tokens' kept");

const tokens3 = tokenize("a to is at");
assert(tokens3.length === 0, "all stop words → empty token list");

const tokens4 = tokenize("a x y");
assert(tokens4.length === 0, "short words (< 2 chars) filtered");

console.log("\n=== 2. BM25 scoring — relevant doc ranked first ===");

const idx = new SemanticIndex();
idx.addDocument("auth.ts", `
  export class AuthService {
    async login(username: string, password: string): Promise<JWT> {
      const token = await this.jwtService.sign({ username });
      return token;
    }
    async validateToken(jwt: string): Promise<boolean> {
      return this.jwtService.verify(jwt);
    }
  }
`, "src/auth.ts");

idx.addDocument("utils.ts", `
  export function formatDate(date: Date): string {
    return date.toISOString().slice(0, 10);
  }
  export function clamp(value: number, min: number, max: number): number {
    return Math.min(Math.max(value, min), max);
  }
`, "src/utils.ts");

idx.addDocument("config.ts", `
  export const DB_HOST = process.env.DB_HOST ?? 'localhost';
  export const DB_PORT = parseInt(process.env.DB_PORT ?? '5432');
  export const MAX_CONNECTIONS = 10;
`, "src/config.ts");

assert(idx.size === 3, "3 documents indexed");

const authResults = idx.search("jwt authentication login");
assert(authResults.length >= 1,                  "auth query returns results");
assert(authResults[0].path === "src/auth.ts",    "auth query: auth.ts ranked first");
assert(authResults[0].score > 0,                 "auth.ts has positive score");

const dateResults = idx.search("format date utility");
assert(dateResults.length >= 1,                  "date query returns results");
assert(dateResults[0].path === "src/utils.ts",   "date query: utils.ts ranked first");

const dbResults = idx.search("database connection host port");
assert(dbResults.length >= 1,                    "db query returns results");
assert(dbResults[0].path === "src/config.ts",    "db query: config.ts ranked first");

console.log("\n=== 3. BM25 — topK limiting ===");

const idx2 = new SemanticIndex();
for (let i = 0; i < 10; i++) {
  idx2.addDocument(`doc${i}`, `function handler${i}() { return value${i}; }`, `src/file${i}.ts`);
}

const top3 = idx2.search("handler function", 3);
assert(top3.length === 3, "topK=3 limits to 3 results");
assert(top3[0].score >= top3[1].score, "results sorted by score desc");
assert(top3[1].score >= top3[2].score, "results sorted by score desc (2nd/3rd)");

console.log("\n=== 4. BM25 — empty / edge cases ===");

const emptyIdx = new SemanticIndex();
const emptyResult = emptyIdx.search("anything");
assert(emptyResult.length === 0, "empty index → empty results");

const idx3 = new SemanticIndex();
idx3.addDocument("a.ts", "function foo() {}", "a.ts");
const noMatch = idx3.search("zzz qqq rrr");
assert(noMatch.length === 0, "no matching tokens → no results");

const stopOnly = idx3.search("a to is");
assert(stopOnly.length === 0, "stop-words-only query → no results");

console.log("\n=== 5. BM25 — incremental update ===");

const idx4 = new SemanticIndex();
idx4.addDocument("old.ts", "function legacyCode() { var x = 1; }", "old.ts");
const before = idx4.search("legacy code");
assert(before.length === 1,             "before update: 1 result");
assert(before[0].path === "old.ts",     "before update: old.ts ranked");

// Simulate onFileChanged by re-adding with new content
idx4.addDocument("new.ts", "class ModernService { handle() { return true; } }", "new.ts");
const after = idx4.search("modern service handle");
assert(after.length >= 1,              "after adding new.ts: results found");
assert(after[0].path === "new.ts",     "new.ts ranked first for 'modern service'");

console.log("\n=== 6. IDF weighting — rare term ranks higher ===");

const idx5 = new SemanticIndex();
// 'common' appears in all 5 docs; 'rare' appears only in doc0
idx5.addDocument("d0", "rare unique term common word", "d0.ts");
for (let i = 1; i <= 4; i++) {
  idx5.addDocument(`d${i}`, "common word repeated common", `d${i}.ts`);
}

const rareResults = idx5.search("rare");
assert(rareResults.length === 1,        "only 1 doc has 'rare'");
assert(rareResults[0].path === "d0.ts", "doc with rare term found");

// Doc with 'common' in all → low IDF — 'd0' also has 'common' but 'rare' gives it the highest total
const commonResults = idx5.search("common");
// All 5 docs match; d0 and d1-d4 differ only in frequency
assert(commonResults.length === 5, "all 5 docs match 'common'");
// d1-d4 have 'common' twice each, d0 has it once → d1-d4 should rank higher for 'common'
assert(commonResults[0].path !== "d0.ts", "doc with higher tf ranks first for 'common'");

// ─── Summary ──────────────────────────────────────────────────────────────────

console.log(`\n${"─".repeat(50)}`);
console.log(`Results: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.error(`\n${failed} test(s) FAILED`);
  process.exit(1);
} else {
  console.log("All semantic-index tests passed ✅");
}
