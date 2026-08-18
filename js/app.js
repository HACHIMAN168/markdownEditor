'use strict';

const App = (() => {
  const el = {
    btnNew: document.getElementById('btn-new'),
    search: document.getElementById('search-input'),
    list: document.getElementById('note-list'),
    title: document.getElementById('note-title'),
    content: document.getElementById('note-content'),
    preview: document.getElementById('preview-area'),
  };

  let notes = [];
  let selectedId = null;
  let searchKeyword = '';
  let saveTimer = null;
  let moreMenu = null;
  let menuNoteId = null;

  function init() {
    notes = Storage.load();
    selectedId = notes.length ? notes[0].id : null;
    moreMenu = createMoreMenu();
    bindEvents();
    renderList();
    syncEditor();
    window.addEventListener('beforeunload', flushSave);
  }

  function createMoreMenu() {
    const menu = document.createElement('div');
    menu.className = 'more-menu';
    menu.hidden = true;
    document.body.appendChild(menu);
    return menu;
  }

  function bindEvents() {
    el.btnNew.addEventListener('click', createNote);
    el.search.addEventListener('input', onSearchInput);
    el.search.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        el.search.value = '';
        onSearchInput();
      }
    });
    el.list.addEventListener('click', (e) => {
      const delBtn = e.target.closest('.note-del');
      if (delBtn) {
        const li = delBtn.closest('.note-item');
        if (li) {
          deleteNote(li.dataset.id);
        }
        return;
      }
      const moreBtn = e.target.closest('.note-more');
      if (moreBtn) {
        const li = moreBtn.closest('.note-item');
        if (li) {
          openNoteMenu(li.dataset.id, moreBtn);
        }
        return;
      }
      const li = e.target.closest('.note-item');
      if (li) {
        selectNote(li.dataset.id);
      }
    });
    el.title.addEventListener('input', () => updateNote('title'));
    el.content.addEventListener('input', () => updateNote('content'));
    document.addEventListener('click', (e) => {
      if (!e.target.closest('.more-menu') && !e.target.closest('.note-more')) {
        closeNoteMenu();
      }
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        closeNoteMenu();
      }
    });
    el.list.addEventListener('scroll', closeNoteMenu);
  }

  function openNoteMenu(id, btn) {
    closeNoteMenu();
    menuNoteId = id;

    const exportParent = document.createElement('div');
    exportParent.className = 'more-menu-item more-menu-parent';
    exportParent.textContent = '导出文件';

    const exportSub = document.createElement('div');
    exportSub.className = 'more-menu-sub';
    exportSub.appendChild(createMenuItem('导出为 Markdown (.md)', () => exportNote('md')));
    exportSub.appendChild(createMenuItem('导出为 HTML (.html)', () => exportNote('html')));
    exportParent.appendChild(exportSub);

    const sep = document.createElement('div');
    sep.className = 'more-menu-sep';

    const openDir = createMenuItem('打开文件所在目录', () => closeNoteMenu());

    moreMenu.appendChild(exportParent);
    moreMenu.appendChild(sep);
    moreMenu.appendChild(openDir);

    moreMenu.hidden = false;
    const rect = btn.getBoundingClientRect();
    let left = rect.right + 4;
    let top = rect.top;
    let flipLeft = false;
    if (left + moreMenu.offsetWidth > window.innerWidth) {
      left = rect.left - moreMenu.offsetWidth - 4;
      flipLeft = true;
    }
    if (top + moreMenu.offsetHeight > window.innerHeight) {
      top = window.innerHeight - moreMenu.offsetHeight - 4;
    }
    moreMenu.classList.toggle('more-menu-open-left', flipLeft);
    moreMenu.style.left = Math.max(0, left) + 'px';
    moreMenu.style.top = Math.max(0, top) + 'px';
  }

  function createMenuItem(text, onClick) {
    const item = document.createElement('button');
    item.type = 'button';
    item.className = 'more-menu-item';
    item.textContent = text;
    item.addEventListener('click', onClick);
    return item;
  }

  function exportNote(format) {
    const note = notes.find((item) => item.id === menuNoteId);
    closeNoteMenu();
    if (!note) {
      return;
    }
    const name = (note.title || '未命名笔记').replace(/[\\/:*?"<>|]/g, '-').trim() || '未命名笔记';
    const blob = format === 'html' ? buildHtmlExport(note) : new Blob([note.content], { type: 'text/markdown;charset=utf-8' });
    downloadBlob(blob, name + (format === 'html' ? '.html' : '.md'));
  }

  function buildHtmlExport(note) {
    const wrap = document.createElement('div');
    wrap.innerHTML = Markdown.render(note.content);
    Markdown.highlight(wrap);
    const title = escapeHtml(note.title || '未命名笔记');
    const html =
      '<!DOCTYPE html>\n' +
      '<html lang="zh-CN">\n' +
      '<head>\n' +
      '<meta charset="utf-8">\n' +
      '<meta name="viewport" content="width=device-width, initial-scale=1">\n' +
      '<title>' + title + '</title>\n' +
      '<style>\n' +
      'body{margin:0;background-color:#1e1e1e;color:#d4d4d4;font-family:"Segoe UI","Microsoft YaHei",sans-serif;line-height:1.8}\n' +
      '.md-body{max-width:860px;margin:0 auto;padding:32px 24px}\n' +
      '.md-body h1,.md-body h2,.md-body h3,.md-body h4,.md-body h5,.md-body h6{color:#fff}\n' +
      '.md-body a{color:#4fc1ff}\n' +
      '.md-body code{background-color:#2d2d2d;padding:2px 5px;border-radius:3px;font-family:Consolas,monospace;font-size:0.9em}\n' +
      '.md-body pre{background-color:#1b1b1b;border:1px solid #333;border-radius:6px;padding:12px;overflow-x:auto}\n' +
      '.md-body pre code{background-color:transparent;padding:0}\n' +
      '.md-body blockquote{border-left:3px solid #555;margin:0;padding:4px 12px;color:#a0a0a0}\n' +
      '.md-body img{max-width:100%}\n' +
      '.md-body table{border-collapse:collapse}\n' +
      '.md-body th,.md-body td{border:1px solid #444;padding:6px 12px}\n' +
      '.md-body th{background-color:#2d2d2d}\n' +
      '.hljs-comment,.hljs-quote{color:#6a9955}\n' +
      '.hljs-keyword,.hljs-selector-tag,.hljs-built_in,.hljs-type{color:#569cd6}\n' +
      '.hljs-string,.hljs-regexp,.hljs-addition{color:#ce9178}\n' +
      '.hljs-number,.hljs-literal,.hljs-symbol,.hljs-bullet{color:#b5cea8}\n' +
      '.hljs-title,.hljs-title.class_,.hljs-function .hljs-title{color:#dcdcaa}\n' +
      '.hljs-attr,.hljs-variable,.hljs-template-variable{color:#9cdcfe}\n' +
      '.hljs-deletion{color:#d16969}\n' +
      '.hljs-operator,.hljs-punctuation{color:#d4d4d4}\n' +
      '</style>\n' +
      '</head>\n' +
      '<body>\n' +
      '<article class="md-body">\n' +
      wrap.innerHTML +
      '\n</article>\n' +
      '</body>\n' +
      '</html>\n';
    return new Blob([html], { type: 'text/html;charset=utf-8' });
  }

  function escapeHtml(text) {
    return String(text)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }

  function closeNoteMenu() {
    menuNoteId = null;
    if (moreMenu) {
      moreMenu.hidden = true;
      moreMenu.innerHTML = '';
    }
  }

  function currentNote() {
    if (selectedId === null) {
      return null;
    }
    return notes.find((note) => note.id === selectedId) || null;
  }

  function createNote() {
    flushSave();
    const note = Storage.createNote('未命名笔记');
    notes.unshift(note);
    notes = Storage.sortByUpdateDesc(notes);
    Storage.save(notes);
    selectedId = note.id;
    renderList();
    syncEditor();
    el.title.focus();
    el.title.select();
  }

  function selectNote(id) {
    if (!notes.some((note) => note.id === id)) {
      return;
    }
    flushSave();
    selectedId = id;
    renderList();
    syncEditor();
  }

  function deleteNote(id) {
    const note = notes.find((item) => item.id === id);
    if (!note) {
      return;
    }
    const name = note.title || '未命名笔记';
    if (!window.confirm('确定删除「' + name + '」？删除后不可恢复。')) {
      return;
    }
    notes = notes.filter((item) => item.id !== note.id);
    Storage.save(notes);
    if (notes.length) {
      const visible = Storage.search(notes, searchKeyword);
      selectedId = (visible.length ? visible[0] : notes[0]).id;
    } else {
      selectedId = null;
    }
    renderList();
    syncEditor();
  }

  function updateNote(field) {
    const note = currentNote();
    if (!note) {
      return;
    }
    if (field === 'title') {
      note.title = el.title.value;
    } else {
      note.content = el.content.value;
    }
    note.updateTime = new Date().toISOString();
    renderList();
    renderPreview();
    scheduleSave();
  }

  function onSearchInput() {
    searchKeyword = el.search.value;
    renderList();
  }

  function renderList() {
    const kw = searchKeyword.trim().toLowerCase();
    const visible = kw === '' ? Storage.sortByUpdateDesc(notes) : Storage.search(notes, searchKeyword);

    el.list.innerHTML = '';
    if (!visible.length) {
      const empty = document.createElement('li');
      empty.className = 'note-empty';
      empty.textContent = kw !== '' ? '无匹配笔记' : '暂无笔记，点击「新建笔记」开始';
      el.list.appendChild(empty);
      return;
    }

    const frag = document.createDocumentFragment();
    visible.forEach((note) => {
      const li = document.createElement('li');
      li.className = 'note-item';
      if (note.id === selectedId) {
        li.classList.add('active');
      }
      li.dataset.id = note.id;

      const title = document.createElement('span');
      title.className = 'note-item-title';
      title.textContent = note.title || '未命名笔记';

      const time = document.createElement('span');
      time.className = 'note-item-time';
      time.textContent = formatTime(note.updateTime);

      li.appendChild(title);
      li.appendChild(time);

      const actions = document.createElement('span');
      actions.className = 'note-item-actions';
      const delBtn = document.createElement('button');
      delBtn.type = 'button';
      delBtn.className = 'note-del';
      delBtn.title = '删除';
      delBtn.textContent = '🗑';
      const moreBtn = document.createElement('button');
      moreBtn.type = 'button';
      moreBtn.className = 'note-more';
      moreBtn.title = '更多';
      moreBtn.textContent = '⋯';
      actions.appendChild(delBtn);
      actions.appendChild(moreBtn);
      li.appendChild(actions);

      frag.appendChild(li);
    });
    el.list.appendChild(frag);
  }

  function syncEditor() {
    const note = currentNote();
    el.title.value = note ? note.title : '';
    el.content.value = note ? note.content : '';
    renderPreview();
  }

  function renderPreview() {
    const note = currentNote();
    el.preview.innerHTML = Markdown.render(note ? note.content : '');
    Markdown.highlight(el.preview);
  }

  function scheduleSave() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(flushSave, 500);
  }

  function flushSave() {
    clearTimeout(saveTimer);
    saveTimer = null;
    Storage.save(notes);
  }

  function formatTime(iso) {
    const date = new Date(iso);
    if (isNaN(date.getTime())) {
      return '';
    }
    const pad = (num) => String(num).padStart(2, '0');
    return (
      date.getFullYear() +
      '-' +
      pad(date.getMonth() + 1) +
      '-' +
      pad(date.getDate()) +
      ' ' +
      pad(date.getHours()) +
      ':' +
      pad(date.getMinutes())
    );
  }

  init();
  return {};
})();