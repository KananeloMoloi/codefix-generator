/* Landing page: mobile menu + terminal demo (visual only). */
(function () {
  const menu = document.getElementById("menu"), links = document.getElementById("links");
  menu.addEventListener("click", () => links.classList.toggle("open"));
  links.addEventListener("click", e => { if (e.target.tagName === "A") links.classList.remove("open"); });
  const el = document.getElementById("term");
  const txt = "> CodeFix\n\nError detected:\nNullReferenceException\n\nAnalyzing...\n\nCause:\nAn object is null.\n\nSuggested fix:\nCheck that the object has been initialized\nbefore accessing its properties.";
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) { el.textContent = txt; return; }
  let i = 0; (function t() { el.textContent = txt.slice(0, i); if (i++ < txt.length) setTimeout(t, 22); else el.insertAdjacentHTML("beforeend", '<span class="cur"></span>'); })();
})();
