# Bookmark Drag Sort Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Phase 1 — long-press drag bookmark items to reorder within a Group or move them across Groups via `chrome.bookmarks.move`.

**Architecture:** Extend `lib/bookmark-model.js` so items expose `parentId`/`index` and groups expose `folderId`. Put move math in pure `lib/bookmark-move.js`. Wire Pointer Events + ~400ms long-press in `bookmarks.js` with insert-line / group-highlight CSS; call `chrome.bookmarks.move` on drop and rely on existing `onMoved` → `reload()`.

**Tech Stack:** Manifest V3, vanilla ES modules, `chrome.bookmarks`, Node `node:test` (no DnD library).

**Spec:** [docs/superpowers/specs/2026-08-10-bookmark-drag-sort-design.md](../specs/2026-08-10-bookmark-drag-sort-design.md)

---

## File map

| File | Role |
| --- | --- |
| Create: `lib/bookmark-move.js` | `adjustIndexForSameParentMove`, `resolveDropDestination` |
| Create: `tests/bookmark-move.test.js` | Pure-function tests for index / drop mapping |
| Modify: `lib/bookmark-model.js` | Emit `parentId`, `index` on items; `folderId` on groups |
| Modify: `tests/bookmark-model.test.js` | Assert new fields |
| Modify: `bookmarks.js` | Dataset attrs, long-press drag controller, move + toast on error |
| Modify: `bookmarks.css` | Dragging / ghost / insert line / drop-target group |
| Modify: `README.md` | One short feature bullet for drag |

Out of scope in this plan: Tab/Group drag, search-mode drag, cross-Tab moves.

---

### Task 1: Model — `parentId` / `index` / `folderId`

**Files:**
- Modify: `lib/bookmark-model.js`
- Modify: `tests/bookmark-model.test.js`

- [ ] **Step 1: Write the failing assertions**

Append to `tests/bookmark-model.test.js`:

```js
it('exposes parentId/index on items and folderId on groups', () => {
  const tree = bar([
    {
      id: '12',
      title: '2026',
      children: [
        {
          id: '20',
          title: 'AI工具',
          children: [
            {
              id: '30',
              title: 'Claude',
              url: 'https://claude.example/',
              parentId: '20',
              index: 0,
            },
            {
              id: '31',
              title: 'nested',
              children: [
                {
                  id: '40',
                  title: 'Deep',
                  url: 'https://deep.example/',
                  parentId: '31',
                  index: 0,
                },
              ],
            },
          ],
        },
        {
          id: '21',
          title: 'Loose',
          url: 'https://loose.example/',
          parentId: '12',
          index: 1,
        },
      ],
    },
  ]);

  const wall = buildBookmarkWall(tree);
  const t2026 = wall.tabs[0];
  assert.equal(t2026.groups[0].folderId, '20');
  assert.equal(t2026.groups[1].folderId, '12');

  const claude = t2026.groups[0].items.find((i) => i.id === '30');
  assert.deepEqual(
    { parentId: claude.parentId, index: claude.index },
    { parentId: '20', index: 0 }
  );

  const deep = t2026.groups[0].items.find((i) => i.id === '40');
  assert.deepEqual(
    { parentId: deep.parentId, index: deep.index },
    { parentId: '31', index: 0 }
  );

  const loose = t2026.groups[1].items[0];
  assert.deepEqual(
    { parentId: loose.parentId, index: loose.index },
    { parentId: '12', index: 1 }
  );

  const barLooseTree = bar([
    {
      id: '11',
      title: 'Direct',
      url: 'https://a.example/',
      parentId: '1',
      index: 0,
    },
  ]);
  const unnamed = buildBookmarkWall(barLooseTree).tabs[0];
  assert.equal(unnamed.id, '__unnamed__');
  assert.equal(unnamed.groups[0].folderId, '1');
  assert.equal(unnamed.groups[0].items[0].parentId, '1');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/bookmark-model.test.js`

Expected: FAIL (missing `folderId` / `parentId` / `index`)

