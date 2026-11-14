// Very conservative local spell-fix for OCR output. It acts only when it is nearly certain:
//  - the word was low confidence AND is not a real word,
//  - exactly ONE common word is a single edit away (two or more candidates => do nothing),
//  - or two adjacent fragments join into exactly a real word.
// Names, URLs, numbers and capitalized mid-line words are left alone. All fixes are reported.
const LETTERS = 'abcdefghijklmnopqrstuvwxyz';
export const MIN_LENGTH = 4;
export const LOW_CONFIDENCE = 60;
export const JOIN_BELOW = 75; // both fragments must be doubtful before we join them
// Small everyday words are never treated as the fragment of a split word ("to" + "pic" != "topic").
const FUNCTION_WORDS = new Set(['a', 'i', 'am', 'an', 'as', 'at', 'be', 'by', 'do', 'go', 'he', 'if', 'in', 'is', 'it', 'me', 'my', 'no', 'of', 'on', 'or', 'so', 'to', 'up', 'us', 'we', 'and', 'the', 'for', 'but', 'not', 'you', 'all', 'can', 'her', 'was', 'one', 'our', 'out', 'are', 'has', 'his', 'how', 'its', 'may', 'new', 'now', 'old', 'see', 'two', 'who', 'did', 'get', 'him', 'let', 'say', 'she', 'too', 'use', 'with', 'from', 'that', 'this', 'will', 'have', 'they', 'what', 'when', 'your']);

export function edits1(word) {
  const out = new Set();
  for (let i = 0; i <= word.length; i += 1) {
    const left = word.slice(0, i); const right = word.slice(i);
    if (right) out.add(left + right.slice(1)); // deletion
    if (right.length > 1) out.add(left + right[1] + right[0] + right.slice(2)); // transposition
    for (const c of LETTERS) {
      if (right) out.add(left + c + right.slice(1)); // substitution
      out.add(left + c + right); // insertion
    }
  }
  out.delete(word);
  return out;
}

export function makeFixer({ common, valid }) {
  const isWord = (w) => valid.has(w) || common.has(w);

  const split = (token) => {
    const m = token.match(/^([^A-Za-z]*)([A-Za-z]+)([^A-Za-z]*)$/);
    return m ? { pre: m[1], core: m[2], post: m[3] } : null; // digits/URLs/mixed => not touched
  };
  const matchCase = (orig, fixed) => {
    if (orig === orig.toUpperCase() && orig.length > 1) return fixed.toUpperCase();
    if (orig[0] === orig[0].toUpperCase()) return fixed[0].toUpperCase() + fixed.slice(1);
    return fixed;
  };

  // The single common word one edit away, or null if there are none or several.
  const uniqueNeighbour = (lower) => {
    const hits = [...edits1(lower)].filter((c) => common.has(c));
    return hits.length === 1 ? hits[0] : null;
  };

  function fixWord(token, confidence, isLineStart) {
    const parts = split(token.text);
    if (!parts || parts.core.length < MIN_LENGTH) return null;
    if (confidence >= LOW_CONFIDENCE) return null;
    const lower = parts.core.toLowerCase();
    if (isWord(lower)) return null;
    const capitalized = parts.core[0] !== parts.core[0].toLowerCase();
    if (capitalized && !isLineStart && parts.core !== parts.core.toUpperCase()) return null; // likely a name
    const hit = uniqueNeighbour(lower); // null when there is none or it is ambiguous
    if (!hit) return null;
    return { text: parts.pre + matchCase(parts.core, hit) + parts.post, confidence: 100, corrected: true };
  }

  /** tokens: [{ text, confidence }] for one line. Returns { tokens, corrections }. */
  const fixLine = function fixLine(tokens) {
    const corrections = [];
    const out = [];
    for (let i = 0; i < tokens.length; i += 1) {
      const a = tokens[i]; const b = tokens[i + 1];
      const pa = split(a.text); const pb = b && split(b.text);
      // Rejoin split fragments: "informati" + "ion" => "information".
      if (pa && pb && !pa.post && !pb.pre) {
        const joined = (pa.core + pb.core).toLowerCase();
        const unknownPart = !isWord(pa.core.toLowerCase()) || !isWord(pb.core.toLowerCase());
        // Exact word, or exactly one clear fix ("informati"+"ion" => "informatiion" => "information").
        const bothDoubtful = Math.max(a.confidence, b.confidence) < JOIN_BELOW;
        const noFunctionWord = !FUNCTION_WORDS.has(pa.core.toLowerCase()) && !FUNCTION_WORDS.has(pb.core.toLowerCase());
        const target = joined.length >= 5 && unknownPart && bothDoubtful && noFunctionWord
          ? (isWord(joined) ? joined : (joined.length >= 6 ? uniqueNeighbour(joined) : null)) : null;
        if (target) {
          const text = pa.pre + matchCase(pa.core, target) + pb.post;
          corrections.push({ from: `${a.text} ${b.text}`, to: text });
          out.push({ text, confidence: 100, corrected: true });
          i += 1;
          continue;
        }
      }
      const fixed = fixWord(a, a.confidence, out.length === 0);
      if (fixed) { corrections.push({ from: a.text, to: fixed.text }); out.push(fixed); } else out.push(a);
    }
    return { tokens: out, corrections };
  };
  fixLine.isWord = isWord;
  return fixLine;
}

// Common words propose fixes; the larger set stops rare-but-real words being "corrected".
let cached = null;
export async function loadDictionary() {
  cached ??= (async () => {
    const [w10, w20, w35, w50, w70] = (await Promise.all([
      import('wordlist-english/english-words-10.json'),
      import('wordlist-english/english-words-20.json'),
      import('wordlist-english/english-words-35.json'),
      import('wordlist-english/english-words-50.json'),
      import('wordlist-english/english-words-70.json'),
    ])).map((m) => m.default);
    const common = new Set([...w10, ...w20, ...w35, ...w50].map((w) => w.toLowerCase()));
    return { common, valid: new Set([...common, ...w70.map((w) => w.toLowerCase())]) };
  })();
  try { return await cached; } catch { cached = null; return null; }
}
