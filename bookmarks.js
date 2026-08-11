import { buildBookmarkWall, UNNAMED, findBookmarkBar } from './lib/bookmark-model.js';
import { searchBookmarkWall } from './lib/search.js';
import { faviconUrlFor, PLACEHOLDER_FAVICON } from './lib/favicon.js';
import {
  snapshotFromNode,
  createArgsFromSnapshot,
  removeItemFromWall,
} from './lib/bookmark-delete.js';
import { normalizeBookmarkUpdate } from './lib/bookmark-edit.js';
import {
  isNoOpVisualReorder,
  resolveDropDestination,
  isNoOpFolderReorder,
  resolveFolderReorderDestination,
} from './lib/bookmark-move.js';

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
/** Generation whose group grids have finished filling (0 = none). */
let groupsFillGeneration = 0;
/**
 * Section to scroll to after progressive fill completes.
 * @type {HTMLElement | null}
 */
let pendingNavSection = null;
const ITEM_CHUNK = 48;
const UNDO_TOAST_MS = 5000;
const LONG_PRESS_MS = 400;
const LONG_PRESS_MOVE_TOLERANCE_PX = 8;
/** Press-and-move starts drag once past this distance (before long-press fires). */
const DRAG_START_SLOP_PX = 12;
/** Press-and-move starts folder (tab/group) drag once past this distance. */
const FOLDER_DRAG_SLOP_PX = 6;
const STATUS_TOAST_MS = 2000;
const SUPPRESS_CLICK_MS = 500;

/** @type {{ timer: ReturnType<typeof setTimeout>, snapshot: import('./lib/bookmark-delete.js').UndoSnapshot } | null} */
let pendingUndo = null;
/** Removals initiated in this page — skip full reload when onRemoved fires. */
const localHandledRemovals = new Set();
/** Moves initiated in this page — skip full reload when onMoved fires. */
const localHandledMoves = new Set();
/** @type {HTMLElement | null} */
let toastEl = null;
/** @type {HTMLElement | null} */
let contextMenuEl = null;
/** @type {HTMLElement | null} */
let editPopoverEl = null;
/** @type {string | null} */
let editingBookmarkId = null;
/** @type {number} */
let suppressClickUntil = 0;
/** @type {HTMLElement | null} */
let dropIndicatorEl = null;
/**
 * @type {null | {
 *   pointerId: number,
 *   sourceEl: HTMLElement,
 *   dragged: { id: string, parentId: string, index: number },
 *   ghost: HTMLElement | null,
 *   timer: ReturnType<typeof setTimeout> | null,
 *   startX: number,
 *   startY: number,
 *   active: boolean,
 *   movedSinceActive: boolean,
 *   targetFolderId: string | null,
 *   beforeItem: { id: string, parentId: string, index: number } | null,
 *   visualItems: { id: string, parentId: string, index: number }[],
 * }}
 */
let dragSession = null;
/**
 * @type {null | {
 *   kind: 'tab' | 'group',
 *   pointerId: number,
 *   sourceEl: HTMLElement,
 *   folderId: string,
 *   parentId: string,
 *   ghost: HTMLElement | null,
 *   startX: number,
 *   startY: number,
 *   active: boolean,
 *   beforeId: string | null,
 *   folderIds: string[],
 * }}
 */
let folderDragSession = null;
/** Swallow tab clicks until this time (after an active tab folder drag). */
let suppressTabClickUntil = 0;
/** Cached bookmark bar folder id (Chrome usually `'1'`). */
let bookmarkBarId = '1';
/** @type {HTMLElement | null} */
let folderDropIndicatorEl = null;
/** Blocks new long-press while a move API call is in flight. */
let moveInFlight = false;
/**
 * How to restore main scroll after a re-render.
 * @type {null | { mode: 'preserve', top: number } | { mode: 'bookmark', id: string, top: number }}
 */
let scrollAfterRender = null;

/**
 * @param {Element | null} el
 * @returns {{ id: string, parentId: string, index: number } | null}
 */
function itemRefFromEl(el) {
  if (!(el instanceof HTMLElement)) return null;
  const id = el.dataset.bookmarkId;
  if (!id) return null;
  return {
    id,
    parentId: el.dataset.parentId || '',
    index: Number(el.dataset.index || 0),
  };
}

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
  if (!(section instanceof HTMLElement) || !mainEl.contains(section)) return;
  // Wait until chunked fill finishes — empty grids make later sections look
  // cramped and the computed scroll top lands on the wrong group.
  if (groupsFillGeneration !== renderGeneration) {
    pendingNavSection = section;
    return;
  }
  const top =
    mainEl.scrollTop +
    section.getBoundingClientRect().top -
    mainEl.getBoundingClientRect().top -
    8;
  mainEl.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
}

