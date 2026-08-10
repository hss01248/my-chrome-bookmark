import { buildBookmarkWall, UNNAMED } from './lib/bookmark-model.js';
import { searchBookmarkWall } from './lib/search.js';
import { faviconUrlFor, PLACEHOLDER_FAVICON } from './lib/favicon.js';
import {
  snapshotFromNode,
  createArgsFromSnapshot,
} from './lib/bookmark-delete.js';
import { normalizeBookmarkUpdate } from './lib/bookmark-edit.js';

const tabsEl = document.getElementById('tabs');
const mainEl = document.getElementById('main');
const searchEl = document.getElementById('search');
const chromeEl = document.querySelector('.chrome');
const groupNavEl = document.getElementById('group-nav');

/** @type {ReturnType<typeof buildBookmarkWall>} */
let wall = { tabs: [] };
let selectedTabId = null;
const extensionOrigin = chrome.runtime.getURL('/').replace(/\/$/, '');

/** Increments to cancel in-flight progressive renders. */
let renderGeneration = 0;
const ITEM_CHUNK = 48;
const UNDO_TOAST_MS = 5000;

/** @type {{ timer: ReturnType<typeof setTimeout>, snapshot: import('./lib/bookmark-delete.js').UndoSnapshot } | null} */
let pendingUndo = null;
/** @type {HTMLElement | null} */
let toastEl = null;
/** @type {HTMLElement | null} */
let contextMenuEl = null;
/** @type {HTMLElement | null} */
let editPopoverEl = null;
/** @type {string | null} */
let editingBookmarkId = null;

function syncChromeCompact() {
  if (!chromeEl) return;
  chromeEl.classList.toggle('is-compact', mainEl.scrollTop > 8);
}

function hideGroupNav() {
  if (!groupNavEl) return;
  groupNavEl.hidden = true;
  groupNavEl.innerHTML = '';
}

function scrollMainToSection(section) {
  const mainRect = mainEl.getBoundingClientRect();
  const secRect = section.getBoundingClientRect();
  const top = mainEl.scrollTop + (secRect.top - mainRect.top) - 8;
  mainEl.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
}

function renderGroupNav(sections) {
  if (!groupNavEl) return;
  groupNavEl.innerHTML = '';
  if (sections.length <= 1) {
    groupNavEl.hidden = true;
    return;
  }
  groupNavEl.hidden = false;
  for (const { id, name, section } of sections) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'group-nav-btn';
    btn.title = name;
    btn.dataset.groupId = id;
    const label = document.createElement('span');
    label.className = 'group-nav-btn-label';
    label.textContent = name;
    btn.appendChild(label);
    btn.addEventListener('click', () => {
      for (const b of groupNavEl.querySelectorAll('.group-nav-btn')) {
        b.classList.toggle('is-active', b === btn);
      }
      scrollMainToSection(section);
    });
    groupNavEl.appendChild(btn);
  }
}

function favicon(url) {
  return faviconUrlFor(url, extensionOrigin);
}

function nextFrame() {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}

function renderTabs() {
  tabsEl.innerHTML = '';
  for (const tab of wall.tabs) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'tab';
    btn.textContent = tab.name;
    btn.setAttribute('aria-selected', String(tab.id === selectedTabId));
    btn.addEventListener('click', () => {
      if (tab.id === selectedTabId && !searchEl.value.trim()) return;
      selectedTabId = tab.id;
      searchEl.value = '';
      mainEl.scrollTop = 0;
      syncChromeCompact();
      render();
    });
    tabsEl.appendChild(btn);
  }
}

