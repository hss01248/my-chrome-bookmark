# Bookmark Folder (Group/Tab) Drag Sort Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Press-and-drag to reorder real Tab folders and Group folders (sibling-only); keep virtual「未命名」fixed at the end.

**Architecture:** Add `resolveFolderReorderDestination` in `lib/bookmark-move.js`. Wire two folder drag modes in `bookmarks.js` (Tab strip + Group titles) with shared pointer-session patterns from item drag, muted against item `dragSession`. Drop indicators: vertical between tabs, horizontal between groups.

**Tech Stack:** Same as Phase 1 — vanilla ES modules, `chrome.bookmarks.move`, `node:test`.

**Spec:** [docs/superpowers/specs/2026-08-10-bookmark-folder-drag-design.md](../specs/2026-08-10-bookmark-folder-drag-design.md)

---

## File map

| File | Role |
| --- | --- |
| Modify: `lib/bookmark-move.js` | `resolveFolderReorderDestination`, `isNoOpFolderReorder` |
| Modify: `tests/bookmark-move.test.js` | Folder reorder cases |
| Modify: `bookmarks.js` | Tab/Group press-drag, datasets, commit folder move |
| Modify: `bookmarks.css` | Tab insert line, folder ghost/dragging |
| Modify: `README.md` | Mention Group/Tab drag |

---

### Task 1: Folder reorder pure helpers

**Files:**
- Modify: `lib/bookmark-move.js`
- Modify: `tests/bookmark-move.test.js`

- [ ] **Step 1: Write failing tests**

```js
describe('resolveFolderReorderDestination', () => {
  it('inserts before a sibling folder id', () => {
    assert.deepEqual(
      resolveFolderReorderDestination({
        parentId: 'bar',
        draggedId: 't1',
        beforeId: 't3',
        childIds: ['t1', 't2', 't3', 'link'],
      }),
      { parentId: 'bar', index: 2 }
    );
  });

  it('appends when beforeId is null', () => {
    assert.deepEqual(
      resolveFolderReorderDestination({
        parentId: 'bar',
        draggedId: 't1',
        beforeId: null,
        childIds: ['t1', 't2', 't3'],
      }),
      { parentId: 'bar', index: 3 }
    );
  });

  it('appends when beforeId missing from childIds', () => {
    assert.deepEqual(
      resolveFolderReorderDestination({
        parentId: 'tab',
        draggedId: 'g1',
        beforeId: 'ghost',
        childIds: ['g1', 'g2'],
      }),
      { parentId: 'tab', index: 2 }
    );
  });
});

describe('isNoOpFolderReorder', () => {
  it('is true when beforeId is the next folder after dragged among folderIds', () => {
    assert.equal(
      isNoOpFolderReorder({
        draggedId: 'g1',
        beforeId: 'g2',
        folderIds: ['g1', 'g2', 'g3'],
      }),
      true
    );
  });

  it('is true when beforeId null and dragged is last folder', () => {
    assert.equal(
      isNoOpFolderReorder({
        draggedId: 'g3',
        beforeId: null,
        folderIds: ['g1', 'g2', 'g3'],
      }),
      true
    );
  });

  it('is false when moving earlier', () => {
    assert.equal(
      isNoOpFolderReorder({
        draggedId: 'g2',
        beforeId: 'g1',
        folderIds: ['g1', 'g2', 'g3'],
      }),
      false
    );
  });
});
```

- [ ] **Step 2: Run tests — expect FAIL**

Run: `node --test tests/bookmark-move.test.js`

- [ ] **Step 3: Implement**