- [ ] **Step 3: Minimal model changes**

In `lib/bookmark-model.js`, change `toItem` and group construction:

```js
function toItem(node) {
  const url = node.url || '';
  const title = (node.title && node.title.trim()) || url;
  return {
    id: node.id,
    title,
    url,
    parentId: node.parentId ?? '',
    index: node.index ?? 0,
  };
}

function buildGroupsForFolder(folderNode) {
  const groups = [];
  const loose = [];

  for (const child of folderNode.children || []) {
    if (isFolder(child)) {
      groups.push({
        name: child.title || UNNAMED,
        folderId: child.id,
        items: collectLinks(child),
      });
    } else if (child.url) {
      loose.push(toItem(child));
    }
  }

  if (loose.length) {
    groups.push({
      name: UNNAMED,
      folderId: folderNode.id,
      items: loose,
    });
  }

  return groups.filter((g) => g.items.length > 0);
}
```

When building the virtual unnamed tab:

```js
groups: [{ name: UNNAMED, folderId: bar.id, items: barLoose }],
```

Ensure `collectLinks` keeps using `toItem` so deep nodes retain their real `parentId`/`index`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test tests/bookmark-model.test.js`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/bookmark-model.js tests/bookmark-model.test.js
git commit -m "feat: expose bookmark parentId/index and group folderId"
```

---

### Task 2: `adjustIndexForSameParentMove`

**Files:**
- Create: `lib/bookmark-move.js`
- Create: `tests/bookmark-move.test.js`

- [ ] **Step 1: Write failing tests**

```js
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { adjustIndexForSameParentMove } from '../lib/bookmark-move.js';

describe('adjustIndexForSameParentMove', () => {
  it('keeps index when moving upward (newIndex < oldIndex)', () => {
    assert.equal(adjustIndexForSameParentMove(3, 1), 1);
  });

  it('increments when moving downward (newIndex > oldIndex)', () => {
    // Visual "insert before index 3" while item is at 1 → Chrome needs 4
    assert.equal(adjustIndexForSameParentMove(1, 3), 4);
  });

  it('no-ops when equal', () => {
    assert.equal(adjustIndexForSameParentMove(2, 2), 2);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/bookmark-move.test.js`

Expected: FAIL (module / export missing)

- [ ] **Step 3: Implement**

Create `lib/bookmark-move.js`:

```js
/**
 * Chrome bookmarks.move same-parent downward index quirk.
 * @param {number} oldIndex
 * @param {number} newIndex desired index before removal adjustment
 */
export function adjustIndexForSameParentMove(oldIndex, newIndex) {
  if (oldIndex < newIndex) return newIndex + 1;
  return newIndex;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/bookmark-move.test.js`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/bookmark-move.js tests/bookmark-move.test.js
git commit -m "feat: add same-parent move index compensation"
```

---

### Task 3: `resolveDropDestination`

**Files:**
- Modify: `lib/bookmark-move.js`
- Modify: `tests/bookmark-move.test.js`

Semantics (lock in tests):

- Always set `parentId` to `targetFolderId` (promote into group folder).
- `beforeItem == null` → append: `index = folderChildCount` (count of current children of target folder; caller passes it).
- Else if `beforeItem.parentId === targetFolderId` → `index = beforeItem.index`.
- Else (before a deep/other-parent visual item) → walk `visualItems` after the insert point; use the next item with `parentId === targetFolderId`'s `index`; if none, append (`folderChildCount`).
- If `dragged.parentId === targetFolderId`, run `adjustIndexForSameParentMove(dragged.index, index)`.
- If destination equals current `{ parentId, index }` after adjust, caller may no-op; function still returns the destination.

- [ ] **Step 1: Write failing tests**

```js
import {
  adjustIndexForSameParentMove,
  resolveDropDestination,
} from '../lib/bookmark-move.js';

