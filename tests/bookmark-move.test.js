import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  adjustIndexForSameParentMove,
  resolveDropDestination,
} from '../lib/bookmark-move.js';

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