function itemLink(item, { showMeta = false } = {}) {
  const a = document.createElement('a');
  a.className = 'item';
  a.href = item.url;
  a.target = '_blank';
  a.rel = 'noopener noreferrer';
  a.title = `${item.title}\n${item.url}`;
  a.dataset.bookmarkId = item.id;
  a.dataset.parentId = item.parentId ?? '';
  a.dataset.index = String(item.index ?? 0);
  a.dataset.draggableItem = showMeta ? '0' : '1'; // search results: no drag

  const img = document.createElement('img');
  img.src = favicon(item.url);
  img.alt = '';
  img.loading = 'lazy';
  img.decoding = 'async';

  const title = document.createElement('span');
  title.className = 'item-title';
  title.textContent = item.title;

  const actions = document.createElement('div');
  actions.className = 'item-actions';

  const del = document.createElement('button');
  del.type = 'button';
  del.className = 'item-action item-delete';
  del.title = '删除书签';
  del.setAttribute('aria-label', `删除 ${item.title}`);
  del.textContent = '×';
  del.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    hideContextMenu();
    hideEditPopover();
    void removeBookmarkWithUndo(item.id);
  });

  const edit = document.createElement('button');
  edit.type = 'button';
  edit.className = 'item-action item-edit';
  edit.title = '编辑书签';
  edit.setAttribute('aria-label', `编辑 ${item.title}`);
  edit.textContent = '✎';
  edit.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    hideContextMenu();
    const rect = edit.getBoundingClientRect();
    showEditPopover(item, rect.right, rect.bottom + 4);
  });

  actions.append(del, edit);
  a.append(img, title);

  if (showMeta) {
    const meta = document.createElement('span');
    meta.className = 'meta';
    if (item.tabName) {
      const chip = document.createElement('span');
      chip.className = 'chip chip-tab';
      chip.textContent = item.tabName;
      chip.title = item.tabName;
      meta.appendChild(chip);
    }
    if (item.groupName && item.groupName !== UNNAMED) {
      const chip = document.createElement('span');
      chip.className = 'chip chip-group';
      chip.textContent = item.groupName;
      chip.title = item.groupName;
      meta.appendChild(chip);
    }
    if (meta.childElementCount) a.appendChild(meta);
  }

  a.appendChild(actions);

  a.addEventListener('contextmenu', (event) => {
    event.preventDefault();
    showContextMenu(event.clientX, event.clientY, item);
  });

  return a;
}

function ensureToastEl() {
  if (toastEl) return toastEl;
  toastEl = document.createElement('div');
  toastEl.className = 'toast';
  toastEl.hidden = true;
  toastEl.setAttribute('role', 'status');
  document.body.appendChild(toastEl);
  return toastEl;
}

function clearPendingUndo() {
  if (pendingUndo) {
    clearTimeout(pendingUndo.timer);
    pendingUndo = null;
  }
}

/**
 * @param {import('./lib/bookmark-delete.js').UndoSnapshot} snapshot
 */
function showUndoToast(snapshot) {
  clearPendingUndo();
  const el = ensureToastEl();
  el.innerHTML = '';
  el.hidden = false;

  const label = document.createElement('span');
  label.className = 'toast-label';
  const name = snapshot.title.trim() || snapshot.url;
  label.textContent = `已删除「${name}」`;

  const undoBtn = document.createElement('button');
  undoBtn.type = 'button';
  undoBtn.className = 'toast-undo';
  undoBtn.textContent = '撤销';
  undoBtn.addEventListener('click', () => {
    void undoLastRemove();
  });

  el.append(label, undoBtn);

  pendingUndo = {
    snapshot,
    timer: setTimeout(() => {
      pendingUndo = null;
      el.hidden = true;
      el.innerHTML = '';
    }, UNDO_TOAST_MS),
  };
}

async function undoLastRemove() {
  if (!pendingUndo) return;
  const { snapshot } = pendingUndo;
  clearPendingUndo();
  if (toastEl) {
    toastEl.hidden = true;
    toastEl.innerHTML = '';
  }
  try {
    await chrome.bookmarks.create(createArgsFromSnapshot(snapshot));
  } catch (err) {
    console.error('Failed to undo bookmark remove', err);
  }
}

/**
 * @param {string} id
 */
async function removeBookmarkWithUndo(id) {
  try {
    const nodes = await chrome.bookmarks.get(id);
    const snapshot = snapshotFromNode(nodes[0]);
    if (!snapshot) return;
    await chrome.bookmarks.remove(id);
    showUndoToast(snapshot);
  } catch (err) {
    console.error('Failed to remove bookmark', err);
  }
}

