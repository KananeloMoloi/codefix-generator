/* History stored in the browser's LocalStorage only. */
window.Store = (function () {
  const K = "codefix_history_v1";
  const all = () => { try { return JSON.parse(localStorage.getItem(K)) || []; } catch (e) { return []; } };
  const save = a => { try { localStorage.setItem(K, JSON.stringify(a.slice(0, 50))); return true; } catch (e) { return false; } };
  return {
    all,
    add(tool, input, result) { const a = all(); a.unshift({ id: Date.now() + Math.random().toString(16).slice(2), tool, input, result, time: new Date().toISOString() }); save(a); },
    remove(id) { save(all().filter(h => h.id !== id)); },
    clear() { save([]); }
  };
})();
