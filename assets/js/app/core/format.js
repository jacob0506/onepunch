(() => {
  function escapeHtml(str) {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function escapeRegExp(s) {
    return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  window.escapeHtml = window.escapeHtml || escapeHtml;
  window.escapeRegExp = window.escapeRegExp || escapeRegExp;
  if (window.Game && window.Game.core) {
    window.Game.core.format = { escapeHtml, escapeRegExp };
  }
})();

