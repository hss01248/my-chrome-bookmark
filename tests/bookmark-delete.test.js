import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  snapshotFromNode,
  createArgsFromSnapshot,
} from '../lib/bookmark-delete.js';

describe('snapshotFromNode', () => {
  it('builds undo snapshot from a bookmark node', () => {
    const snap = snapshotFromNode({
      id: '42',
      parentId: '10',
      index: 3,
      title: 'Claude',
      url: 'https://claude.example/',
    });
    assert.deepEqual(snap, {
      parentId: '10',
      index: 3,
      title: 'Claude',
      url: 'https://claude.example/',
    });
  });

  it('returns null for folders (no url)', () => {
    assert.equal(
      snapshotFromNode({ id: '1', parentId: '0', index: 0, title: 'Folder' }),
      null
    );
  });
});

describe('createArgsFromSnapshot', () => {
  it('maps snapshot to chrome.bookmarks.create args', () => {
    assert.deepEqual(
      createArgsFromSnapshot({
        parentId: '10',
        index: 3,
        title: 'Claude',
        url: 'https://claude.example/',
      }),
      {
        parentId: '10',
        index: 3,
        title: 'Claude',
        url: 'https://claude.example/',
      }
    );
  });
});
