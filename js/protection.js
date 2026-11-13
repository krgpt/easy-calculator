(function () {
    'use strict';
    var style = document.createElement('style');
    style.textContent = `
      html, body { -webkit-user-select:none!important; -moz-user-select:none!important; -ms-user-select:none!important; user-select:none!important; }
      input, textarea, select, option, [contenteditable="true"], [contenteditable="true"] *, .allow-copy, .allow-copy * {
        -webkit-user-select:text!important; -moz-user-select:text!important; -ms-user-select:text!important; user-select:text!important;
      }
      img { -webkit-user-drag:none; user-drag:none; }
    `;
    (document.head || document.documentElement).appendChild(style);

    function editable(t) {
      return t instanceof Element && !!t.closest('input,textarea,select,[contenteditable="true"],.allow-copy');
    }
    document.addEventListener('contextmenu', function(e){ e.preventDefault(); }, true);
    document.addEventListener('dragstart', function(e){
      if (e.target instanceof Element && e.target.closest('img')) e.preventDefault();
    }, true);
    document.addEventListener('copy', function(e){ if(!editable(e.target)) e.preventDefault(); }, true);
    document.addEventListener('cut', function(e){ if(!editable(e.target)) e.preventDefault(); }, true);
    document.addEventListener('keydown', function(e){
      if (editable(e.target)) return;
      var k = String(e.key || '').toLowerCase(), mod = e.ctrlKey || e.metaKey, block = false;
      if (k === 'f12') block = true;
      if (mod && ['u','s','p','a','c','x'].includes(k)) block = true;
      if (mod && e.shiftKey && ['i','j','c'].includes(k)) block = true;
      if (e.metaKey && e.altKey && ['i','j','u'].includes(k)) block = true;
      if (block) { e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation(); }
    }, true);
})();