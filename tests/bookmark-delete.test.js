import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  snapshotFromNode,
  createArgsFromSnapshot,
  removeItemFromWall,
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

describe('removeItemFromWall', () => {
  it('removes an item and keeps empty real folder groups', () => {
    const wall = {
      tabs: [
        {
          id: '10',
          name: 'Work',
          groups: [
            {
              name: 'AI',
              folderId: '20',
              items: [
                { id: 'a', title: 'A', url: 'https://a.example/', parentId: '20', index: 0 },
                { id: 'b', title: 'B', url: 'https://b.example/', parentId: '20', index: 1 },
              ],
            },
            {
              name: 'Solo',
              folderId: '21',
              items: [
                { id: 'c', title: 'C', url: 'https://c.example/', parentId: '21', index: 0 },
              ],
            },
          ],
        },
      ],
    };

    assert.equal(removeItemFromWall(wall, 'b'), true);
    assert.deepEqual(
      wall.tabs[0].groups[0].items.map((i) => i.id),
      ['a']
    );

    assert.equal(removeItemFromWall(wall, 'c'), true);
    assert.equal(wall.tabs[0].groups.length, 2);
    assert.equal(wall.tabs[0].groups[1].name, 'Solo');
    assert.equal(wall.tabs[0].groups[1].items.length, 0);
  });

  it('drops empty synthetic 未命名 groups', () => {
    const wall = {
      tabs: [
        {
          id: '10',
          name: 'Work',
          groups: [
            {
              name: '未命名',
              folderId: '10',
              items: [
                { id: 'c', title: 'C', url: 'https://c.example/', parentId: '10', index: 0 },
              ],
            },
          ],
        },
      ],
    };
    assert.equal(removeItemFromWall(wall, 'c'), true);
    assert.equal(wall.tabs[0].groups.length, 0);
  });

  it('returns false when id is missing', () => {
    assert.equal(removeItemFromWall({ tabs: [] }, 'x'), false);
  });
});