function ensureContextMenuEl() {
  if (contextMenuEl) return contextMenuEl;
  contextMenuEl = document.createElement('div');
  contextMenuEl.className = 'ctx-menu';
  contextMenuEl.hidden = true;
  contextMenuEl.setAttribute('role', 'menu');
  document.body.appendChild(contextMenuEl);
  return contextMenuEl;
}

function hideContextMenu() {
  if (!contextMenuEl) return;
  contextMenuEl.hidden = true;
  contextMenuEl.innerHTML = '';
}

/**
 * @param {number} x
 * @param {number} y
 * @param {{ id: string, title: string, url: string }} item
 */
function showContextMenu(x, y, item) {
  hideEditPopover();
  const menu = ensureContextMenuEl();
  menu.innerHTML = '';

  const openBtn = document.createElement('button');
  openBtn.type = 'button';
  openBtn.className = 'ctx-menu-item';
  openBtn.setAttribute('role', 'menuitem');
  openBtn.textContent = '在新标签打开';
  openBtn.addEventListener('click', () => {
    hideContextMenu();
    window.open(item.url, '_blank', 'noopener,noreferrer');
  });

  const editBtn = document.createElement('button');
  editBtn.type = 'button';
  editBtn.className = 'ctx-menu-item';
  editBtn.setAttribute('role', 'menuitem');
  editBtn.textContent = '编辑';
  editBtn.addEventListener('click', () => {
    hideContextMenu();
    showEditPopover(item, x, y);
  });

  const delBtn = document.createElement('button');
  delBtn.type = 'button';
  delBtn.className = 'ctx-menu-item is-danger';
  delBtn.setAttribute('role', 'menuitem');
  delBtn.textContent = '删除';
  delBtn.addEventListener('click', () => {
    hideContextMenu();
    void removeBookmarkWithUndo(item.id);
  });

  menu.append(openBtn, editBtn, delBtn);
  menu.hidden = false;

  // Position after paint so we can clamp to viewport.
  menu.style.left = '0px';
  menu.style.top = '0px';
  const rect = menu.getBoundingClientRect();
  const left = Math.min(x, window.innerWidth - rect.width - 8);
  const top = Math.min(y, window.innerHeight - rect.height - 8);
  menu.style.left = `${Math.max(8, left)}px`;
  menu.style.top = `${Math.max(8, top)}px`;
}

function ensureEditPopoverEl() {
  if (editPopoverEl) return editPopoverEl;
  editPopoverEl = document.createElement('div');
  editPopoverEl.className = 'edit-popover';
  editPopoverEl.hidden = true;
  editPopoverEl.setAttribute('role', 'dialog');
  editPopoverEl.setAttribute('aria-label', '编辑书签');
  document.body.appendChild(editPopoverEl);
  return editPopoverEl;
}

function hideEditPopover() {
  editingBookmarkId = null;
  if (!editPopoverEl) return;
  editPopoverEl.hidden = true;
  editPopoverEl.innerHTML = '';
}

/**
 * @param {{ id: string, title: string, url: string }} item
 * @param {number} x
 * @param {number} y
 */
