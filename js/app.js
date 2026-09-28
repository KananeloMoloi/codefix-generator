/* CodeFix workspace UI. All results come from js/rules.js + data/*.json. */
(function () {
  const $ = id => document.getElementById(id);
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const EMPTY = "Please enter something before generating a result.";
  const T = {
    error: { label: "Error Explainer", btn: "Explain Error", f: [["lang", "Language (optional)", "select"], ["in", "Error message", "textarea", "Paste your error message here..."]] },
    code: { label: "Code Explainer", btn: "Explain Code", f: [["lang", "Programming language", "select"], ["in", "Code", "textarea", "Paste your code here..."]] },
    readme: { label: "README Generator", btn: "Generate README", md: 1, f: [["name", "Project Name"], ["desc", "Project Description", "textarea"], ["lang", "Programming Language"], ["tech", "Technologies"], ["features", "Main Features (one per line or comma-separated)", "textarea"], ["install", "Installation Instructions", "textarea"], ["usage", "Usage", "textarea"], ["author", "Author"], ["github", "GitHub URL"]] },
    docs: { label: "Documentation Generator", btn: "Generate Documentation", md: 1, f: [["name", "Project Name"], ["desc", "Description", "textarea"], ["tech", "Technology"], ["features", "Features", "textarea"], ["install", "Installation", "textarea"], ["usage", "Usage", "textarea"], ["api", "Important Functions/Classes (one per line)", "textarea"]] },
    commit: { label: "Git Commit Generator", btn: "Generate Commit Message", f: [["in", "Change description", "textarea", "Describe what you changed..."]] },
    learn: { label: "Learning Mode", btn: "Explain Concept", f: [["concept", "Concept", "select"]] }
  };
  let tool = "error", cur = null, tmr;

  function tabs() {
    $("tabs").innerHTML = Object.keys(T).map(k => `<button role="tab" data-t="${k}" aria-selected="${k === tool}">${T[k].label}</button>`).join("");
  }
  function form() {
    const t = T[tool]; $("ptitle").textContent = t.label;
    $("form").innerHTML = t.f.map(([id, lab, type, ph]) => {
      let c;
      if (type === "textarea") c = `<textarea id="f_${id}" placeholder="${esc(ph || "")}"></textarea>`;
      else if (type === "select") c = `<select id="f_${id}">${(id === "concept" ? Rules.concepts() : tool === "error" ? ["Any language", ...Rules.errorLangs()] : Rules.LANGS).map(o => `<option>${esc(o)}</option>`).join("")}</select>`;
      else c = `<input id="f_${id}" type="text">`;
      return `<label for="f_${id}">${esc(lab)}</label>${c}`;
    }).join("") + `<button class="btn primary" id="go" type="button">${t.btn}</button>`;
    $("go").onclick = run;
  }
  const val = id => ($("f_" + id).value || "").trim();
  const say = (m, ok) => { const e = $("msg"); e.textContent = m; e.className = "msg" + (ok ? " ok" : ""); e.hidden = !m; clearTimeout(tmr); if (ok) tmr = setTimeout(() => e.hidden = true, 2000); };

  const toText = r => r.md ? r.text : (r.title ? r.title + "\n\n" : "") + r.sections.map(s => s.t + "\n" + (s.body || "") + (s.list ? s.list.map((x, i) => (i + 1) + ". " + x).join("\n") : "") + (s.code ? "\n" + s.code : "")).join("\n\n");

  function show(r, name) {
    cur = r; say(""); $("acts").hidden = false;
    if (window.matchMedia && matchMedia("(max-width:820px)").matches) setTimeout(() => $("out").scrollIntoView({ behavior: "smooth", block: "start" }), 50);
    if (r.md) { $("out").innerHTML = `<textarea id="edit" aria-label="Editable output"></textarea>`; $("edit").value = r.text; }
    else $("out").innerHTML = (r.title ? `<h3 style="margin:0 0 10px">${esc(r.title)}</h3>` : "") + r.sections.map(s =>
      `<div class="rc"><h3>${esc(s.t)}</h3>${s.body ? `<p>${esc(s.body)}</p>` : ""}${s.list ? `<ol>${s.list.map(x => `<li>${esc(x)}</li>`).join("")}</ol>` : ""}${s.code ? `<pre class="code">${esc(s.code)}</pre>` : ""}</div>`).join("");
  }
  const text = () => cur ? (cur.md && $("edit") ? $("edit").value : toText(cur)) : "";

  function run() { try { runTool(); } catch (e) { console.error(e); say("Something went wrong: " + e.message); } }
  function runTool() {
    const t = T[tool]; let r, input;
    if (tool === "error" || tool === "code" || tool === "commit") { input = val("in"); if (!input) return say(EMPTY); }
    if (tool === "error") r = Rules.explainError(input, val("lang") === "Any language" ? "" : val("lang"));
    else if (tool === "code") { r = Rules.explainCode(val("lang"), input); input = "[" + val("lang") + "] " + input; }
    else if (tool === "commit") r = Rules.commit(input);
    else if (tool === "learn") { input = val("concept"); r = Rules.concept(input); }
    else {
      const f = {}; t.f.forEach(([id]) => f[id] = val(id));
      if (!Object.values(f).some(Boolean)) return say(EMPTY);
      for (const id of ["name", "desc"]) if (f[id].length >= 5 && Rules.kind(f[id]) === "gibberish") return say("The project " + (id === "name" ? "name" : "description") + " doesn't look like readable text. Please check it.");
      input = f.name || f.desc || t.label;
      r = { md: 1, title: t.label, sections: [], text: tool === "readme" ? Rules.readme(f) : Rules.docs(f), file: tool === "readme" ? "README.md" : "documentation.md" };
    }
    show(r);
    if (r.invalid || r.notFound) { $("acts").hidden = true; say(r.invalid ? "That input wasn't recognized, so nothing was saved to history." : "No match found, so nothing was saved to history."); return; }
    Store.add(tool, input, r); hist();
  }

  function download() {
    if (!cur) return;
    const md = !!cur.md, name = cur.file || (md ? "codefix.md" : "codefix-result.txt");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([text()], { type: "text/plain" })); a.download = name;
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 500);
  }
  async function copy() {
    const s = text(); if (!s) return;
    try { await navigator.clipboard.writeText(s); say("Copied to clipboard.", 1); }
    catch (e) { const ta = document.createElement("textarea"); ta.value = s; document.body.appendChild(ta); ta.select(); try { document.execCommand("copy"); say("Copied to clipboard.", 1); } catch (x) { say("Copy failed. Select the text and copy manually."); } ta.remove(); }
  }

  function hist() {
    const a = Store.all();
    $("hlist").innerHTML = a.length ? a.map(h => `<div class="h"><div><strong>${esc(T[h.tool].label)}</strong> <small>${esc(new Date(h.time).toLocaleString())}</small><small>${esc(h.input)}</small></div><div><button class="btn sm" data-open="${h.id}">Open</button> <button class="btn sm" data-del="${h.id}">Delete</button></div></div>`).join("") : `<p class="muted">No history yet.</p>`;
  }

  function pick(k) { tool = k; tabs(); form(); }
  function bind() {
    $("tabs").onclick = e => { const b = e.target.closest("button"); if (b) { pick(b.dataset.t); cur = null; $("acts").hidden = true; say(""); $("out").innerHTML = '<p class="muted">Results appear here.</p>'; } };
    $("copy").onclick = copy; $("dl").onclick = download;
    $("clr").onclick = () => { cur = null; $("acts").hidden = true; say(""); $("out").innerHTML = '<p class="muted">Results appear here.</p>'; };
    $("clrall").onclick = () => { if (confirm("Delete all history?")) { Store.clear(); hist(); } };
    $("hlist").onclick = e => {
      const o = e.target.dataset.open, d = e.target.dataset.del;
      if (d) { Store.remove(d); hist(); }
      if (o) { const h = Store.all().find(x => x.id === o); if (h) { pick(h.tool); show(h.result); scrollTo({ top: 0, behavior: "smooth" }); } }
    };
    $("q").oninput = () => {
      const res = Rules.search($("q").value).slice(0, 12);
      $("hits").innerHTML = res.map((r, i) => `<button data-i="${i}">${esc(r.name)}<span>${esc(r.sub)}</span></button>`).join("");
      $("hits").res = res;
    };
    $("hits").onclick = e => {
      const b = e.target.closest("button"); if (!b) return; const r = $("hits").res[b.dataset.i];
      pick(r.kind === "error" ? "error" : "learn"); show(r.kind === "error" ? Rules.errorAt(r.idx) : Rules.conceptAt(r.idx));
      $("hits").innerHTML = ""; $("q").value = "";
    };
    document.addEventListener("click", e => { if (!e.target.closest(".searchbar")) $("hits").innerHTML = ""; });
  }

  Rules.load().then(ok => {
    $("status").textContent = ok ? "Local knowledge base ready" : "Knowledge base could not be loaded";
    const p = new URLSearchParams(location.search).get("tool"); if (T[p]) tool = p;
    tabs(); form(); bind(); hist();
  });
})();
