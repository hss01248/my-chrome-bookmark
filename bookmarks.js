import { buildBookmarkWall, UNNAMED } from './lib/bookmark-model.js';
import { searchBookmarkWall } from './lib/search.js';
import { faviconUrlFor, PLACEHOLDER_FAVICON } from './lib/favicon.js';

const tabsEl = document.getElementById('tabs');
const mainEl = document.getElementById('main');
const searchEl = document.getElementById('search');
const chromeEl = document.querySelector('.chrome');
const groupNavEl = document.getElementById('group-nav');

/** @type {ReturnType<typeof buildBookmarkWall>} */
let wall = { tabs: [] };
let selectedTabId = null;
const extensionOrigin = chrome.runtime.getURL('/').replace(/\/$/, '');

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

  const img = document.createElement('img');
  img.src = favicon(item.url);
  img.alt = '';
  img.addEventListener('error', () => {
    img.src = PLACEHOLDER_FAVICON;
  });

  const title = document.createElement('span');
  title.className = 'item-title';
  title.textContent = item.title;

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
    hideGroupNav();
    mainEl.innerHTML = `<p class="empty">这里还没有书签</p>`;
    return;
  }
  /** @type {{ id: string, name: string, section: HTMLElement }[]} */
  const navSections = [];
  for (let i = 0; i < groups.length; i++) {
    const group = groups[i];
    const id = `group-${i}`;
    const section = document.createElement('section');
    section.className = 'group';
    section.id = id;
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
    navSections.push({ id, name: group.name, section });
  }
  renderGroupNav(navSections);
}

function renderSearchResults(query) {
  hideGroupNav();
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
    hideGroupNav();
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

searchEl.addEventListener('input', () => {
  mainEl.scrollTop = 0;
  syncChromeCompact();
  render();
});

mainEl.addEventListener('scroll', syncChromeCompact, { passive: true });

for (const ev of ['onCreated', 'onRemoved', 'onChanged', 'onMoved', 'onChildrenReordered']) {
  chrome.bookmarks[ev].addListener(() => {
    reload();
  });
}

reload();
syncChromeCompact();
