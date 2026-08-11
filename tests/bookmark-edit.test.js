import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeBookmarkUpdate,
  normalizeFolderTitle,
  resolveNewFolderIndex,
  DEFAULT_FOLDER_TITLE,
} from '../lib/bookmark-edit.js';

describe('normalizeBookmarkUpdate', () => {
  it('trims title and url', () => {
    assert.deepEqual(
      normalizeBookmarkUpdate({
        title: '  Claude  ',
        url: '  https://claude.example/  ',
      }),
      { title: 'Claude', url: 'https://claude.example/' }
    );
  });

  it('falls back to url when title is blank', () => {
    assert.deepEqual(
      normalizeBookmarkUpdate({ title: '   ', url: 'https://a.example/' }),
      { title: 'https://a.example/', url: 'https://a.example/' }
    );
  });

  it('returns null when url is blank', () => {
    assert.equal(normalizeBookmarkUpdate({ title: 'x', url: '  ' }), null);
  });
});

describe('normalizeFolderTitle', () => {
  it('trims title', () => {
    assert.equal(normalizeFolderTitle('  AI  '), 'AI');
  });

  it('returns null when blank', () => {
    assert.equal(normalizeFolderTitle('   '), null);
    assert.equal(normalizeFolderTitle(''), null);
  });
});

describe('DEFAULT_FOLDER_TITLE', () => {
  it('is 新建文件夹', () => {
    assert.equal(DEFAULT_FOLDER_TITLE, '新建文件夹');
  });
});

describe('resolveNewFolderIndex', () => {
  it('inserts before first url child', () => {
    assert.equal(
      resolveNewFolderIndex([
        { id: 'f1' },
        { id: 'f2' },
        { id: 'l1', url: 'https://a.example/' },
        { id: 'l2', url: 'https://b.example/' },
      ]),
      2
    );
  });

  it('appends when there are no url children', () => {
    assert.equal(
      resolveNewFolderIndex([{ id: 'f1' }, { id: 'f2' }]),
      2
    );
  });

  it('returns 0 for empty children', () => {
    assert.equal(resolveNewFolderIndex([]), 0);
  });

  it('returns 0 when first child is a link', () => {
    assert.equal(
      resolveNewFolderIndex([{ id: 'l1', url: 'https://a.example/' }]),
      0
    );
  });
});