function flushPendingNavScroll() {
  const section = pendingNavSection;
  pendingNavSection = null;
  if (section) scrollMainToSection(section);
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

function rememberScrollPreserve() {
  if (!scrollAfterRender) {
    scrollAfterRender = { mode: 'preserve', top: mainEl.scrollTop };
  }
}

function rememberScrollToBookmark(id) {
  scrollAfterRender = {
    mode: 'bookmark',
    id,
    top: mainEl.scrollTop,
  };
}

function applyScrollAfterRender() {
  const plan = scrollAfterRender;
  scrollAfterRender = null;
  if (!plan) return;

  if (plan.mode === 'bookmark') {
    const el = mainEl.querySelector(
      `.item[data-bookmark-id="${plan.id}"]`
    );
    if (el instanceof HTMLElement) {
      el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
      syncChromeCompact();
      return;
    }
  }

  mainEl.scrollTop = plan.top;
  syncChromeCompact();
}

function renderTabs() {
  tabsEl.innerHTML = '';
  for (const tab of wall.tabs) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'tab';
    btn.textContent = tab.name;
    if (tab.id !== '__unnamed__') {
      btn.dataset.folderId = tab.id;
      btn.dataset.folderDrag = 'tab';
    }
    btn.setAttribute('aria-selected', String(tab.id === selectedTabId));
    btn.addEventListener('click', () => {
      if (Date.now() < suppressTabClickUntil) return;
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
  a.draggable = false;
  a.title = `${item.title}\n${item.url}`;
  a.dataset.bookmarkId = item.id;
  a.dataset.parentId = item.parentId ?? '';
  a.dataset.index = String(item.index ?? 0);
  a.dataset.draggableItem = showMeta ? '0' : '1'; // search results: no drag
  a.addEventListener('dragstart', (event) => {
    event.preventDefault();
  });

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
 * @param {string} message
 * @param {number} [ms]
 */
function showStatusToast(message, ms = STATUS_TOAST_MS) {
  clearPendingUndo();
  const el = ensureToastEl();
  el.innerHTML = '';
  el.hidden = false;
  const label = document.createElement('span');
  label.className = 'toast-label';
  label.textContent = message;
  el.appendChild(label);
  setTimeout(() => {
    if (toastEl === el && !pendingUndo) {
      el.hidden = true;
      el.innerHTML = '';
    }
  }, ms);
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
 * Rebuild left group nav from sections currently in the main pane.
 */
function refreshGroupNavFromDom() {
  if (!groupNavEl) return;
  const sections = [...mainEl.querySelectorAll('section.group')].map(
    (section, i) => ({
      id: section.id || `group-${i}`,
      name:
        section.querySelector('.group-title')?.textContent?.trim() || UNNAMED,
      section: /** @type {HTMLElement} */ (section),
    })
  );
  renderGroupNav(sections);
}

/**
 * Drop one bookmark from wall + DOM without rebuilding the tab.
 * @param {string} id
 */
function applyLocalBookmarkRemoval(id) {
  removeItemFromWall(wall, id);

  const el = mainEl.querySelector(`.item[data-bookmark-id="${id}"]`);
  if (el instanceof HTMLElement) {
    const section = el.closest('section.group');
    const grid = el.closest('.grid');
    el.remove();
    if (
      grid instanceof HTMLElement &&
      !grid.querySelector('.item[data-bookmark-id]')
    ) {
      section?.remove();
    }
  }

  if (!mainEl.querySelector('.item[data-bookmark-id]')) {
    const q = searchEl.value.trim();
    if (q) {
      mainEl.innerHTML = `<p class="empty">无匹配书签</p>`;
      hideGroupNav();
    } else {
      const tab = wall.tabs.find((t) => t.id === selectedTabId);
      if (!tab?.groups.length) {
        hideGroupNav();
        mainEl.innerHTML = `<p class="empty">这里还没有书签</p>`;
      } else {
        refreshGroupNavFromDom();
      }
    }
  } else if (!searchEl.value.trim()) {
    refreshGroupNavFromDom();
  }
}

/**
 * Move a bookmark card in the DOM to the drop target without wiping the tab.
 * @param {string} draggedId
 * @param {string} targetFolderId
 * @param {string | null} beforeItemId
 * @returns {boolean}
 */
function applyLocalBookmarkMoveDom(draggedId, targetFolderId, beforeItemId) {
  const el = mainEl.querySelector(`.item[data-bookmark-id="${draggedId}"]`);
  if (!(el instanceof HTMLElement)) return false;

  const targetSection = mainEl.querySelector(
    `section.group[data-folder-id="${targetFolderId}"]`
  );
  const grid = targetSection?.querySelector('.grid');
  if (!(grid instanceof HTMLElement)) return false;

  const beforeEl = beforeItemId
    ? grid.querySelector(`.item[data-bookmark-id="${beforeItemId}"]`)
    : null;
  if (beforeEl instanceof HTMLElement && beforeEl !== el) {
    grid.insertBefore(el, beforeEl);
  } else if (!beforeEl) {
    grid.appendChild(el);
  }

  for (const section of [...mainEl.querySelectorAll('section.group')]) {
    const g = section.querySelector('.grid');
    if (g && !g.querySelector('.item[data-bookmark-id]')) {
      section.remove();
    }
  }
  refreshGroupNavFromDom();
  return true;
}

/**
 * Refresh wall + item dataset parentId/index without rebuilding DOM.
 */
async function softSyncWallFromTree() {
  const tree = await chrome.bookmarks.getTree();
  wall = buildBookmarkWall(tree[0]);
  bookmarkBarId = findBookmarkBar(tree[0])?.id ?? '1';

  /** @type {Map<string, { parentId: string, index: number }>} */
  const byId = new Map();
  for (const tab of wall.tabs) {
    for (const group of tab.groups) {
      for (const item of group.items) {
        byId.set(item.id, {
          parentId: item.parentId ?? '',
          index: item.index ?? 0,
        });
      }
    }
  }
  for (const node of mainEl.querySelectorAll('.item[data-bookmark-id]')) {
    if (!(node instanceof HTMLElement)) continue;
    const meta = byId.get(node.dataset.bookmarkId || '');
    if (!meta) continue;
    node.dataset.parentId = meta.parentId;
    node.dataset.index = String(meta.index);
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
    localHandledRemovals.add(id);
    await chrome.bookmarks.remove(id);
    applyLocalBookmarkRemoval(id);
    showUndoToast(snapshot);
  } catch (err) {
    localHandledRemovals.delete(id);
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
  groupsFillGeneration = 0;
  pendingNavSection = null;
  mainEl.innerHTML = '';

  if (!groups.length) {
    hideGroupNav();
    mainEl.innerHTML = `<p class="empty">这里还没有书签</p>`;
    groupsFillGeneration = generation;
    applyScrollAfterRender();
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
      if (group.name !== UNNAMED && group.folderId) {
        h.dataset.folderId = group.folderId;
        h.dataset.folderDrag = 'group';
      }
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
  if (generation !== renderGeneration) return;
  groupsFillGeneration = generation;
  applyScrollAfterRender();
  flushPendingNavScroll();
}

async function renderSearchResults(query) {
  const generation = ++renderGeneration;
  hideGroupNav();
  const hits = searchBookmarkWall(wall, query);
  mainEl.innerHTML = '';

  if (!hits.length) {
    mainEl.innerHTML = `<p class="empty">无匹配书签</p>`;
    applyScrollAfterRender();
    return;
  }

  const grid = document.createElement('div');
  grid.className = 'grid';
  mainEl.appendChild(grid);
  const ok = await fillGridChunked(grid, hits, generation, { showMeta: true });
  if (!ok) return;
  applyScrollAfterRender();
}

function setSearching(isSearching) {
  chromeEl?.classList.toggle('is-searching', isSearching);
}

function render() {
  cleanupDragSession();
  cleanupFolderDragSession({ clearTabClickSuppress: true });
  rememberScrollPreserve();
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
    applyScrollAfterRender();
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
  bookmarkBarId = findBookmarkBar(tree[0])?.id ?? '1';
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

function ensureDropIndicator() {
  if (dropIndicatorEl) return dropIndicatorEl;
  dropIndicatorEl = document.createElement('div');
  dropIndicatorEl.className = 'drop-indicator';
  return dropIndicatorEl;
}

function clearDropTargetUi() {
  for (const el of mainEl.querySelectorAll('.group.is-drop-target')) {
    el.classList.remove('is-drop-target');
  }
  dropIndicatorEl?.remove();
}

function positionGhost(x, y) {
  const ghost = dragSession?.ghost;
  if (!ghost) return;
  ghost.style.left = `${x}px`;
  ghost.style.top = `${y}px`;
}

/**
 * Whether pointer has visually passed this item in grid reading order.
 * @param {number} x
 * @param {number} y
 * @param {HTMLElement} el
 */
function isPointerAfterItem(x, y, el) {
  const box = el.getBoundingClientRect();
  if (y < box.top) return false;
  if (y > box.bottom) return true;
  return x >= box.left + box.width / 2;
}

/**
 * @param {HTMLElement} grid
 * @param {number} clientX
 * @param {number} clientY
 * @param {string} excludeId
 * @returns {HTMLElement | null}
 */
function findInsertBeforeEl(grid, clientX, clientY, excludeId) {
  const items = [...grid.querySelectorAll('.item[data-bookmark-id]')].filter(
    (el) => el instanceof HTMLElement && el.dataset.bookmarkId !== excludeId
  );
  for (const el of items) {
    if (!isPointerAfterItem(clientX, clientY, el)) return el;
  }
  return null;
}

function updateDropTarget(clientX, clientY) {
  if (!dragSession?.active) return;

  let hit = document.elementFromPoint(clientX, clientY);
  if (hit === dragSession.ghost || dragSession.ghost?.contains(hit)) {
    const ghost = dragSession.ghost;
    const prev = ghost.style.display;
    ghost.style.display = 'none';
    hit = document.elementFromPoint(clientX, clientY);
    ghost.style.display = prev;
  }

  clearDropTargetUi();
  dragSession.targetFolderId = null;
  dragSession.beforeItem = null;
  dragSession.visualItems = [];

  const group =
    hit instanceof Element
      ? hit.closest('.group[data-folder-id]')
      : null;
  if (!(group instanceof HTMLElement) || !mainEl.contains(group)) return;

  const folderId = group.dataset.folderId;
  if (!folderId) return;

  const grid = group.querySelector('.grid');
  if (!(grid instanceof HTMLElement)) return;

  group.classList.add('is-drop-target');
  const beforeEl = findInsertBeforeEl(
    grid,
    clientX,
    clientY,
    dragSession.dragged.id
  );
  const indicator = ensureDropIndicator();
  if (beforeEl) {
    grid.insertBefore(indicator, beforeEl);
  } else {
    grid.appendChild(indicator);
  }

  dragSession.targetFolderId = folderId;
  dragSession.beforeItem = beforeEl ? itemRefFromEl(beforeEl) : null;
  dragSession.visualItems = [...grid.querySelectorAll('.item[data-bookmark-id]')]
    .map((el) => itemRefFromEl(el))
    .filter(Boolean);
}

function activateDragSession() {
  if (!dragSession || dragSession.active) return;
  dragSession.active = true;
  dragSession.movedSinceActive = false;
  dragSession.timer = null;
  suppressClickUntil = Date.now() + SUPPRESS_CLICK_MS;

  const { sourceEl, pointerId, startX, startY } = dragSession;
  sourceEl.classList.remove('is-drag-pending');
  sourceEl.classList.add('is-dragging');
  hideContextMenu();
  hideEditPopover();

  const ghost = /** @type {HTMLElement} */ (sourceEl.cloneNode(true));
  ghost.classList.add('drag-ghost');
  ghost.classList.remove('is-dragging', 'is-drag-pending');
  ghost.removeAttribute('href');
  ghost.setAttribute('aria-hidden', 'true');
  document.body.appendChild(ghost);
  dragSession.ghost = ghost;
  document.body.classList.add('is-bookmark-dragging');
  positionGhost(startX, startY);

  try {
    sourceEl.setPointerCapture(pointerId);
  } catch {
    /* ignore */
  }
}

function cleanupDragSession() {
  if (!dragSession) return;
  const session = dragSession;
  dragSession = null;
  if (session.timer) {
    clearTimeout(session.timer);
    session.timer = null;
  }
  session.sourceEl.classList.remove('is-dragging', 'is-drag-pending');
  session.ghost?.remove();
  document.body.classList.remove('is-bookmark-dragging');
  clearDropTargetUi();
  try {
    if (session.sourceEl.hasPointerCapture(session.pointerId)) {
      session.sourceEl.releasePointerCapture(session.pointerId);
    }
  } catch {
    /* ignore */
  }
}

/**
 * @param {{ id: string, parentId: string, index: number }} dragged
 * @param {string} targetFolderId
 * @param {{ id: string, parentId: string, index: number } | null} beforeItem
 * @param {{ id: string, parentId: string, index: number }[]} visualItems
 */
async function commitBookmarkMove(dragged, targetFolderId, beforeItem, visualItems) {
  if (
    isNoOpVisualReorder({
      draggedId: dragged.id,
      beforeItemId: beforeItem ? beforeItem.id : null,
      visualItems,
    })
  ) {
    return;
  }
  const children = await chrome.bookmarks.getChildren(targetFolderId);
  const destination = resolveDropDestination({
    dragged,
    targetFolderId,
    beforeItem,
    childIds: children.map((c) => c.id),
    visualItems,
  });
  if (
    destination.parentId === dragged.parentId &&
    destination.index === dragged.index
  ) {
    return;
  }
  localHandledMoves.add(dragged.id);
  try {
    await chrome.bookmarks.move(dragged.id, destination);
    const ok = applyLocalBookmarkMoveDom(
      dragged.id,
      targetFolderId,
      beforeItem ? beforeItem.id : null
    );
    if (!ok) {
      localHandledMoves.delete(dragged.id);
      await reload();
      return;
    }
    void softSyncWallFromTree().catch((err) => {
      console.error('Failed to soft-sync wall after move', err);
    });
  } catch (err) {
    localHandledMoves.delete(dragged.id);
    throw err;
  }
}

/**
 * @param {PointerEvent} event
 */
function onDragPointerDown(event) {
  if (event.button !== 0) return;
  if (moveInFlight || dragSession || folderDragSession) return;
  const target = event.target;
  if (!(target instanceof Element)) return;
  if (target.closest('.item-action')) return;

  const item = target.closest('.item[data-draggable-item="1"]');
  if (!(item instanceof HTMLElement) || !mainEl.contains(item)) return;

  const dragged = itemRefFromEl(item);
  if (!dragged) return;

  dragSession = {
    pointerId: event.pointerId,
    sourceEl: item,
    dragged,
    ghost: null,
    timer: null,
    startX: event.clientX,
    startY: event.clientY,
    active: false,
    movedSinceActive: false,
    targetFolderId: null,
    beforeItem: null,
    visualItems: [],
  };
  item.classList.add('is-drag-pending');
  dragSession.timer = setTimeout(() => {
    activateDragSession();
  }, LONG_PRESS_MS);
}

/**
 * @param {PointerEvent} event
 */
function onDragPointerMove(event) {
  if (!dragSession || event.pointerId !== dragSession.pointerId) return;

  if (!dragSession.active) {
    const dx = event.clientX - dragSession.startX;
    const dy = event.clientY - dragSession.startY;
    // Press-and-move before long-press finishes: start drag instead of cancel.
    if (Math.hypot(dx, dy) > DRAG_START_SLOP_PX) {
      if (dragSession.timer) {
        clearTimeout(dragSession.timer);
        dragSession.timer = null;
      }
      activateDragSession();
      if (!dragSession?.active) return;
      dragSession.movedSinceActive = true;
      positionGhost(event.clientX, event.clientY);
      updateDropTarget(event.clientX, event.clientY);
    }
    return;
  }

  positionGhost(event.clientX, event.clientY);

  if (!dragSession.movedSinceActive) {
    const dx = event.clientX - dragSession.startX;
    const dy = event.clientY - dragSession.startY;
    if (Math.hypot(dx, dy) <= LONG_PRESS_MOVE_TOLERANCE_PX) return;
    dragSession.movedSinceActive = true;
  }

  updateDropTarget(event.clientX, event.clientY);
}

/**
 * @param {PointerEvent} event
 */
async function onDragPointerUp(event) {
  if (!dragSession || event.pointerId !== dragSession.pointerId) return;

  if (!dragSession.active) {
    cleanupDragSession();
    return;
  }

  suppressClickUntil = Date.now() + SUPPRESS_CLICK_MS;
  // Final hit-test at release point (last move may be stale).
  if (dragSession.movedSinceActive) {
    updateDropTarget(event.clientX, event.clientY);
  }
  const { dragged, targetFolderId, beforeItem, visualItems, movedSinceActive } =
    dragSession;
  cleanupDragSession();

  if (!movedSinceActive || !targetFolderId) return;

  moveInFlight = true;
  try {
    await commitBookmarkMove(dragged, targetFolderId, beforeItem, visualItems);
  } catch (err) {
    console.error('Failed to move bookmark', err);
    showStatusToast('移动失败');
  } finally {
    moveInFlight = false;
  }
}

/**
 * @param {PointerEvent} event
 */
function onDragPointerCancel(event) {
  if (!dragSession || event.pointerId !== dragSession.pointerId) return;
  cleanupDragSession();
}

/**
 * @param {PointerEvent} event
 */
function onDragLostPointerCapture(event) {
  if (!dragSession || event.pointerId !== dragSession.pointerId) return;
  if (!dragSession.active) return;
  cleanupDragSession();
}

mainEl.addEventListener('pointerdown', onDragPointerDown);
mainEl.addEventListener('pointermove', onDragPointerMove);
mainEl.addEventListener('pointerup', onDragPointerUp);
mainEl.addEventListener('pointercancel', onDragPointerCancel);
mainEl.addEventListener('lostpointercapture', onDragLostPointerCapture);

// --- Folder (tab / group) press-drag ---

/**
 * When appending among real folders, insert before the first trailing
 * non-folder child (keeps loose links / 未命名 semantics at the end).
 * @param {string[]} childIds
 * @param {string[]} folderIds
 * @returns {string | null}
 */
function beforeIdForFolderEnd(childIds, folderIds) {
  const positions = folderIds
    .map((id) => childIds.indexOf(id))
    .filter((i) => i >= 0);
  const lastFolderPos = positions.length ? Math.max(...positions) : -1;
  for (let i = lastFolderPos + 1; i < childIds.length; i++) {
    if (!folderIds.includes(childIds[i])) return childIds[i];
  }
  return null;
}

function clearFolderDropIndicator() {
  folderDropIndicatorEl?.remove();
  folderDropIndicatorEl = null;
}

/**
 * @param {'tab' | 'group'} kind
 */
function ensureFolderDropIndicator(kind) {
  const className =
    kind === 'tab' ? 'tab-drop-indicator' : 'group-drop-indicator';
  if (
    folderDropIndicatorEl &&
    folderDropIndicatorEl.className === className
  ) {
    return folderDropIndicatorEl;
  }
  folderDropIndicatorEl?.remove();
  folderDropIndicatorEl = document.createElement('div');
  folderDropIndicatorEl.className = className;
  return folderDropIndicatorEl;
}

function positionFolderGhost(x, y) {
  const ghost = folderDragSession?.ghost;
  if (!ghost) return;
  ghost.style.left = `${x}px`;
  ghost.style.top = `${y}px`;
}

/**
 * @param {{ clearTabClickSuppress?: boolean }} [opts]
 */
function cleanupFolderDragSession(opts = {}) {
  const { clearTabClickSuppress = false } = opts;
  if (!folderDragSession) {
    if (clearTabClickSuppress) suppressTabClickUntil = 0;
    return;
  }
  const session = folderDragSession;
  folderDragSession = null;
  session.sourceEl.classList.remove('is-folder-dragging');
  session.ghost?.remove();
  document.body.classList.remove('is-folder-dragging');
  clearFolderDropIndicator();
  try {
    if (session.sourceEl.hasPointerCapture(session.pointerId)) {
      session.sourceEl.releasePointerCapture(session.pointerId);
    }
  } catch {
    /* ignore */
  }
  if (clearTabClickSuppress) suppressTabClickUntil = 0;
}

function activateFolderDragSession() {
  if (!folderDragSession || folderDragSession.active) return;
  folderDragSession.active = true;

  const { sourceEl, pointerId, startX, startY, kind } = folderDragSession;
  if (kind === 'tab') {
    suppressTabClickUntil = Date.now() + SUPPRESS_CLICK_MS;
  }

  sourceEl.classList.add('is-folder-dragging');
  hideContextMenu();
  hideEditPopover();

  const ghost = /** @type {HTMLElement} */ (sourceEl.cloneNode(true));
  ghost.classList.add('folder-drag-ghost');
  ghost.classList.remove('is-folder-dragging');
  ghost.setAttribute('aria-hidden', 'true');
  if (ghost instanceof HTMLButtonElement) ghost.type = 'button';
  document.body.appendChild(ghost);
  folderDragSession.ghost = ghost;
  document.body.classList.add('is-folder-dragging');
  positionFolderGhost(startX, startY);

  try {
    sourceEl.setPointerCapture(pointerId);
  } catch {
    /* ignore */
  }
}

function updateFolderDropTarget(clientX, clientY) {
  if (!folderDragSession?.active) return;

  const { kind, folderId } = folderDragSession;
  clearFolderDropIndicator();
  folderDragSession.beforeId = null;

  if (kind === 'tab') {
    const tabEls = [
      ...tabsEl.querySelectorAll('.tab[data-folder-drag="tab"]'),
    ].filter((el) => el instanceof HTMLElement);
    folderDragSession.folderIds = tabEls
      .map((el) => el.dataset.folderId)
      .filter(Boolean);
    const candidates = tabEls.filter((el) => el.dataset.folderId !== folderId);
    let beforeEl = null;
    for (const el of candidates) {
      const box = el.getBoundingClientRect();
      if (clientX < box.left + box.width / 2) {
        beforeEl = el;
        break;
      }
    }
    const indicator = ensureFolderDropIndicator('tab');
    if (beforeEl) {
      tabsEl.insertBefore(indicator, beforeEl);
      folderDragSession.beforeId = beforeEl.dataset.folderId ?? null;
    } else {
      const unnamed = [...tabsEl.children].find(
        (el) =>
          el instanceof HTMLElement &&
          el.classList.contains('tab') &&
          !el.dataset.folderDrag
      );
      if (unnamed) {
        tabsEl.insertBefore(indicator, unnamed);
      } else {
        tabsEl.appendChild(indicator);
      }
      folderDragSession.beforeId = null;
    }
    return;
  }

  const titleEls = [
    ...mainEl.querySelectorAll('.group-title[data-folder-drag="group"]'),
  ].filter((el) => el instanceof HTMLElement);
  const sections = titleEls
    .map((title) => title.closest('.group'))
    .filter((el) => el instanceof HTMLElement);
  folderDragSession.folderIds = titleEls
    .map((el) => el.dataset.folderId)
    .filter(Boolean);
  const candidates = sections.filter((el) => el.dataset.folderId !== folderId);
  let beforeSection = null;
  for (const el of candidates) {
    const box = el.getBoundingClientRect();
    if (clientY < box.top + box.height / 2) {
      beforeSection = el;
      break;
    }
  }
  const indicator = ensureFolderDropIndicator('group');
  if (beforeSection) {
    mainEl.insertBefore(indicator, beforeSection);
    folderDragSession.beforeId = beforeSection.dataset.folderId ?? null;
  } else {
    const unnamedSection = [...mainEl.querySelectorAll('.group')].find(
      (el) =>
        el instanceof HTMLElement &&
        !el.querySelector('.group-title[data-folder-drag="group"]')
    );
    if (unnamedSection) {
      mainEl.insertBefore(indicator, unnamedSection);
    } else {
      mainEl.appendChild(indicator);
    }
    folderDragSession.beforeId = null;
  }
}

/**
 * Reorder a Tab button or Group section in the DOM without rebuilding the page.
 * @param {'tab' | 'group'} kind
 * @param {string} folderId
 * @param {string | null} beforeId
 * @returns {boolean}
 */
function applyLocalFolderMoveDom(kind, folderId, beforeId) {
  if (kind === 'tab') {
    const el = tabsEl.querySelector(`.tab[data-folder-id="${folderId}"]`);
    if (!(el instanceof HTMLElement)) return false;
    const beforeEl = beforeId
      ? tabsEl.querySelector(`.tab[data-folder-id="${beforeId}"]`)
      : null;
    const unnamed = [...tabsEl.children].find(
      (node) =>
        node instanceof HTMLElement &&
        node.classList.contains('tab') &&
        !node.dataset.folderDrag
    );
    if (beforeEl instanceof HTMLElement) {
      tabsEl.insertBefore(el, beforeEl);
    } else if (unnamed instanceof HTMLElement) {
      tabsEl.insertBefore(el, unnamed);
    } else {
      tabsEl.appendChild(el);
    }
    return true;
  }

  const title = mainEl.querySelector(
    `.group-title[data-folder-drag="group"][data-folder-id="${folderId}"]`
  );
  const section = title?.closest('section.group');
  if (!(section instanceof HTMLElement)) return false;

  const beforeTitle = beforeId
    ? mainEl.querySelector(
        `.group-title[data-folder-drag="group"][data-folder-id="${beforeId}"]`
      )
    : null;
  const beforeSection = beforeTitle?.closest('section.group');
  const unnamedSection = [...mainEl.querySelectorAll('section.group')].find(
    (node) =>
      node instanceof HTMLElement &&
      !node.querySelector('.group-title[data-folder-drag="group"]')
  );

  if (beforeSection instanceof HTMLElement) {
    mainEl.insertBefore(section, beforeSection);
  } else if (unnamedSection instanceof HTMLElement) {
    mainEl.insertBefore(section, unnamedSection);
  } else {
    mainEl.appendChild(section);
  }
  refreshGroupNavFromDom();
  return true;
}

/**
 * @param {string} folderId
 * @param {string} parentId
 * @param {string | null} beforeId
 * @param {string[]} folderIds
 * @param {'tab' | 'group'} kind
 */
async function commitFolderMove(folderId, parentId, beforeId, folderIds, kind) {
  if (isNoOpFolderReorder({ draggedId: folderId, beforeId, folderIds })) {
    return;
  }
  const children = await chrome.bookmarks.getChildren(parentId);
  const childIds = children.map((c) => c.id);
  let moveBeforeId = beforeId;
  if (moveBeforeId == null) {
    moveBeforeId = beforeIdForFolderEnd(childIds, folderIds);
  }
  const destination = resolveFolderReorderDestination({
    parentId,
    draggedId: folderId,
    beforeId: moveBeforeId,
    childIds,
  });
  localHandledMoves.add(folderId);
  try {
    await chrome.bookmarks.move(folderId, destination);
    const ok = applyLocalFolderMoveDom(kind, folderId, beforeId);
    if (!ok) {
      localHandledMoves.delete(folderId);
      await reload();
      return;
    }
    void softSyncWallFromTree().catch((err) => {
      console.error('Failed to soft-sync wall after folder move', err);
    });
  } catch (err) {
    localHandledMoves.delete(folderId);
    throw err;
  }
}

/**
 * @param {PointerEvent} event
 */
function onFolderDragPointerDown(event) {
  if (event.button !== 0) return;
  if (moveInFlight || dragSession || folderDragSession) return;
  const target = event.target;
  if (!(target instanceof Element)) return;

  const handle = target.closest('[data-folder-drag]');
  if (!(handle instanceof HTMLElement)) return;
  if (!tabsEl.contains(handle) && !mainEl.contains(handle)) return;

  const kind = handle.dataset.folderDrag;
  const folderId = handle.dataset.folderId;
  if ((kind !== 'tab' && kind !== 'group') || !folderId) return;

  let parentId;
  if (kind === 'tab') {
    parentId = bookmarkBarId;
  } else {
    if (!selectedTabId || selectedTabId === '__unnamed__') return;
    parentId = selectedTabId;
  }

  folderDragSession = {
    kind,
    pointerId: event.pointerId,
    sourceEl: handle,
    folderId,
    parentId,
    ghost: null,
    startX: event.clientX,
    startY: event.clientY,
    active: false,
    beforeId: null,
    folderIds: [],
  };
}

/**
 * @param {PointerEvent} event
 */
function onFolderDragPointerMove(event) {
  if (!folderDragSession || event.pointerId !== folderDragSession.pointerId) {
    return;
  }

  if (!folderDragSession.active) {
    const dx = event.clientX - folderDragSession.startX;
    const dy = event.clientY - folderDragSession.startY;
    if (Math.hypot(dx, dy) <= FOLDER_DRAG_SLOP_PX) return;
    activateFolderDragSession();
    if (!folderDragSession?.active) return;
  }

  positionFolderGhost(event.clientX, event.clientY);
  updateFolderDropTarget(event.clientX, event.clientY);
}

/**
 * @param {PointerEvent} event
 */
async function onFolderDragPointerUp(event) {
  if (!folderDragSession || event.pointerId !== folderDragSession.pointerId) {
    return;
  }

  if (!folderDragSession.active) {
    cleanupFolderDragSession({ clearTabClickSuppress: true });
    return;
  }

  updateFolderDropTarget(event.clientX, event.clientY);
  const { folderId, parentId, beforeId, folderIds, kind } = folderDragSession;
  cleanupFolderDragSession();

  moveInFlight = true;
  try {
    await commitFolderMove(folderId, parentId, beforeId, folderIds, kind);
  } catch (err) {
    console.error('Failed to move folder', err);
    showStatusToast('移动失败');
  } finally {
    moveInFlight = false;
  }
}

/**
 * @param {PointerEvent} event
 */
function onFolderDragPointerCancel(event) {
  if (!folderDragSession || event.pointerId !== folderDragSession.pointerId) {
    return;
  }
  cleanupFolderDragSession({ clearTabClickSuppress: true });
}

/**
 * @param {PointerEvent} event
 */
function onFolderDragLostPointerCapture(event) {
  if (!folderDragSession || event.pointerId !== folderDragSession.pointerId) {
    return;
  }
  if (!folderDragSession.active) return;
  cleanupFolderDragSession({ clearTabClickSuppress: true });
}

document.addEventListener('pointerdown', onFolderDragPointerDown);
document.addEventListener('pointermove', onFolderDragPointerMove);
document.addEventListener('pointerup', onFolderDragPointerUp);
document.addEventListener('pointercancel', onFolderDragPointerCancel);
document.addEventListener('lostpointercapture', onFolderDragLostPointerCapture);

mainEl.addEventListener(
  'click',
  (event) => {
    if (Date.now() >= suppressClickUntil) return;
    event.preventDefault();
    event.stopPropagation();
  },
  true
);

mainEl.addEventListener(
  'contextmenu',
  (event) => {
    if (!dragSession) return;
    event.preventDefault();
    event.stopPropagation();
    hideContextMenu();
  },
  true
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
  if (dragSession) {
    cleanupDragSession();
  }
  if (folderDragSession) {
    cleanupFolderDragSession({ clearTabClickSuppress: true });
  }
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
  chrome.bookmarks[ev].addListener((id) => {
    if (ev === 'onRemoved' && localHandledRemovals.has(id)) {
      localHandledRemovals.delete(id);
      return;
    }
    if (ev === 'onMoved' && localHandledMoves.has(id)) {
      localHandledMoves.delete(id);
      return;
    }
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
