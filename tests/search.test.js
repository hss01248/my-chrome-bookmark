import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { searchBookmarkWall } from '../lib/search.js';

const wall = {
  tabs: [
    {
      id: '10',
      name: '2026',
      groups: [
        {
          name: 'AI工具',
          items: [
            { id: '1', title: 'Claude Code', url: 'https://claude.example/' },
            { id: '2', title: 'Other', url: 'https://other.example/' },
          ],
        },
      ],
    },
    {
      id: '__unnamed__',
      name: '未命名',
      groups: [
        {
          name: '未命名',
          items: [{ id: '3', title: 'VidBee', url: 'https://vidbee.example/' }],
        },
      ],
    },
  ],
};

describe('searchBookmarkWall', () => {
  it('returns empty for blank query', () => {
    assert.deepEqual(searchBookmarkWall(wall, '  '), []);
  });

  it('matches title or url case-insensitively with tab/group labels', () => {
    const hits = searchBookmarkWall(wall, 'CLAUDE');
    assert.equal(hits.length, 1);
    assert.equal(hits[0].id, '1');
    assert.equal(hits[0].tabName, '2026');
    assert.equal(hits[0].groupName, 'AI工具');
  });

  it('searches globally across tabs', () => {
    const hits = searchBookmarkWall(wall, 'vidbee');
    assert.equal(hits.length, 1);
    assert.equal(hits[0].tabName, '未命名');
  });
});