function showEditPopover(item, x, y) {
  const pop = ensureEditPopoverEl();
  editingBookmarkId = item.id;
  pop.innerHTML = '';

  const form = document.createElement('form');
  form.className = 'edit-popover-form';

  const titleLabel = document.createElement('label');
  titleLabel.className = 'edit-field';
  const titleCaption = document.createElement('span');
  titleCaption.textContent = '标题';
  const titleInput = document.createElement('textarea');
  titleInput.name = 'title';
  titleInput.value = item.title;
  titleInput.rows = 2;
  titleInput.autocomplete = 'off';
  titleLabel.append(titleCaption, titleInput);

  const urlLabel = document.createElement('label');
  urlLabel.className = 'edit-field';
  const urlCaption = document.createElement('span');
  urlCaption.textContent = '网址';
  const urlInput = document.createElement('textarea');
  urlInput.name = 'url';
  urlInput.value = item.url;
  urlInput.rows = 3;
  urlInput.autocomplete = 'off';
  urlInput.required = true;
  urlLabel.append(urlCaption, urlInput);

  const errorEl = document.createElement('p');
  errorEl.className = 'edit-error';
  errorEl.hidden = true;

  const actions = document.createElement('div');
  actions.className = 'edit-actions';
  const cancelBtn = document.createElement('button');
  cancelBtn.type = 'button';
  cancelBtn.className = 'edit-btn edit-btn-cancel';
  cancelBtn.textContent = '取消';
  cancelBtn.addEventListener('click', () => hideEditPopover());
  const saveBtn = document.createElement('button');
  saveBtn.type = 'submit';
  saveBtn.className = 'edit-btn edit-btn-save';
  saveBtn.textContent = '保存';
  actions.append(cancelBtn, saveBtn);

  form.append(titleLabel, urlLabel, errorEl, actions);
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const normalized = normalizeBookmarkUpdate({
      title: titleInput.value,
      url: urlInput.value,
    });
    if (!normalized) {
      errorEl.hidden = false;
      errorEl.textContent = '网址不能为空';
      urlInput.focus();
      return;
    }
    void updateBookmark(item.id, normalized);
  });

  pop.appendChild(form);
  pop.hidden = false;

  pop.style.left = '0px';
  pop.style.top = '0px';
  const rect = pop.getBoundingClientRect();
  const left = Math.min(x, window.innerWidth - rect.width - 8);
  const top = Math.min(y, window.innerHeight - rect.height - 8);
  pop.style.left = `${Math.max(8, left)}px`;
  pop.style.top = `${Math.max(8, top)}px`;

  titleInput.focus();
  titleInput.select();
}

/**
 * @param {string} id
 * @param {{ title: string, url: string }} changes
 */
async function updateBookmark(id, changes) {
  try {
    await chrome.bookmarks.update(id, changes);
    hideEditPopover();
  } catch (err) {
    console.error('Failed to update bookmark', err);
    if (editPopoverEl && !editPopoverEl.hidden && editingBookmarkId === id) {
      const errorEl = editPopoverEl.querySelector('.edit-error');
      if (errorEl instanceof HTMLElement) {
        errorEl.hidden = false;
        errorEl.textContent = '保存失败，请检查网址是否有效';
      }
    }
  }
}

/**
 * Append items into a grid in chunks so the UI stays responsive.
 * @returns {Promise<boolean>} false if cancelled
 */
async function fillGridChunked(grid, items, generation, { showMeta = false } = {}) {
  for (let i = 0; i < items.length; i += ITEM_CHUNK) {
    if (generation !== renderGeneration) return false;
    const frag = document.createDocumentFragment();
    const end = Math.min(i + ITEM_CHUNK, items.length);
    for (let j = i; j < end; j++) {
      frag.appendChild(itemLink(items[j], { showMeta }));
    }
    grid.appendChild(frag);
    await nextFrame();
  }
  return generation === renderGeneration;
}

async function renderGroups(groups, { hideSingleUnnamedTitle = false } = {}) {
  const generation = ++renderGeneration;
  mainEl.innerHTML = '';

  if (!groups.length) {
    hideGroupNav();
    mainEl.innerHTML = `<p class="empty">这里还没有书签</p>`;
    return;
  }

  /** @type {{ id: string, name: string, section: HTMLElement }[]} */
  const navSections = [];
  /** @type {{ grid: HTMLElement, items: typeof groups[0]['items'] }[]} */
  const jobs = [];

  // Phase 1: paint group shells + side nav immediately.
  const shellFrag = document.createDocumentFragment();
  for (let i = 0; i < groups.length; i++) {
    const group = groups[i];
    const id = `group-${i}`;
    const section = document.createElement('section');
    section.className = 'group';
    section.id = id;
    section.dataset.folderId = group.folderId;

    const onlyUnnamed =
      hideSingleUnnamedTitle &&
      groups.length === 1 &&
      group.name === UNNAMED;
    if (!onlyUnnamed) {
      const h = document.createElement('h2');
      h.className =
        'group-title' + (group.name === UNNAMED ? ' is-unnamed' : '');
      h.textContent = group.name;
      section.appendChild(h);
    }

    const grid = document.createElement('div');
    grid.className = 'grid';
    grid.dataset.folderId = group.folderId;
    section.appendChild(grid);
    shellFrag.appendChild(section);

    navSections.push({ id, name: group.name, section });
    jobs.push({ grid, items: group.items });
  }
  mainEl.appendChild(shellFrag);
  renderGroupNav(navSections);
  await nextFrame();
  if (generation !== renderGeneration) return;

  // Phase 2: fill bookmark cards in chunks.
  for (const job of jobs) {
    const ok = await fillGridChunked(job.grid, job.items, generation);
    if (!ok) return;
  }
}

