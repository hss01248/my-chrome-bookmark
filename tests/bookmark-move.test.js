import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  adjustIndexForSameParentMove,
  isNoOpFolderReorder,
  isNoOpVisualReorder,
  resolveDropDestination,
  resolveFolderReorderDestination,
} from '../lib/bookmark-move.js';

describe('isNoOpVisualReorder', () => {
  const visualItems = [
    { id: 'a', parentId: 'g1', index: 0 },
    { id: 'b', parentId: 'g1', index: 1 },
    { id: 'c', parentId: 'g1', index: 2 },
  ];

  it('is true when dragging B before C (original next sibling / same visual slot)', () => {
    assert.equal(
      isNoOpVisualReorder({
        draggedId: 'b',
        beforeItemId: 'c',
        visualItems,
      }),
      true
    );
  });

  it('is false when dragging B before A (move up)', () => {
    assert.equal(
      isNoOpVisualReorder({
        draggedId: 'b',
        beforeItemId: 'a',
        visualItems,
      }),
      false
    );
  });

  it('is false when dragging B to append', () => {
    assert.equal(
      isNoOpVisualReorder({
        draggedId: 'b',
        beforeItemId: null,
        visualItems,
      }),
      false
    );
  });

  it('is true when dragging C to append (already last)', () => {
    assert.equal(
      isNoOpVisualReorder({
        draggedId: 'c',
        beforeItemId: null,
        visualItems,
      }),
      true
    );
  });

  it('is false when dragged is missing from visualItems (cross-group)', () => {
    assert.equal(
      isNoOpVisualReorder({
        draggedId: 'b',
        beforeItemId: 'x',
        visualItems: [
          { id: 'x', parentId: 'g2', index: 0 },
          { id: 'y', parentId: 'g2', index: 1 },
        ],
      }),
      false
    );
  });
});

describe('adjustIndexForSameParentMove', () => {
  it('documents legacy SO workaround (not used by resolveDropDestination)', () => {
    assert.equal(adjustIndexForSameParentMove(3, 1), 1);
    assert.equal(adjustIndexForSameParentMove(0, 1), 2);
    assert.equal(adjustIndexForSameParentMove(2, 2), 2);
  });
});

describe('resolveDropDestination', () => {
  const visualABC = [
    { id: 'a', parentId: 'g1', index: 0 },
    { id: 'b', parentId: 'g1', index: 1 },
    { id: 'c', parentId: 'g1', index: 2 },
  ];

  it('moves A before C using C index in current child list (Chrome decrements)', () => {
    assert.deepEqual(
      resolveDropDestination({
        dragged: { id: 'a', parentId: 'g1', index: 0 },
        targetFolderId: 'g1',
        beforeItem: { id: 'c', parentId: 'g1', index: 2 },
        childIds: ['a', 'b', 'c'],
        visualItems: visualABC,
      }),
      { parentId: 'g1', index: 2 }
    );
  });

  it('appends A using childIds.length', () => {
    assert.deepEqual(
      resolveDropDestination({
        dragged: { id: 'a', parentId: 'g1', index: 0 },
        targetFolderId: 'g1',
        beforeItem: null,
        childIds: ['a', 'b', 'c'],
        visualItems: visualABC,
      }),
      { parentId: 'g1', index: 3 }
    );
  });

  it('moves C before A', () => {
    assert.deepEqual(
      resolveDropDestination({
        dragged: { id: 'c', parentId: 'g1', index: 2 },
        targetFolderId: 'g1',
        beforeItem: { id: 'a', parentId: 'g1', index: 0 },
        childIds: ['a', 'b', 'c'],
        visualItems: visualABC,
      }),
      { parentId: 'g1', index: 0 }
    );
  });

  it('moves across groups to folder start', () => {
    assert.deepEqual(
      resolveDropDestination({
        dragged: { id: 'a', parentId: 'g1', index: 1 },
        targetFolderId: 'g2',
        beforeItem: { id: 'x', parentId: 'g2', index: 0 },
        childIds: ['x', 'y'],
        visualItems: [
          { id: 'x', parentId: 'g2', index: 0 },
          { id: 'y', parentId: 'g2', index: 1 },
        ],
      }),
      { parentId: 'g2', index: 0 }
    );
  });

  it('before a deep item uses next same-folder sibling id index', () => {
    assert.deepEqual(
      resolveDropDestination({
        dragged: { id: 'a', parentId: 'g1', index: 0 },
        targetFolderId: 'g2',
        beforeItem: { id: 'deep', parentId: 'nested', index: 0 },
        childIds: ['x', 'y'],
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
        childIds: ['folder-only'],
        visualItems: [{ id: 'deep', parentId: 'nested', index: 0 }],
      }),
      { parentId: 'g2', index: 1 }
    );
  });

  it('maps before bookmark across sibling folder in childIds', () => {
    assert.deepEqual(
      resolveDropDestination({
        dragged: { id: 'a', parentId: 'g1', index: 0 },
        targetFolderId: 'g1',
        beforeItem: { id: 'c', parentId: 'g1', index: 2 },
        childIds: ['a', 'f', 'c'],
        visualItems: [
          { id: 'a', parentId: 'g1', index: 0 },
          { id: 'c', parentId: 'g1', index: 2 },
        ],
      }),
      { parentId: 'g1', index: 2 }
    );
  });
});

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