```js
/**
 * Sibling folder reorder for chrome.bookmarks.move.
 * `index` is insert index in the live childIds list (dragged still present);
 * Chromium adjusts same-parent downward moves.
 *
 * @param {{ parentId: string, draggedId: string, beforeId: string | null, childIds: string[] }} args
 */
export function resolveFolderReorderDestination({
  parentId,
  draggedId,
  beforeId,
  childIds,
}) {
  void draggedId;
  const index =
    beforeId && childIds.includes(beforeId)
      ? childIds.indexOf(beforeId)
      : childIds.length;
  return { parentId, index };
}

/**
 * Visual no-op among ordered folder ids only (exclude virtual/unnamed).
 * @param {{ draggedId: string, beforeId: string | null, folderIds: string[] }} args
 */
export function isNoOpFolderReorder({ draggedId, beforeId, folderIds }) {
  const from = folderIds.indexOf(draggedId);
  if (from < 0) return false;
  const without = folderIds.filter((id) => id !== draggedId);
  let to = beforeId == null ? without.length : without.indexOf(beforeId);
  if (to < 0) to = without.length;
  return to === from;
}
```

- [ ] **Step 4: Tests PASS**

- [ ] **Step 5: Commit**

```bash
git add lib/bookmark-move.js tests/bookmark-move.test.js
git commit -m "feat: add folder sibling reorder helpers"
```

---

### Task 2: DOM hooks for Tab / Group

**Files:**
- Modify: `bookmarks.js` (`renderTabs`, group title creation)

- [ ] **Step 1: Tab buttons**

For real tabs only (`tab.id !== '__unnamed__'`):

```js
btn.dataset.folderId = tab.id;
btn.dataset.folderDrag = 'tab';
```

Virtual unnamed: omit `folderDrag` (or set `'0'`).

- [ ] **Step 2: Group titles**

When creating `h.group-title` for a real group (`group.folderId` exists and `group.name !== UNNAMED`):

```js
h.dataset.folderId = group.folderId;
h.dataset.folderDrag = 'group';
```

Unnamed group title (if shown): no `folderDrag`.

Also set `section.dataset.folderId` already present — keep it.

- [ ] **Step 3: Commit**

```bash
git add bookmarks.js
git commit -m "feat: mark draggable tab and group folder titles"
```

---

### Task 3: CSS for folder drag

**Files:**
- Modify: `bookmarks.css`

- [ ] **Step 1: Add styles**

```css
.tab.is-folder-dragging,
.group-title.is-folder-dragging {
  opacity: 0.35;
}

.folder-drag-ghost {
  position: fixed;
  z-index: 2000;
  pointer-events: none;
  opacity: 0.95;
  box-shadow: 0 12px 28px rgba(0, 0, 0, 0.18);
  transform: translate(-8px, -8px);
}

.tab-drop-indicator {
  width: 3px;
  align-self: stretch;
  border-radius: 2px;
  background: var(--accent);
  flex: 0 0 3px;
}

.group-drop-indicator {
  height: 3px;
  margin: 4px 0 12px;
  border-radius: 2px;
  background: var(--accent);
}

body.is-folder-dragging {
  cursor: grabbing;
  user-select: none;
}
```

Ensure `.tabs` remains `display: flex` so vertical indicator works.

- [ ] **Step 2: Commit**

```bash
git add bookmarks.css
git commit -m "style: add tab/group folder drag visuals"
```

---

### Task 4: Folder drag controller + `move`

**Files:**
- Modify: `bookmarks.js`

Constants:

```js
const FOLDER_DRAG_SLOP_PX = 6;
```

Need bookmark bar id at runtime: from last tree or `findBookmarkBar` — export already exists in model; on `reload` cache `bookmarkBarId = findBookmarkBar(tree[0])?.id ?? '1'`.

- [ ] **Step 1: Session state**

Separate from item `dragSession`:

```js
/** @type {null | {
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
 * }} */
let folderDragSession = null;
```

Mutual exclusion: `onDragPointerDown` (items) returns if `folderDragSession`; folder pointerdown returns if `dragSession` / `moveInFlight`.

- [ ] **Step 2: Hit-test / indicators**