async function renderSearchResults(query) {
  const generation = ++renderGeneration;
  hideGroupNav();
  const hits = searchBookmarkWall(wall, query);
  mainEl.innerHTML = '';

  if (!hits.length) {
    mainEl.innerHTML = `<p class="empty">无匹配书签</p>`;
    return;
  }

  const grid = document.createElement('div');
  grid.className = 'grid';
  mainEl.appendChild(grid);
  await fillGridChunked(grid, hits, generation, { showMeta: true });
}

function setSearching(isSearching) {
  chromeEl?.classList.toggle('is-searching', isSearching);
}

function render() {
  const q = searchEl.value.trim();
  if (q) {
    setSearching(true);
    renderTabs();
    void renderSearchResults(q);
    return;
  }
  setSearching(false);
  if (!wall.tabs.length) {
    ++renderGeneration;
    hideGroupNav();
    mainEl.innerHTML = `<p class="empty">书签栏还没有内容</p>`;
    renderTabs();
    return;
  }
  const tab = wall.tabs.find((t) => t.id === selectedTabId) || wall.tabs[0];
  selectedTabId = tab.id;
  renderTabs();
  void renderGroups(tab.groups, {
    hideSingleUnnamedTitle: tab.name === UNNAMED,
  });
}

async function reload() {
  const tree = await chrome.bookmarks.getTree();
  const prev = selectedTabId;
  wall = buildBookmarkWall(tree[0]);
  if (prev && wall.tabs.some((t) => t.id === prev)) {
    selectedTabId = prev;
  } else {
    selectedTabId = wall.tabs[0]?.id ?? null;
  }
  render();
}

searchEl.addEventListener('input', () => {
  mainEl.scrollTop = 0;
  syncChromeCompact();
  render();
});

mainEl.addEventListener('scroll', syncChromeCompact, { passive: true });
mainEl.addEventListener(
  'scroll',
  () => {
    hideContextMenu();
    hideEditPopover();
  },
  { passive: true }
);

document.addEventListener('click', (event) => {
  const target = /** @type {Node} */ (event.target);
  if (contextMenuEl && !contextMenuEl.hidden && !contextMenuEl.contains(target)) {
    hideContextMenu();
  }
  if (editPopoverEl && !editPopoverEl.hidden && !editPopoverEl.contains(target)) {
    // Ignore clicks on the edit button that opened the popover in the same tick.
    if (target instanceof Element && target.closest('.item-edit')) return;
    hideEditPopover();
  }
});

document.addEventListener('keydown', (event) => {
  if (event.key !== 'Escape') return;
  hideContextMenu();
  hideEditPopover();
});

// One delegated handler instead of N image error listeners.
mainEl.addEventListener(
  'error',
  (event) => {
    const el = event.target;
    if (el instanceof HTMLImageElement && el.src !== PLACEHOLDER_FAVICON) {
      el.src = PLACEHOLDER_FAVICON;
    }
  },
  true
);

for (const ev of [
  'onCreated',
  'onRemoved',
  'onChanged',
  'onMoved',
  'onChildrenReordered',
]) {
  chrome.bookmarks[ev].addListener(() => {
    reload();
  });
}

function clearRestoredSearch() {
  if (!searchEl.value) {
    setSearching(false);
    return;
  }
  searchEl.value = '';
  setSearching(false);
}

clearRestoredSearch();
reload();
syncChromeCompact();

// Chrome may restore the search box after script start; clear again.
window.addEventListener('pageshow', () => {
  const had = Boolean(searchEl.value.trim());
  clearRestoredSearch();
  if (had) render();
});
