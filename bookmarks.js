import { buildBookmarkWall, UNNAMED } from './lib/bookmark-model.js';
import { searchBookmarkWall } from './lib/search.js';
import { faviconUrlFor, PLACEHOLDER_FAVICON } from './lib/favicon.js';

const tabsEl = document.getElementById('tabs');
const mainEl = document.getElementById('main');
const searchEl = document.getElementById('search');

/** @type {ReturnType<typeof buildBookmarkWall>} */
let wall = { tabs: [] };
let selectedTabId = null;
const extensionOrigin = chrome.runtime.getURL('/').replace(/\/$/, '');

function favicon(url) {
  return faviconUrlFor(url, extensionOrigin);
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
      selectedTabId = tab.id;
      searchEl.value = '';
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

  const img = document.createElement('img');
  img.src = favicon(item.url);
  img.alt = '';
  img.addEventListener('error', () => {
    img.src = PLACEHOLDER_FAVICON;
  });

  const title = document.createElement('span');
  title.className = 'item-title';
  title.textContent = item.title;
  title.title = item.title;

  a.append(img, title);

  if (showMeta) {
    const meta = document.createElement('span');
    meta.className = 'meta';
    for (const label of [item.tabName, item.groupName].filter(Boolean)) {
      const chip = document.createElement('span');
      chip.className = 'chip';
      chip.textContent = label;
      meta.appendChild(chip);
    }
    a.appendChild(meta);
  }
  return a;
}

function renderGroups(groups, { hideSingleUnnamedTitle = false } = {}) {
  mainEl.innerHTML = '';
  if (!groups.length) {
    mainEl.innerHTML = `<p class="empty">这里还没有书签</p>`;
    return;
  }
  for (const group of groups) {
    const section = document.createElement('section');
    section.className = 'group';
    const onlyUnnamed =
      hideSingleUnnamedTitle &&
      groups.length === 1 &&
      group.name === UNNAMED;
    if (!onlyUnnamed) {
      const h = document.createElement('h2');
      h.className = 'group-title' + (group.name === UNNAMED ? ' is-unnamed' : '');
      h.textContent = group.name;
      section.appendChild(h);
    }
    const grid = document.createElement('div');
    grid.className = 'grid';
    for (const item of group.items) {
      grid.appendChild(itemLink(item));
    }
    section.appendChild(grid);
    mainEl.appendChild(section);
  }
}

function renderSearchResults(query) {
  const hits = searchBookmarkWall(wall, query);
  mainEl.innerHTML = '';
  if (!hits.length) {
    mainEl.innerHTML = `<p class="empty">无匹配书签</p>`;
    return;
  }
  const grid = document.createElement('div');
  grid.className = 'grid';
  for (const item of hits) {
    grid.appendChild(itemLink(item, { showMeta: true }));
  }
  mainEl.appendChild(grid);
}

function render() {
  renderTabs();
  const q = searchEl.value.trim();
  if (q) {
    renderSearchResults(q);
    return;
  }
  if (!wall.tabs.length) {
    mainEl.innerHTML = `<p class="empty">书签栏还没有内容</p>`;
    return;
  }
  const tab =
    wall.tabs.find((t) => t.id === selectedTabId) || wall.tabs[0];
  selectedTabId = tab.id;
  renderTabs();
  renderGroups(tab.groups, {
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

searchEl.addEventListener('input', () => render());

for (const ev of ['onCreated', 'onRemoved', 'onChanged', 'onMoved', 'onChildrenReordered']) {
  chrome.bookmarks[ev].addListener(() => {
    reload();
  });
}

reload();
