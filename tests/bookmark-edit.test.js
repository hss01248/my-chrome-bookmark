import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeBookmarkUpdate } from '../lib/bookmark-edit.js';

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
