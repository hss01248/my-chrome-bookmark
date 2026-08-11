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

  it('keeps empty named subfolder groups', () => {
    const tree = bar([
      {
        id: '10',
        title: 'only',
        children: [
          { id: '20', title: 'empty-group', children: [] },
          {
            id: '21',
            title: 'with-link',
            children: [{ id: '30', title: 'x', url: 'https://x.example/' }],
          },
        ],
      },
    ]);
    const wall = buildBookmarkWall(tree);
    assert.deepEqual(
      wall.tabs[0].groups.map((g) => ({ name: g.name, folderId: g.folderId, n: g.items.length })),
      [
        { name: 'empty-group', folderId: '20', n: 0 },
        { name: 'with-link', folderId: '21', n: 1 },
      ]
    );
  });

  it('keeps empty top-level folder tab with empty groups list when no children', () => {
    const tree = bar([{ id: '10', title: 'github', children: [] }]);
    const wall = buildBookmarkWall(tree);
    assert.equal(wall.tabs.length, 1);
    assert.equal(wall.tabs[0].id, '10');
    assert.deepEqual(wall.tabs[0].groups, []);
  });

  it('uses url as title when title is empty', () => {
    const tree = bar([
      { id: '11', title: '', url: 'https://empty-title.example/' },
    ]);
    const item = buildBookmarkWall(tree).tabs[0].groups[0].items[0];
    assert.equal(item.title, 'https://empty-title.example/');
  });

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
});
