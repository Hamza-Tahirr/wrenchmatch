import "server-only";

// Splits a SQL script into single statements, for libSQL batches (a batch runs one statement
// per step, while better-sqlite3's exec() takes a whole file). It follows SQLite's own
// sqlite3_complete() state machine (src/complete.c): a semicolon ends a statement, except
// inside strings, quoted identifiers and comments, and inside CREATE TRIGGER, which ends only
// at "; END ;".

// Token kinds, in the column order of TRANSITIONS.
const SEMI = 0;
const WS = 1;
const OTHER = 2;
const EXPLAIN = 3;
const CREATE = 4;
const TEMP = 5;
const TRIGGER = 6;
const END = 7;

// States: 0 nothing yet, 1 between statements, 2 in a statement, 3 after EXPLAIN, 4 after
// CREATE [TEMP], 5 in a trigger, 6 after a ";" in a trigger, 7 after "; END" in a trigger.
const START = 1;
const TRANSITIONS: readonly (readonly number[])[] = [
  /* 0 */ [1, 0, 2, 3, 4, 2, 2, 2],
  /* 1 */ [1, 1, 2, 3, 4, 2, 2, 2],
  /* 2 */ [1, 2, 2, 2, 2, 2, 2, 2],
  /* 3 */ [1, 3, 3, 2, 4, 2, 2, 2],
  /* 4 */ [1, 4, 2, 2, 2, 4, 5, 2],
  /* 5 */ [6, 5, 5, 5, 5, 5, 5, 5],
  /* 6 */ [6, 6, 5, 5, 5, 5, 5, 7],
  /* 7 */ [1, 7, 5, 5, 5, 5, 5, 5],
];

const KEYWORDS: Readonly<Record<string, number>> = {
  create: CREATE,
  end: END,
  explain: EXPLAIN,
  temp: TEMP,
  temporary: TEMP,
  trigger: TRIGGER,
};

/** SQLite's IdChar(): letters, digits, "_", "$" and every non-ASCII character. */
function isIdChar(code: number): boolean {
  return (
    (code >= 0x30 && code <= 0x39) ||
    (code >= 0x41 && code <= 0x5a) ||
    (code >= 0x61 && code <= 0x7a) ||
    code === 0x5f ||
    code === 0x24 ||
    code >= 0x80
  );
}

/** Index just past the character `close`, searching from `from`; throws if there is none. */
function skipPast(sql: string, from: number, close: string, what: string): number {
  const at = sql.indexOf(close, from);
  if (at < 0) throw new Error(`Unterminated ${what} in SQL script.`);
  return at + close.length;
}

/**
 * The statements of `sql`, in order, each ending with its semicolon (a last statement without
 * one is kept as written). Comments and whitespace between statements are dropped. Throws on
 * an unterminated string, identifier, comment or CREATE TRIGGER.
 */
export function splitSqlStatements(sql: string): string[] {
  const statements: string[] = [];
  let state = 0;
  let start = -1; // offset of the current statement's first token
  let i = 0;
  while (i < sql.length) {
    const char = sql[i];
    let token: number;
    let next: number;
    if (char === ";") {
      token = SEMI;
      next = i + 1;
    } else if (char === " " || char === "\t" || char === "\n" || char === "\r" || char === "\f") {
      token = WS;
      next = i + 1;
    } else if (char === "/" && sql[i + 1] === "*") {
      token = WS;
      next = skipPast(sql, i + 2, "*/", "comment");
    } else if (char === "-" && sql[i + 1] === "-") {
      token = WS;
      const lineEnd = sql.indexOf("\n", i);
      next = lineEnd < 0 ? sql.length : lineEnd + 1;
    } else if (char === "[") {
      token = OTHER;
      next = skipPast(sql, i + 1, "]", "[identifier]");
    } else if (char === "'" || char === '"' || char === "`") {
      // A doubled quote ('it''s') reads as two adjacent tokens, which changes nothing here.
      token = OTHER;
      next = skipPast(sql, i + 1, char, char === "'" ? "string" : "quoted identifier");
    } else if (isIdChar(char.charCodeAt(0))) {
      next = i + 1;
      while (next < sql.length && isIdChar(sql.charCodeAt(next))) next++;
      token = KEYWORDS[sql.slice(i, next).toLowerCase()] ?? OTHER;
    } else {
      token = OTHER;
      next = i + 1;
    }

    if (token !== WS && token !== SEMI && start < 0) start = i;
    state = TRANSITIONS[state][token];
    if (token === SEMI && state === START && start >= 0) {
      statements.push(sql.slice(start, next));
      start = -1;
    }
    i = next;
  }

  if (start >= 0) {
    // SQLite runs a final statement without its semicolon, but not an unfinished trigger.
    if (state === 5 || state === 6) throw new Error("Unterminated CREATE TRIGGER in SQL script (missing END).");
    statements.push(sql.slice(start).trimEnd());
  }
  return statements;
}
