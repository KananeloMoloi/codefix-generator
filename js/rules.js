/* CodeFix rule engine: local data + keyword/regex rules only. No network calls to any AI service. */
window.Rules = (function () {
  const D = { errors: [], concepts: [], commits: { types: [], leadingVerbs: [] } };
  const LANGS = ["Auto-detect", "C#", "Java", "JavaScript", "TypeScript", "React (JSX)", "Node.js", "Python", "SQL", "HTML", "CSS", "PHP", "Go", "Rust", "C", "C++", "Ruby"];

  async function load() {
    try {
      const get = async n => { const r = await fetch("data/" + n); if (!r.ok) throw new Error(n); return r.json(); };
      D.errors = await get("errors.json"); D.concepts = await get("concepts.json"); D.commits = await get("commit-rules.json");
    } catch (e) { // opened via file:// -> fetch is blocked; use the bundled copy
      const d = window.CODEFIX_DATA;
      if (d) { D.errors = d.errors; D.concepts = d.concepts; D.commits = d.commits; }
    }
    return D.errors.length > 0;
  }

  const errSections = e => [
    { t: "What happened?", body: e.explanation },
    { t: "Why did it happen?", body: e.cause },
    { t: "How to fix it", list: e.solution },
    { t: "Example", code: e.example },
    { t: "Beginner explanation", body: e.beginner }
  ];

  const CODEY = /[{}();=<>$#\[\]\\]|::|=>|\/\/|\b(?:function|def|class|select|insert|import|return|const|let|var|public|void|fn|func|package|console|require)\b|\w\.\w+\(|^\s*<\/?\w/im;
  const ERRY = /(error|exception|traceback|undefined|null|nil|failed|fatal|cannot|can't|unexpected|not defined|invalid|denied|refused|segmentation|warning|panic|conflict|\bts\d{4}\b|\be\d{4}\b)/i;
  const ASKY = /^\s*(?:what|how|why|when|where|who|which|can|could|should|would|please|help|hi|hello|hey|explain|tell|show|is|are|do|does|i|my|the|a)\b/i;
  function kind(t) {
    const s = (t || "").trim(); if (!s) return "empty";
    const w = s.toLowerCase().match(/[a-z']+/g) || [], letters = (s.match(/[a-z]/gi) || []).length, vr = x => (x.match(/[aeiouy]/g) || []).length / x.length;
    if (s.length < 3 || letters / s.length < 0.4 || /(.)\1{5,}/.test(s)) return "gibberish";
    if (w.length && w.every(x => x.length > 3 && !/[aeiouy]/.test(x))) return "gibberish";
    if (w.length === 1 && w[0].length >= 6 && vr(w[0]) < 0.2) return "gibberish";
    if (w.length === 1 && /^(hi|hello|hey|help|test|hola|thanks|ok|yes|no|please)$/.test(w[0])) return "english";
    if (w.length >= 2 && !CODEY.test(s) && (ASKY.test(s) || !ERRY.test(s))) return "english";
    return "ok";
  }
  const inv = (title, body, tips) => ({ title, invalid: true, sections: [{ t: "Input not recognized", body }, { t: "What to try", list: tips }] });
  function suggest(text) {
    const tk = [...new Set((text.toLowerCase().match(/[a-z]{4,}/g) || []).map(x => x.replace(/(?:ing|es|s)$/, "")))].filter(x => x.length >= 3), out = [];
    D.concepts.forEach(c => { if (tk.some(t => c.name.toLowerCase().includes(t))) out.push(c.name + " (Learning Mode)"); });
    D.errors.forEach(e => { if (tk.some(t => e.name.toLowerCase().includes(t))) out.push(e.name + " (" + e.language + ")"); });
    return out.slice(0, 5);
  }

  function explainError(text, lang) {
    const low = text.toLowerCase();
    let best = null, score = 0;
    D.errors.forEach(e => {
      let s = 0;
      e.keywords.forEach(k => { if (low.includes(k.toLowerCase())) s += 10 + k.length; });
      if (s && lang && e.language === lang) s += 8; else if (s && low.includes(e.language.toLowerCase())) s += 3;
      if (s > score) { score = s; best = e; }
    });
    if (best) return { title: best.name + " (" + best.language + ")", sections: errSections(best) };
    const k = kind(text), sg = suggest(text);
    if (k === "gibberish") return inv("Input not recognized", "That doesn't look like an error message or readable text.", ["Copy the full error from your terminal, console or browser DevTools.", "Paste the whole line, e.g. TypeError: x is not a function."]);
    if (k === "english") return inv("Plain English detected", "This looks like plain English rather than an error message. CodeFix matches the text of real errors; it can't answer free-form questions.", ["Paste the exact error text from your console or terminal.", "For concepts, use Learning Mode or the search box.", ...(sg.length ? ["Related topics: " + sg.join(", ")] : [])]);
    return { title: "Error not recognized", notFound: true, sections: [
      { t: "Not in the knowledge base", body: "This error is not currently included in the CodeFix local knowledge base." },
      { t: "Next step", body: "Try searching the supported error patterns or add this error to the local knowledge base (data/errors.json)." }] };
  }

  function search(q) {
    q = q.toLowerCase().trim(); if (!q) return [];
    const out = [];
    D.errors.forEach((e, i) => {
      if ([e.name, e.language, e.explanation, ...e.keywords].join(" ").toLowerCase().includes(q))
        out.push({ kind: "error", idx: i, name: e.name, sub: e.language + " error" });
    });
    D.concepts.forEach((c, i) => { if ((c.name + " " + c.what).toLowerCase().includes(q)) out.push({ kind: "concept", idx: i, name: c.name, sub: "Concept" }); });
    return out;
  }
  const errorAt = i => ({ title: D.errors[i].name + " (" + D.errors[i].language + ")", sections: errSections(D.errors[i]) });

  const conceptSections = c => [
    { t: "What is it?", body: c.what }, { t: "Why do programmers use it?", body: c.why },
    { t: "Simple example", code: c.example }, { t: "Real-world example", body: c.real },
    { t: "Common mistake", body: c.mistake }, { t: "Quick exercise", body: c.exercise }];
  const conceptAt = i => ({ title: D.concepts[i].name, sections: conceptSections(D.concepts[i]) });
  const concept = name => { const i = D.concepts.findIndex(c => c.name === name); return i < 0 ? null : conceptAt(i); };

  /* ---------- Code explainer ---------- */
  const cnt = (s, re) => (s.match(re) || []).length;
  const P = {
    JavaScript: { Variables: /\b(?:let|const|var)\s+\w+/g, Functions: /\bfunction\s+\w+|=>/g, Classes: /\bclass\s+\w+/g, Loops: /\b(?:for|while|do)\s*[({]/g, "If statements": /\bif\s*\(/g, Imports: /^\s*import\s.+|require\(/gm, Comments: /\/\/.*|\/\*[\s\S]*?\*\//g },
    Python: { Variables: /^\s*\w+\s*=[^=]/gm, Functions: /\bdef\s+\w+/g, Classes: /\bclass\s+\w+/g, Loops: /^\s*(?:for|while)\b.*:/gm, "If statements": /^\s*if\b.*:/gm, Imports: /^\s*(?:import|from)\s+.+/gm, Comments: /#.*/g },
    "C#": { Variables: /\b(?:int|string|double|float|bool|var|long|char|decimal)\s+\w+\s*(?:=|;)/g, Methods: /\b(?:public|private|protected|internal|static)\s+[\w<>\[\]?]+\s+\w+\s*\(/g, Classes: /\bclass\s+\w+/g, Loops: /\b(?:for|foreach|while)\s*\(/g, "If statements": /\bif\s*\(/g, Imports: /^\s*using\s+[\w.]+;/gm, Comments: /\/\/.*|\/\*[\s\S]*?\*\//g },
    Java: { Variables: /\b(?:int|String|double|float|boolean|var|long|char)\s+\w+\s*(?:=|;)/g, Methods: /\b(?:public|private|protected|static)\s+[\w<>\[\]]+\s+\w+\s*\(/g, Classes: /\bclass\s+\w+/g, Loops: /\b(?:for|while)\s*\(/g, "If statements": /\bif\s*\(/g, Imports: /^\s*import\s+[\w.*]+;/gm, Comments: /\/\/.*|\/\*[\s\S]*?\*\//g },
    SQL: { "SELECT queries": /\bselect\b/gi, "INSERT statements": /\binsert\s+into\b/gi, "UPDATE statements": /\bupdate\s+\w+\s+set\b/gi, "DELETE statements": /\bdelete\s+from\b/gi, "CREATE statements": /\bcreate\s+(?:table|view|index|database)\b/gi, "JOINs": /\bjoin\b/gi, "WHERE filters": /\bwhere\b/gi, "GROUP BY / ORDER BY": /\b(?:group|order)\s+by\b/gi, Comments: /--.*|\/\*[\s\S]*?\*\//g },
    HTML: { Elements: /<[a-z][\w-]*/gi, "Links": /<a\s/gi, Images: /<img\s/gi, Forms: /<form\b/gi, Inputs: /<(?:input|textarea|select|button)\b/gi, Scripts: /<script\b/gi, Stylesheets: /<link\b[^>]*stylesheet|<style\b/gi, Comments: /<!--[\s\S]*?-->/g },
    CSS: { "Rules (selectors)": /[^{}]+\{/g, Declarations: /[\w-]+\s*:\s*[^;{}]+;/g, "Media queries": /@media/g, "Class selectors": /\.[a-z_-][\w-]*\s*[{,]/gi, "ID selectors": /#[a-z_-][\w-]*\s*[{,]/gi, Variables: /--[\w-]+\s*:/g, Comments: /\/\*[\s\S]*?\*\//g }
  };
  const HELP = { Variables: "Variables store values so the program can use them later.", Functions: "Functions are reusable blocks of code that do one job.", Methods: "Methods are functions that belong to a class.", Classes: "Classes are blueprints for creating objects.", Loops: "Loops repeat code until a condition stops them.", "If statements": "If statements run code only when a condition is true.", Imports: "Imports bring in code from other files or libraries.", Comments: "Comments are notes for humans; the computer ignores them.", "SELECT queries": "SELECT reads data from a table.", "INSERT statements": "INSERT adds new rows.", "UPDATE statements": "UPDATE changes existing rows.", "DELETE statements": "DELETE removes rows.", "CREATE statements": "CREATE builds tables or other database objects.", JOINs: "JOIN combines rows from two tables.", "WHERE filters": "WHERE limits which rows are affected.", "GROUP BY / ORDER BY": "GROUP BY groups rows; ORDER BY sorts them.", Elements: "HTML elements (tags) build the page structure.", Links: "<a> tags create links.", Images: "<img> tags show pictures.", Forms: "<form> collects user input.", Inputs: "Inputs, textareas and buttons let users interact.", Scripts: "<script> runs JavaScript.", Stylesheets: "Stylesheets control the look of the page.", "Rules (selectors)": "A rule picks elements with a selector and styles them.", Declarations: "Declarations set a property, like color: red;.", "Media queries": "Media queries change styles for different screen sizes.", "Class selectors": "Class selectors (.name) style any element with that class.", "ID selectors": "ID selectors (#name) style one specific element." };

  const JS = P.JavaScript;
  Object.assign(P, {
    "Node.js": JS,
    TypeScript: { ...JS, Interfaces: /\binterface\s+\w+/g, "Type aliases": /\btype\s+\w+\s*=/g, Enums: /\benum\s+\w+/g },
    "React (JSX)": { Components: /\bfunction\s+[A-Z]\w*|\bconst\s+[A-Z]\w*\s*=\s*(?:\([^)]*\)|\w+)\s*=>|extends\s+(?:React\.)?Component/g, Hooks: /\buse[A-Z]\w*\(/g, "State hooks": /\buseState\(/g, Effects: /\buseEffect\(/g, "JSX elements": /<[A-Za-z][\w.]*[\s>\/]/g, "Event handlers": /\bon[A-Z]\w*=\{/g, Variables: /\b(?:let|const|var)\s+\w+/g, Imports: /^\s*import\s.+/gm, Comments: /\/\/.*|\/\*[\s\S]*?\*\//g },
    PHP: { Variables: /\$\w+\s*=/g, Functions: /\bfunction\s+\w+/g, Classes: /\bclass\s+\w+/g, Loops: /\b(?:for|foreach|while)\s*\(/g, "If statements": /\bif\s*\(/g, Imports: /\b(?:require|include)(?:_once)?\b/g, "Echo/print": /\b(?:echo|print)\b/g, Comments: /\/\/.*|#.*|\/\*[\s\S]*?\*\//g },
    Go: { Variables: /\bvar\s+\w+|\w+\s*:=/g, Functions: /\bfunc\s+/g, Structs: /\bstruct\s*\{/g, Loops: /\bfor\b/g, "If statements": /\bif\b/g, Imports: /\bimport\b/g, Goroutines: /\bgo\s+\w+\(/g, Comments: /\/\/.*|\/\*[\s\S]*?\*\//g },
    Rust: { Variables: /\blet\s+(?:mut\s+)?\w+/g, Functions: /\bfn\s+\w+/g, Structs: /\b(?:struct|enum)\s+\w+/g, Loops: /\b(?:for|while|loop)\b/g, "If statements": /\bif\b/g, Imports: /\buse\s+[\w:]+/g, Match: /\bmatch\b/g, Comments: /\/\/.*|\/\*[\s\S]*?\*\//g },
    C: { Variables: /\b(?:int|char|float|double|long|short|unsigned)\s+\**\w+\s*(?:=|;|\[)/g, Functions: /^\s*[\w*]+\s+\**\w+\s*\([^;)]*\)\s*\{/gm, Structs: /\bstruct\s+\w+/g, Loops: /\b(?:for|while)\s*\(/g, "If statements": /\bif\s*\(/g, Imports: /^\s*#include.+/gm, Comments: /\/\/.*|\/\*[\s\S]*?\*\//g },
    Ruby: { Variables: /^\s*\w+\s*=[^=]/gm, Methods: /\bdef\s+\w+/g, Classes: /\bclass\s+\w+/g, Loops: /\.each\b|\bwhile\b|\bloop\s+do|\bfor\s+\w+\s+in/g, "If statements": /^\s*(?:if|unless)\b/gm, Imports: /\brequire(?:_relative)?\b/g, Output: /\bputs\b/g, Comments: /#.*/g }
  });
  P["C++"] = { ...P.C, Classes: /\bclass\s+\w+/g, Namespaces: /\busing\s+namespace|\bnamespace\s+\w+/g };
  Object.assign(HELP, { Interfaces: "Interfaces describe the shape an object must have.", "Type aliases": "Type aliases give a name to a type.", Enums: "Enums are named sets of constants.", Components: "Components are reusable pieces of UI.", Hooks: "Hooks (useSomething) add features like state to function components.", "State hooks": "useState lets a component remember a value.", Effects: "useEffect runs code after rendering, e.g. to fetch data.", "JSX elements": "JSX looks like HTML but lives inside JavaScript.", "Event handlers": "Handlers like onClick run when the user interacts.", "Echo/print": "echo/print output text.", Structs: "Structs group related fields into one type.", Goroutines: "Goroutines run functions concurrently.", Match: "match picks code by comparing a value to patterns.", Output: "puts prints text to the screen.", Namespaces: "Namespaces group names to avoid clashes." });
  const FAM = { JavaScript: "js", TypeScript: "js", "React (JSX)": "js", "Node.js": "js", C: "c", "C++": "c" };
  const same = (a, b) => (FAM[a] || a) === (FAM[b] || b);
  const GUESS = [["PHP", /<\?php|\$\w+\s*=/], ["React (JSX)", /\buse(?:State|Effect|Ref)\(|return\s*\(\s*<|<[A-Z]\w*[\s\/>]/], ["TypeScript", /\binterface\s+\w+|:\s*(?:string|number|boolean)\b(?=\s*[,;)=])/], ["SQL", /^\s*(?:select|insert\s+into|update\s+\w+\s+set|delete\s+from|create\s+table)\b/im], ["HTML", /<(?:!doctype|html|div|body|head|p|span|a|ul)\b/i], ["Go", /\bfunc\s+\w*\(|\bpackage\s+\w+|:=/], ["Rust", /\bfn\s+\w+|\blet\s+mut\b/], ["C++", /#include\s*<iostream>|std::|\bcout\b/], ["C", /#include\s*<\w+\.h>|\bprintf\s*\(/], ["Java", /\bpublic\s+static\s+void\s+main|System\.out\.print/], ["C#", /\bConsole\.Write|\busing\s+System/], ["JavaScript", /\b(?:const|let|var)\s+\w+\s*=|=>|console\.log|function\s+\w+\s*\(/], ["Python", /^\s*def\s+\w+\s*\(.*\)\s*:|^\s*import\s+[\w.]+\s*$|^\s*from\s+[\w.]+\s+import\b|\bprint\(|^\s*elif\b/m], ["Ruby", /\bputs\s|\bdef\s+\w+\s*$/m], ["CSS", /[.#]?[\w-]+\s*\{[^}]*:[^}]*\}/]];
  const guessLang = c => { for (const [n, re] of GUESS) if (re.test(c)) return n; return null; };

  function issues(lang, code) {
    const r = [];
    const bal = (a, b, n) => { if (cnt(code, new RegExp("\\" + a, "g")) !== cnt(code, new RegExp("\\" + b, "g"))) r.push("Unbalanced " + n + ": the number of " + a + " and " + b + " differs."); };
    if (lang !== "SQL" && lang !== "HTML") { bal("{", "}", "braces"); bal("(", ")", "parentheses"); }
    if (lang === "JavaScript") { if (/\bvar\s/.test(code)) r.push("'var' found: prefer let or const."); if (/[^=!]==[^=]/.test(code)) r.push("'==' found: prefer === for strict comparison."); }
    if (lang === "Python") { if (/^\t/m.test(code) && /^ +\S/m.test(code)) r.push("Tabs and spaces are mixed for indentation."); if (/except\s*:/.test(code)) r.push("A bare 'except:' hides every error; catch specific ones."); if (/^\s*(?:if|for|while|def|class|elif|else)\b[^:\n]*$/m.test(code)) r.push("A line starting with if/for/while/def/class may be missing its ending colon (:).") }
    if (lang === "SQL") { if (/select\s+\*/i.test(code)) r.push("SELECT * found: list only the columns you need."); if (/\b(?:update\s+\w+\s+set|delete\s+from)\b/i.test(code) && !/\bwhere\b/i.test(code)) r.push("UPDATE/DELETE without WHERE affects every row."); }
    if (lang === "C#" || lang === "Java") { if (/\bcatch\s*\([^)]*\)\s*\{\s*\}/.test(code)) r.push("An empty catch block hides errors."); }
    if (lang === "HTML") ["div", "p", "span", "ul", "li", "section", "a", "form", "table", "button"].forEach(t => { const o = cnt(code, new RegExp("<" + t + "[\\s>]", "gi")), c = cnt(code, new RegExp("</" + t + ">", "gi")); if (o !== c) r.push("<" + t + "> opened " + o + " time(s) but closed " + c + " time(s)."); });
    if (lang === "CSS") { const d = code.replace(/\/\*[\s\S]*?\*\//g, ""); if (/[\w-]+\s*:\s*[^;{}]+\n\s*[\w-]+\s*:/.test(d)) r.push("A declaration may be missing its semicolon (;)."); }
    if (lang === "React (JSX)") { if (/\.map\([^)]*=>\s*\(?\s*<\w+(?![^>]*\bkey=)/.test(code)) r.push("An element returned from .map() may be missing a key prop."); if (/<\w+[^>]*\sclass=/.test(code)) r.push("Use className instead of class in JSX."); }
    if (lang === "TypeScript" && /:\s*any\b/.test(code)) r.push("': any' found: it turns off type checking; use a specific type.");
    if (lang === "PHP" && /\bmysql_\w+\(/.test(code)) r.push("mysql_* functions are removed; use PDO or mysqli.");
    if ((lang === "C" || lang === "C++") && /\b(?:gets|strcpy)\s*\(/.test(code)) r.push("gets/strcpy are unsafe (buffer overflow); use fgets/strncpy.");
    if (lang === "Rust" && /\.unwrap\(\)/.test(code)) r.push(".unwrap() will panic on errors; consider handling the error.");
    return r;
  }

  const CSYM = /[{}()\[\];=<>$#+*%&|^~]|=>|::|\/\/|<\/?\w/;
  const CKW = /\b(?:function|def|class|select|from|where|import|return|const|let|var|public|private|void|int|string|fn|func|package|echo|puts|print|console|require|use|if|else|elif|for|while|end|do|then|begin|struct|interface)\b/i;
  function codeKind(t) {
    const s = (t || "").trim(); if (!s) return "empty";
    const w = s.toLowerCase().match(/[a-z']+/g) || [];
    if (!/[a-z0-9]/i.test(s)) return "gibberish";
    if (CSYM.test(s)) return "ok";
    if (/(.)\1{5,}/.test(s) || (w.length && w.every(x => x.length > 3 && !/[aeiouy]/.test(x)))) return "gibberish";
    if (w.length === 1 && w[0].length >= 6 && (w[0].match(/[aeiouy]/g) || []).length / w[0].length < 0.2) return "gibberish";
    if (CKW.test(s) && w.length <= 12) return "ok";
    return w.length >= 1 && s.length >= 3 ? "english" : "gibberish";
  }
  function bestGuess(code) {
    let best = null, top = 0;
    Object.keys(P).forEach(l => { let n = 0; Object.keys(P[l]).forEach(k => { if (k !== "Comments") n += cnt(code, P[l][k]); }); if (n > top) { top = n; best = l; } });
    return best;
  }

  function explainCode(lang, code) {
    const k = codeKind(code);
    if (k === "gibberish") return inv("Input not recognized", "That doesn't look like source code.", ["Paste a real code snippet (a few lines is enough)."]);
    if (k === "english") return inv("Plain English detected", "This looks like plain English, not code.", ["Paste the code itself, not a description of it.", "To learn a concept in plain words, use Learning Mode."]);
    let g = guessLang(code), guessed = false; let tag = lang + " (selected)", pre = [];
    if (lang === "Auto-detect") {
      if (!g) { g = bestGuess(code); guessed = true; }
      if (!g) return inv("Language not detected", "CodeFix couldn't tell which language this is.", ["Pick the language manually.", "Paste a longer snippet."]);
      lang = g; tag = g + (guessed ? " (best guess, please confirm)" : " (auto-detected)");
    } else if (g && !same(g, lang)) pre.push("This looks like " + g + " but " + lang + " is selected, so results may be inaccurate.");
    const pats = P[lang] || {}, comps = [];
    Object.keys(pats).forEach(k => { const n = cnt(code, pats[k]); if (n) comps.push([k, n]); });
    const main = comps.filter(c => c[0] !== "Comments");
    const does = main.length ? "This " + lang + " code contains " + main.map(c => c[1] + " " + c[0].toLowerCase()).join(", ") + ". It was described by matching simple patterns, so exact behavior is not verified." : "No known " + lang + " patterns were detected. Check that the selected language is correct.";
    const iss = pre.concat(issues(lang, code));
    return { title: lang + " code overview", sections: [
      { t: "Language", body: tag },
      { t: "What this code does", body: does },
      { t: "Main components", list: comps.length ? comps.map(c => c[0] + ": " + c[1]) : ["Nothing detected"] },
      { t: "Beginner explanation", list: comps.length ? comps.map(c => HELP[c[0]]).filter(Boolean) : ["Try pasting a longer snippet."] },
      { t: "Possible issues", list: iss.length ? iss : ["None found by the local rules (this is not a full code review)."] }] };
  }

  /* ---------- Generators ---------- */
  const lines = s => (s || "").split(/\n|,/).map(x => x.trim()).filter(Boolean);
  const bullets = s => lines(s).map(x => "- " + x).join("\n") || "- _To be added_";
  function readme(f) {
    const name = f.name || "Project Name";
    return "# " + name + "\n\n" + (f.desc ? "## Description\n\n" + f.desc + "\n\n" : "## Description\n\n_Add a description._\n\n") +
      "## Technologies\n\n" + bullets([f.lang, f.tech].filter(Boolean).join(",")) + "\n\n## Features\n\n" + bullets(f.features) +
      "\n\n## Installation\n\n" + (f.install ? "```bash\n" + f.install + "\n```" : "_Add installation steps._") +
      "\n\n## Usage\n\n" + (f.usage || "_Add usage instructions._") + "\n\n## Author\n\n" + (f.author || "_Your name_") +
      (f.github ? "\n\n[GitHub](" + f.github + ")" : "") + "\n\n## License\n\nMIT\n";
  }
  function docs(f) {
    const name = f.name || "Project Name";
    return "# " + name + " Documentation\n\n## Overview\n\n" + (f.desc || "_Add an overview._") + "\n\n**Technology:** " + (f.tech || "_n/a_") +
      "\n\n## Features\n\n" + bullets(f.features) + "\n\n## Installation\n\n" + (f.install ? "```bash\n" + f.install + "\n```" : "_Add installation steps._") +
      "\n\n## Usage\n\n" + (f.usage || "_Add usage instructions._") + "\n\n## Important Functions / Classes\n\n" +
      (lines(f.api).map(x => "### `" + x + "`\n\nDescribe what `" + x + "` does, its inputs and its output.\n").join("\n") || "_List key functions or classes._") + "\n";
  }

  function commit(text) {
    if (kind(text) === "gibberish") return inv("Input not recognized", "That doesn't look like a description of a change.", ["Describe the change in a short sentence, e.g. Added login form."]);
    const low = text.toLowerCase(), T = D.commits.types;
    let hit = null;
    for (const t of T) if (t.keywords.some(k => new RegExp("\\b" + k + "\\b").test(low))) { hit = t; break; }
    let dflt = false; if (!hit) { hit = { type: "chore", verb: "update" }; dflt = true; }
    let rest = text.trim().replace(/[.\s]+$/, "");
    const lv = D.commits.leadingVerbs.join("|");
    rest = rest.replace(new RegExp("^(?:" + lv + ")\\s+", "i"), "");
    if (hit.type === "fix") rest = rest.replace(/\s*(?:is|are)?\s*(?:not working|broken|failing)\b/i, " issue").replace(/\bbug\b/i, "issue");
    if (!/^[A-Z]{2,}/.test(rest)) rest = rest.charAt(0).toLowerCase() + rest.slice(1);
    const main = hit.type + ": " + hit.verb + " " + rest;
    const alt = ["chore", "feat", "fix"].filter(t => t !== hit.type).slice(0, 2).map(t => t + ": " + rest);
    return { title: "Commit message", text: main, sections: [
      { t: "Suggested commit", code: main }, { t: "Type detected", body: hit.type + (dflt ? " (default: no action keyword such as add, fix or update was found)" : " (matched by keyword rules)") },
      { t: "Alternatives", list: alt }, { t: "Tip", body: "Keep the subject under 72 characters, in the present tense." }] };
  }

  return { load, LANGS, kind, errorLangs: () => [...new Set(D.errors.map(e => e.language))], explainError, search, errorAt, conceptAt, concept, concepts: () => D.concepts.map(c => c.name), explainCode, readme, docs, commit, count: () => D.errors.length };
})();
