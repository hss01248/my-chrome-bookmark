import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildBookmarkWall } from '../lib/bookmark-model.js';

/** 最小书签栏夹具：根 → 书签栏(id=1) → 子节点 */
function bar(children) {
  return {
    id: '0',
    title: '',
    children: [
      {
        id: '1',
        title: 'Bookmarks Bar',
        children,
      },
      { id: '2', title: 'Other Bookmarks', children: [] },
    ],
  };
}

describe('buildBookmarkWall', () => {
  it('maps top-level folders to tabs and bar links to trailing 未命名', () => {
    const tree = bar([
      { id: '10', title: 'github', children: [] },
      { id: '11', title: 'Direct Link', url: 'https://a.example/' },
      { id: '12', title: '2026', children: [
        { id: '20', title: 'AI工具', children: [
          { id: '30', title: 'Claude', url: 'https://claude.example/' },
          { id: '31', title: 'nested', children: [
            { id: '40', title: 'Deep', url: 'https://deep.example/' },
          ]},
        ]},
        { id: '21', title: 'Loose', url: 'https://loose.example/' },
      ]},
    ]);

    const wall = buildBookmarkWall(tree);
    assert.deepEqual(
      wall.tabs.map((t) => t.name),
      ['github', '2026', '未命名']
    );

    const unnamedTab = wall.tabs[2];
    assert.equal(unnamedTab.groups.length, 1);
    assert.equal(unnamedTab.groups[0].items[0].url, 'https://a.example/');

    const t2026 = wall.tabs[1];
    assert.deepEqual(
      t2026.groups.map((g) => g.name),
      ['AI工具', '未命名']
    );
    const ai = t2026.groups[0];
    assert.equal(ai.items.length, 2);
    assert.ok(ai.items.some((i) => i.url === 'https://deep.example/'));
    assert.ok(ai.items.some((i) => i.url === 'https://claude.example/'));
    assert.equal(t2026.groups[1].items[0].url, 'https://loose.example/');
  });

  it('omits empty 未命名 tab and group', () => {
    const tree = bar([
      {
        id: '10',
        title: 'only',
        children: [
          { id: '20', title: 'sub', children: [
            { id: '30', title: 'x', url: 'https://x.example/' },
          ]},
        ],
      },
    ]);
    const wall = buildBookmarkWall(tree);
    assert.deepEqual(wall.tabs.map((t) => t.name), ['only']);
    assert.deepEqual(wall.tabs[0].groups.map((g) => g.name), ['sub']);
  });

  it('uses url as title when title is empty', () => {
    const tree = bar([
      { id: '11', title: '', url: 'https://empty-title.example/' },
    ]);
    const item = buildBookmarkWall(tree).tabs[0].groups[0].items[0];
    assert.equal(item.title, 'https://empty-title.example/');
  });
});
