# CodeFix Generator

A rule-based developer assistant that explains common coding errors and helps generate developer documentation.
No API keys. No external AI. No cloud processing. Everything runs in the browser from local rules and JSON data.

## Run it
Open `index.html` in a browser (double-click works). Optionally serve the folder: `python3 -m http.server` then visit http://localhost:8000.

## Tools
17 languages incl. React, TypeScript, Node.js, PHP, Go, Rust, C/C++, Ruby and Git. Plain-English or gibberish input is detected and rejected with guidance. Tools: Error Explainer, Code Explainer, README Generator, Documentation Generator, Git Commit Generator, Learning Mode, local Search, and a LocalStorage History panel.

## Edit the knowledge base
Edit `data/errors.json`, `data/concepts.json`, `data/commit-rules.json`.
Note: browsers block `fetch()` on `file://` pages, so `js/data.js` holds an offline copy of the JSON that is used automatically in that case. When you edit the JSON, regenerate it (or just use a local server, which reads the JSON directly).

## Structure
`index.html`, `app.html`, `css/`, `js/` (main, app, rules, storage, data), `data/`.