describe('resolveDropDestination', () => {
  const dragged = { id: 'a', parentId: 'g1', index: 0 };

  it('appends within same folder', () => {
    assert.deepEqual(
      resolveDropDestination({
        dragged,
        targetFolderId: 'g1',
        beforeItem: null,
        folderChildCount: 3,
        visualItems: [
          { id: 'a', parentId: 'g1', index: 0 },
          { id: 'b', parentId: 'g1', index: 1 },
          { id: 'c', parentId: 'g1', index: 2 },
        ],
      }),
      { parentId: 'g1', index: adjustIndexForSameParentMove(0, 3) }
    );
  });

  it('inserts before a same-folder sibling (move down)', () => {
    assert.deepEqual(
      resolveDropDestination({
        dragged,
        targetFolderId: 'g1',
        beforeItem: { id: 'c', parentId: 'g1', index: 2 },
        folderChildCount: 3,
        visualItems: [
          { id: 'a', parentId: 'g1', index: 0 },
          { id: 'b', parentId: 'g1', index: 1 },
          { id: 'c', parentId: 'g1', index: 2 },
        ],
      }),
      { parentId: 'g1', index: adjustIndexForSameParentMove(0, 2) }
    );
  });

  it('moves across groups to folder start', () => {
    assert.deepEqual(
      resolveDropDestination({
        dragged: { id: 'a', parentId: 'g1', index: 1 },
        targetFolderId: 'g2',
        beforeItem: { id: 'x', parentId: 'g2', index: 0 },
        folderChildCount: 2,
        visualItems: [
          { id: 'x', parentId: 'g2', index: 0 },
          { id: 'y', parentId: 'g2', index: 1 },
        ],
      }),
      { parentId: 'g2', index: 0 }
    );
  });

  it('before a deep item uses next same-folder sibling index', () => {
    assert.deepEqual(
      resolveDropDestination({
        dragged: { id: 'a', parentId: 'g1', index: 0 },
        targetFolderId: 'g2',
        beforeItem: { id: 'deep', parentId: 'nested', index: 0 },
        folderChildCount: 2,
        visualItems: [
          { id: 'deep', parentId: 'nested', index: 0 },
          { id: 'x', parentId: 'g2', index: 0 },
          { id: 'y', parentId: 'g2', index: 1 },
        ],
      }),
      { parentId: 'g2', index: 0 }
    );
  });

  it('before deep item with no later same-folder sibling appends', () => {
    assert.deepEqual(
      resolveDropDestination({
        dragged: { id: 'a', parentId: 'g1', index: 0 },
        targetFolderId: 'g2',
        beforeItem: { id: 'deep', parentId: 'nested', index: 0 },
        folderChildCount: 1,
        visualItems: [{ id: 'deep', parentId: 'nested', index: 0 }],
      }),
      { parentId: 'g2', index: 1 }
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/bookmark-move.test.js`

Expected: FAIL (`resolveDropDestination` missing)

- [ ] **Step 3: Implement `resolveDropDestination`**

```js
/**
 * @typedef {{ id: string, parentId: string, index: number }} MoveItemRef
 */

/**
 * @param {{
 *   dragged: MoveItemRef,
 *   targetFolderId: string,
 *   beforeItem: MoveItemRef | null,
 *   folderChildCount: number,
 *   visualItems: MoveItemRef[],
 * }} args
 * @returns {{ parentId: string, index: number }}
 */
export function resolveDropDestination({
  dragged,
  targetFolderId,
  beforeItem,
  folderChildCount,
  visualItems,
}) {
  let index;
  if (!beforeItem) {
    index = folderChildCount;
  } else if (beforeItem.parentId === targetFolderId) {
    index = beforeItem.index;
  } else {
    const start = visualItems.findIndex((v) => v.id === beforeItem.id);
    const rest = start >= 0 ? visualItems.slice(start + 1) : visualItems;
    const next = rest.find((v) => v.parentId === targetFolderId);
    index = next ? next.index : folderChildCount;
  }

  if (dragged.parentId === targetFolderId) {
    index = adjustIndexForSameParentMove(dragged.index, index);
  }

  return { parentId: targetFolderId, index };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/bookmark-move.test.js`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/bookmark-move.js tests/bookmark-move.test.js
git commit -m "feat: resolve drop destination for bookmark move"
```

---

### Task 4: Render metadata for drag hit-testing

**Files:**
- Modify: `bookmarks.js` (`itemLink`, `renderGroups`)

- [ ] **Step 1: Stamp datasets on item and group**

In `itemLink`, after `a.dataset.bookmarkId = item.id`:

```js
a.dataset.parentId = item.parentId ?? '';
a.dataset.index = String(item.index ?? 0);
a.dataset.draggableItem = showMeta ? '0' : '1'; // search results: no drag
```

In `renderGroups`, on each `section`:

```js
section.dataset.folderId = group.folderId;
section.classList.add('group');
```

On each `grid`:

```js
grid.dataset.folderId = group.folderId;
```

Pass `folderId` through so drop targets resolve without looking up wall again (optional optimization: keep wall as source of truth on drop).

- [ ] **Step 2: Smoke-check model fields still available in search**

No code change required in `lib/search.js` (spreads `...item`). Confirm search items keep `parentId` but `dataset.draggableItem = '0'` when `showMeta` is true.

- [ ] **Step 3: Commit**

```bash
git add bookmarks.js
git commit -m "feat: add DOM datasets for bookmark drag targets"
```

---

### Task 5: Drag CSS

**Files:**
- Modify: `bookmarks.css`

- [ ] **Step 1: Add styles**

```css
.item.is-drag-pending {
  opacity: 0.85;
  transform: scale(1.02);
  transition: transform 0.12s ease, opacity 0.12s ease;
}

.item.is-dragging {
  opacity: 0.35;
}

.drag-ghost {
  position: fixed;
  z-index: 2000;
  pointer-events: none;
  width: min(280px, 70vw);
  opacity: 0.95;
  box-shadow: 0 12px 28px rgba(0, 0, 0, 0.18);
  transform: translate(-8px, -8px) rotate(1.5deg);
}

.group.is-drop-target {
  outline: 2px solid var(--accent);
  outline-offset: 4px;
  border-radius: var(--radius);
}

.drop-indicator {
  height: 3px;
  margin: 4px 0;
  border-radius: 2px;
  background: var(--accent);
  grid-column: 1 / -1;
}

body.is-bookmark-dragging {
  cursor: grabbing;
  user-select: none;
}

body.is-bookmark-dragging a.item {
  cursor: grabbing;
}
```

- [ ] **Step 2: Commit**

```bash
git add bookmarks.css
git commit -m "style: add bookmark drag-and-drop visuals"
```

---

### Task 6: Long-press pointer drag controller + `move`

**Files:**
- Modify: `bookmarks.js`
- Modify: import from `./lib/bookmark-move.js`

Constants:

```js
const LONG_PRESS_MS = 400;
const LONG_PRESS_MOVE_TOLERANCE_PX = 8;
```

- [ ] **Step 1: Helpers to read item ref from DOM**

```js
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
```

- [ ] **Step 2: Implement drag session state**

Keep a single module-level session:

```js
/** @type {null | {
 *   pointerId: number,
 *   sourceEl: HTMLElement,
 *   dragged: { id: string, parentId: string, index: number },
 *   ghost: HTMLElement | null,
 *   timer: ReturnType<typeof setTimeout> | null,
 *   startX: number,
 *   startY: number,
 *   active: boolean,
 * }} */
let dragSession = null;
```

- [ ] **Step 3: Pointer handlers on `mainEl` (delegated)**

Behavior checklist (implement explicitly):

1. `pointerdown` on `.item[data-draggable-item="1"]` — ignore if target closest `.item-action`; start long-press timer; record coords / pointerId; `setPointerCapture` when drag becomes active.
2. Before long-press fires: if move > tolerance or `pointerup`/`pointercancel` → clear timer (treat as click / cancel).
3. On long-press fire: `preventDefault` path via `click` suppression flag; add `is-dragging` to source; clone a `.drag-ghost` into `document.body`; set `body.is-bookmark-dragging`; `hideContextMenu()` / `hideEditPopover()`.
4. `pointermove` while active: position ghost; `elementFromPoint` → find `.group` / `.item`; compute insert **before** nearest item by comparing pointer Y/X to item midpoints within the group's `.grid`; show `.drop-indicator` as a grid child before that item (or at end); toggle `.is-drop-target` on the group section.
5. `pointerup` while active: compute destination with `resolveDropDestination`:
   - `targetFolderId` from `section.dataset.folderId`
   - `visualItems` from `[data-bookmark-id]` inside that group's grid (map `itemRefFromEl`)
   - `beforeItem` from indicator target or `null`
   - `folderChildCount`: count of **all** children of that folder in Chrome terms is not in the wall for nested folder nodes. **Phase 1 approach:** use `await chrome.bookmarks.getChildren(targetFolderId)` then `.length` right before resolve (accurate), then `move`.
6. If destination equals current parent+index → cleanup only.
7. Else `await chrome.bookmarks.move(id, destination)`; on failure show toast `"移动失败"` (reuse toast element without undo button, or a short status-only toast).
8. Always cleanup ghost / classes / session on end/cancel.
9. Suppress the synthetic `click` that follows a successful long-press (`preventDefault` on the next click for that element via a `suppressClickUntil` timestamp).

Sketch for drop commit:

```js
async function commitBookmarkMove(dragged, targetFolderId, beforeItem, visualItems) {
  const children = await chrome.bookmarks.getChildren(targetFolderId);
  const destination = resolveDropDestination({
    dragged,
    targetFolderId,
    beforeItem,
    folderChildCount: children.length,
    visualItems,
  });
  if (
    destination.parentId === dragged.parentId &&
    destination.index === dragged.index
  ) {
    return;
  }
  await chrome.bookmarks.move(dragged.id, destination);
}
```

- [ ] **Step 4: Disable drag in search**

Already via `data-draggable-item="0"` when `showMeta` is true. Do not attach long-press for those items.

- [ ] **Step 5: Manual sanity (extension load)**

Load unpacked extension; verify:

1. Short click still opens bookmark
2. Long-press then release without move does not open and does not move
3. Reorder within group matches `chrome://bookmarks`
4. Drag to another group updates folder
5. Search results cannot start a drag

- [ ] **Step 6: Run full unit suite**

Run: `npm test`

Expected: all PASS

- [ ] **Step 7: Commit**

```bash
git add bookmarks.js bookmarks.css
git commit -m "feat: long-press drag to reorder or move bookmarks"
```

---

### Task 7: README note

**Files:**
- Modify: `README.md` (features section near Tab/Group bullets)

- [ ] **Step 1: Add bullet**

```md
- **拖拽（书签）**：在 Tab 内容区长按书签卡片可拖动；组内排序或拖到其他 Group 换文件夹。搜索结果中不可拖。
```

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "docs: mention bookmark long-press drag in README"
```

---

## Spec coverage self-check

| Spec requirement | Task |
| --- | --- |
| `chrome.bookmarks.move` + no new permission | Task 6 |
| Same-folder index +1 quirk | Task 2 |
| Unnamed group → tab folder id | Task 1 + 3 |
| Promote deep items into group folder | Task 3 |
| Long-press ~400ms | Task 6 |
| Insert line + group highlight | Tasks 5–6 |
| Search disables drag | Tasks 4 + 6 |
| onMoved refresh | Existing listeners |
| Unit tests for move + model | Tasks 1–3 |
| No Tab/Group drag in Phase 1 | Out of scope (not in tasks) |

## Placeholder scan

No TBD / “similar to Task N” / unimplemented validation stubs remain after the above.

## Type consistency

- `MoveItemRef`: `{ id, parentId, index }`
- Group: `{ name, folderId, items }`
- Destination: `{ parentId, index }` for `chrome.bookmarks.move`
