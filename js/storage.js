'use strict';

const Storage = (() => {
  const STORAGE_KEY = 'markdownEditor.notes.v1';

  function createId() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
  }

  function now() {
    return new Date().toISOString();
  }

  function createNote(title) {
    const ts = now();
    return {
      id: createId(),
      title: typeof title === 'string' ? title : '',
      content: '',
      createTime: ts,
      updateTime: ts,
    };
  }

  function isValidNote(note) {
    return (
      note !== null &&
      typeof note === 'object' &&
      typeof note.id === 'string' &&
      note.id !== '' &&
      typeof note.title === 'string' &&
      typeof note.content === 'string' &&
      typeof note.createTime === 'string' &&
      typeof note.updateTime === 'string'
    );
  }

  function load() {
    let list = [];
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw === null) {
        save(list);
        return list;
      }
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        list = parsed.filter(isValidNote);
      }
    } catch (err) {
      list = [];
    }
    if (list.length === 0) {
      save(list);
    }
    return list;
  }

  function save(list) {
    if (!Array.isArray(list)) {
      list = [];
    }
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
    } catch (err) {
      /* 存储不可用或被配额限制时静默容错，不阻断编辑 */
    }
  }

  function sortByUpdateDesc(list) {
    return [...list].sort((a, b) => {
      if (a.updateTime < b.updateTime) return 1;
      if (a.updateTime > b.updateTime) return -1;
      return 0;
    });
  }

  function search(list, keyword) {
    const kw = (keyword || '').trim().toLowerCase();
    if (kw === '') return sortByUpdateDesc(list);
    return list
      .filter((note) => {
        return (
          note.title.toLowerCase().indexOf(kw) !== -1 ||
          note.content.toLowerCase().indexOf(kw) !== -1
        );
      })
      .sort((a, b) => {
        if (a.updateTime < b.updateTime) return 1;
        if (a.updateTime > b.updateTime) return -1;
        return 0;
      });
  }

  return {
    load,
    save,
    createNote,
    isValidNote,
    sortByUpdateDesc,
    search,
  };
})();