**Tab:** among `.tabs .tab[data-folder-drag="tab"]`, find insert-before by midpoint X; place `.tab-drop-indicator` as sibling before that tab (or at end before unnamed if present). `folderIds` = ordered real tab folder ids. `beforeId` = next real tab’s folderId or `null` (append among real folders — when building `childIds` from `getChildren(bar)`, append index = index of first non-folder-after-last-real-folder or simply before first bookmark/unnamed visual; simplest: `beforeId = null` means `childIds.length` only if bar has no trailing links; better: compute `beforeId` as the child id that should stay after the dragged folder among **all** bar children — for UI “end of real tabs”, set `beforeId` to the id of the first bar child that is NOT in the real-tab folder set after the drop point, or `null` → length.

Practical approach for Tab strip:

- `folderIds` = `wall.tabs.filter(t => t.id !== '__unnamed__').map(t => t.id)`
- Visual before next real tab → `beforeId = that tab id`
- If dropping after last real tab → `beforeId = null` and when resolving, pass `childIds` from API; set destination index to `max(indices of real tab folders)+1` after removal semantics… Spec: 未命名置底. Real tabs only reorder among themselves. So:

```js
resolveFolderReorderDestination({ parentId: barId, draggedId, beforeId, childIds })
```

where `beforeId` is next **folder** sibling in Chrome children among the set of tab folder ids; if inserting at end of real tabs, `beforeId` = first child id in `childIds` that is not in `folderIds` and appears after all tab folders (e.g. a loose link), else `null` (true append).

Helper in page or lib:

```js
function beforeIdForFolderAppend(childIds, folderIds) {
  const lastFolderPos = Math.max(
    ...folderIds.map((id) => childIds.indexOf(id)).filter((i) => i >= 0),
    -1
  );
  for (let i = lastFolderPos + 1; i < childIds.length; i++) {
    if (!folderIds.includes(childIds[i]) && childIds[i] !== draggedId) {
      return childIds[i]; // insert before trailing non-folder (keeps folders before links)
    }
  }
  return null;
}
```

Keep this in `bookmarks.js` for Task 4 unless tests want it in lib.

**Group:** among `mainEl .group[data-folder-id]` that correspond to real groups (title has `data-folder-drag=group`), insert line `.group-drop-indicator` before section; `parentId = selectedTabId`; unnamed section never a before target for “folder after unnamed”.

- [ ] **Step 3: Pointer flow**

1. `pointerdown` on `[data-folder-drag]` → start session (inactive until slop)
2. Move past slop → activate ghost, `body.is-folder-dragging`, suppress Tab **click** switch via flag (mousedown started drag)
3. `pointerup` → if active, `getChildren(parentId)` + `isNoOpFolderReorder` + `resolveFolderReorderDestination` + `chrome.bookmarks.move`
4. Cleanup on cancel; `render()` already clears item drag — also `cleanupFolderDragSession()`

Tab click suppression:

```js
let suppressTabClick = false;
// on activate folder drag for tab: suppressTabClick = true
// in renderTabs click handler: if (suppressTabClick) { suppressTabClick = false; return; }
```

- [ ] **Step 4: Manual checks** (extension)

1. Drag tabs — order matches chrome://bookmarks; unnamed tab not draggable  
2. Drag group titles — same  
3. Short click tab still switches  
4. Item drag still works  

- [ ] **Step 5: `npm test` PASS**

- [ ] **Step 6: Commit**

```bash
git add bookmarks.js
git commit -m "feat: press-drag to reorder bookmark tabs and groups"
```

---

### Task 5: README

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Extend drag bullet**

```md
- **拖拽**：书签卡片长按可组内排序或拖到其他 Group；Tab / Group 标题按下拖动可同级排序。「未命名」虚拟节点不可拖。
```

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "docs: mention tab/group folder drag in README"
```

---

## Spec coverage

| Requirement | Task |
| --- | --- |
| Tab sibling reorder via move | 4 |
| Group sibling reorder via move | 4 |
| Press-to-drag (slop) | 4 |
| Virtual 未命名 not draggable | 2 + 4 |
| 未命名 stays at end | 4 (beforeId append rule) |
| Mutual exclusion with item drag | 4 |
| Helpers + tests | 1 |
| README | 5 |

## Placeholder scan

No TBD remaining; Tab append-before-trailing-links rule is specified in Task 4.
