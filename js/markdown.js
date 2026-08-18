'use strict';

const Markdown = (() => {
  function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, (ch) => {
      const map = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;',
      };
      return map[ch];
    });
  }

  function render(source) {
    const text = typeof source === 'string' ? source : '';
    try {
      if (typeof marked === 'function') {
        return marked(text) || '';
      }
      if (typeof marked !== 'undefined' && typeof marked.parse === 'function') {
        return marked.parse(text) || '';
      }
    } catch (err) {
      /* 渲染库异常时降级为纯文本 */
    }
    return '<p>' + escapeHtml(text).replace(/\n/g, '<br>') + '</p>';
  }

  function highlight(container) {
    if (!container || typeof hljs === 'undefined') {
      return;
    }
    container.querySelectorAll('pre code').forEach((block) => {
      try {
        hljs.highlightElement(block);
      } catch (err) {
        /* 无法识别的语言保持原文 */
      }
    });
  }

  return {
    render,
    highlight,
  };
})();