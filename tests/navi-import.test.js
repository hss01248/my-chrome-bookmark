import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildNaviImportTree,
  toNetscapeHtml,
  resolveImportActions,
  isHttpUrl,
} from '../lib/navi-import.js';
import {
  resolveBookmarkParentId,
  importNaviToBookmarkBar,
} from '../lib/navi-apply.js';

describe('isHttpUrl', () => {
  it('accepts http and https only', () => {
    assert.equal(isHttpUrl('https://a.example/'), true);
    assert.equal(isHttpUrl('http://a.example/'), true);
    assert.equal(isHttpUrl('ftp://a.example/'), false);
    assert.equal(isHttpUrl('马士兵 算法'), false);
    assert.equal(isHttpUrl(''), false);
    assert.equal(isHttpUrl(null), false);
  });
});

describe('buildNaviImportTree', () => {
  it('maps tab → group → items and skips empty tabs and non-http urls', () => {
    const tabs = [
      { id: 1, name: 'android' },
      { id: 14, name: 'spring boot项目' },
      { id: 9, name: '教程' },
    ];
    const groupsByTabId = {
      1: [
        {
          name: '网络框架',
          itemList: [
            { name: 'OKHTTP', url: 'https://github.com/square/okhttp' },
            { name: 'dup', url: 'https://github.com/square/okhttp' },
          ],
        },
      ],
      14: [],
      9: [
        {
          name: '面试',
          itemList: [
            { name: '马士兵', url: '算法与数据结构基础到高级全家桶' },
            { name: 'valid', url: 'https://ok.example/' },
          ],
        },
      ],
    };

    const tree = buildNaviImportTree(tabs, groupsByTabId);
    assert.deepEqual(
      tree.tabs.map((t) => t.name),
      ['android', '教程']
    );
    assert.equal(tree.tabs[0].groups[0].items.length, 2);
    assert.equal(tree.tabs[1].groups[0].items.length, 1);
    assert.equal(tree.tabs[1].groups[0].items[0].url, 'https://ok.example/');
    assert.ok(tree.skipped.some((s) => s.reason === 'empty-tab'));
    assert.ok(tree.skipped.some((s) => s.reason === 'non-http'));
    assert.equal(tree.stats.items, 3);
  });

  it('skips empty named groups from output folders but keeps tabs with other groups', () => {
    const tree = buildNaviImportTree(
      [{ id: 1, name: 't' }],
      {
        1: [
          { name: 'empty', itemList: [] },
          {
            name: 'has',
            itemList: [{ name: 'a', url: 'https://a.example/' }],
          },
        ],
      }
    );
    assert.deepEqual(
      tree.tabs[0].groups.map((g) => g.name),
      ['has']
    );
  });
});

describe('toNetscapeHtml', () => {
  it('emits Netscape bookmark format with two folder levels', () => {
    const tree = {
      tabs: [
        {
          name: 'android',
          groups: [
            {
              name: '网络框架',
              items: [
                { title: 'OKHTTP', url: 'https://github.com/square/okhttp' },
              ],
            },
          ],
        },
      ],
      skipped: [],
      stats: { tabs: 1, groups: 1, items: 1 },
    };
    const html = toNetscapeHtml(tree);
    assert.match(html, /<!DOCTYPE NETSCAPE-Bookmark-file-1>/);
    assert.match(html, /<H3>android<\/H3>/);
    assert.match(html, /<H3>网络框架<\/H3>/);
    assert.match(
      html,
      /<A HREF="https:\/\/github\.com\/square\/okhttp">OKHTTP<\/A>/
    );
  });

  it('escapes HTML special characters in titles and urls', () => {
    const html = toNetscapeHtml({
      tabs: [
        {
          name: 'a<b>',
          groups: [
            {
              name: 'g&g',
              items: [{ title: 't"x', url: 'https://x.example/?a=1&b=2' }],
            },
          ],
        },
      ],
      skipped: [],
      stats: { tabs: 1, groups: 1, items: 1 },
    });
    assert.match(html, /<H3>a&lt;b&gt;<\/H3>/);
    assert.match(html, /<H3>g&amp;g<\/H3>/);
    assert.match(html, /HREF="https:\/\/x\.example\/\?a=1&amp;b=2"/);
    assert.match(html, />t&quot;x<\/A>/);
  });
});

