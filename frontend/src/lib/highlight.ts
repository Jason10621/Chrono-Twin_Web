/**
 * 열람 전용 코드 뷰어용 아주 가벼운 구문 강조기 (외부 라이브러리 없음).
 * 주석·문자열·숫자·키워드 네 가지만 칠하고, 여러 줄에 걸친 토큰(docstring·블록 주석)은 줄 단위로 쪼갠다.
 */

export type TokType = "c" | "s" | "k" | "n" | "p"; // comment, string, keyword, number, plain
export interface Tok {
  t: TokType;
  v: string;
}

const KEYWORDS: Record<string, string> = {
  py: "def class return if elif else for while in not and or is import from as with try except finally raise lambda yield pass break continue None True False self async await assert del global nonlocal",
  ts: "const let var function return if else for while of in new class extends implements interface type enum import export from as default async await try catch finally throw typeof instanceof void null undefined true false this switch case break continue static readonly public private protected keyof satisfies",
  sql: "select from where insert into values update set delete create table alter add column drop policy on to for with check using as and or not null default primary key references unique index trigger function returns return begin end if then else language security definer before after each row execute declare enable level bucket case when true false is in exists using cascade",
  css: "@tailwind @layer @apply @media @supports @keyframes @import",
};

const COMMENT: Record<string, string> = {
  py: "#[^\\n]*",
  ts: "\\/\\/[^\\n]*|\\/\\*[\\s\\S]*?\\*\\/",
  sql: "--[^\\n]*|\\/\\*[\\s\\S]*?\\*\\/",
  css: "\\/\\*[\\s\\S]*?\\*\\/",
};

const STRING: Record<string, string> = {
  py: '"""[\\s\\S]*?"""|\'\'\'[\\s\\S]*?\'\'\'|"(?:\\\\.|[^"\\\\\\n])*"|\'(?:\\\\.|[^\'\\\\\\n])*\'',
  ts: '`(?:\\\\[\\s\\S]|[^`\\\\])*`|"(?:\\\\.|[^"\\\\\\n])*"|\'(?:\\\\.|[^\'\\\\\\n])*\'',
  sql: "'(?:''|[^'])*'",
  css: '"(?:\\\\.|[^"\\\\\\n])*"|\'(?:\\\\.|[^\'\\\\\\n])*\'',
};

function family(lang: string): "py" | "ts" | "sql" | "css" {
  if (lang === "py") return "py";
  if (lang === "sql") return "sql";
  if (lang === "css") return "css";
  return "ts"; // ts, tsx, js …
}

export function highlight(code: string, lang: string): Tok[][] {
  const fam = family(lang);
  const kw = new Set(KEYWORDS[fam].split(" ").map((w) => (fam === "sql" ? w.toLowerCase() : w)));
  const rx = new RegExp(
    `(${COMMENT[fam]})|(${STRING[fam]})|(\\b\\d[\\d_.]*(?:px|rem|em|%|ms|s|deg)?\\b)|(@?[A-Za-z_][\\w-]*)`,
    "g"
  );

  const toks: Tok[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = rx.exec(code)) !== null) {
    if (m.index > last) toks.push({ t: "p", v: code.slice(last, m.index) });
    if (m[1] !== undefined) toks.push({ t: "c", v: m[0] });
    else if (m[2] !== undefined) toks.push({ t: "s", v: m[0] });
    else if (m[3] !== undefined) toks.push({ t: "n", v: m[0] });
    else {
      const word = fam === "sql" ? m[0].toLowerCase() : m[0];
      toks.push({ t: kw.has(word) ? "k" : "p", v: m[0] });
    }
    last = rx.lastIndex;
  }
  if (last < code.length) toks.push({ t: "p", v: code.slice(last) });

  // 줄 단위로 분해
  const lines: Tok[][] = [[]];
  for (const tok of toks) {
    const parts = tok.v.split("\n");
    parts.forEach((part, i) => {
      if (i > 0) lines.push([]);
      if (part) lines[lines.length - 1].push({ t: tok.t, v: part });
    });
  }
  return lines;
}