describe('resolveImportActions', () => {
  it('reuses same-name folders and skips same-url bookmarks under parent', () => {
    const tree = {
      tabs: [
        {
          name: 'android',
          groups: [
            {
              name: '网络框架',
              items: [
                { title: 'OKHTTP', url: 'https://ok.example/' },
                { title: 'new', url: 'https://new.example/' },
              ],
            },
          ],
        },
        {
          name: 'fresh',
          groups: [
            {
              name: 'g',
              items: [{ title: 'x', url: 'https://x.example/' }],
            },
          ],
        },
      ],
    };

    const barChildren = [
      {
        id: '10',
        title: 'android',
        children: [
          {
            id: '20',
            title: '网络框架',
            children: [
              { id: '30', title: 'OKHTTP', url: 'https://ok.example/' },
            ],
          },
        ],
      },
    ];

    const plan = resolveImportActions(tree, barChildren);
    assert.equal(plan.createFolder.filter((a) => a.title === 'android').length, 0);
    assert.equal(plan.createFolder.filter((a) => a.title === 'fresh').length, 1);
    assert.equal(plan.createBookmark.filter((a) => a.url === 'https://ok.example/').length, 0);
    assert.equal(plan.createBookmark.filter((a) => a.url === 'https://new.example/').length, 1);
    assert.equal(plan.createBookmark.filter((a) => a.url === 'https://x.example/').length, 1);
    assert.ok(plan.skipped.some((s) => s.reason === 'duplicate-url'));
  });
});

describe('resolveBookmarkParentId', () => {
  it('resolves bar, temp, and existing folder keys', () => {
    const idByKey = new Map([
      ['bar', '1'],
      ['new:0', '99'],
    ]);
    assert.equal(resolveBookmarkParentId('bar', idByKey), '1');
    assert.equal(resolveBookmarkParentId('new:0', idByKey), '99');
    assert.equal(resolveBookmarkParentId('folder:20', idByKey), '20');
    assert.throws(() => resolveBookmarkParentId('missing', idByKey));
  });
});

describe('importNaviToBookmarkBar', () => {
  it('creates nested folders then bookmarks via bookmarks API', async () => {
    let seq = 100;
    /** @type {object[]} */
    const created = [];
    const api = {
      async getTree() {
        return [
          {
            id: '0',
            children: [
              { id: '1', title: 'Bookmarks Bar', children: [] },
              { id: '2', title: 'Other', children: [] },
            ],
          },
        ];
      },
      async getSubTree(id) {
        assert.equal(id, '1');
        return [{ id: '1', title: 'Bookmarks Bar', children: [] }];
      },
      async create(node) {
        const id = String(seq++);
        created.push({ ...node, id });
        return { id };
      },
    };

    const tree = {
      tabs: [
        {
          name: 'android',
          groups: [
            {
              name: '网络框架',
              items: [{ title: 'OKHTTP', url: 'https://ok.example/' }],
            },
          ],
        },
      ],
      stats: { tabs: 1, groups: 1, items: 1 },
    };

    const result = await importNaviToBookmarkBar(tree, api);
    assert.equal(result.createdFolders, 2);
    assert.equal(result.createdBookmarks, 1);
    assert.equal(created[0].title, 'android');
    assert.equal(created[0].parentId, '1');
    assert.equal(created[1].title, '网络框架');
    assert.equal(created[1].parentId, created[0].id);
    assert.equal(created[2].url, 'https://ok.example/');
    assert.equal(created[2].parentId, created[1].id);
  });
});
