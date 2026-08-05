import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { faviconUrlFor, PLACEHOLDER_FAVICON } from '../lib/favicon.js';

describe('faviconUrlFor', () => {
  it('returns placeholder without origin', () => {
    assert.equal(faviconUrlFor('https://a.com'), PLACEHOLDER_FAVICON);
  });

  it('builds chrome favicon endpoint with origin', () => {
    const u = faviconUrlFor('https://a.com/x', 'chrome-extension://abc');
    assert.equal(
      u,
      'chrome-extension://abc/_favicon/?pageUrl=https%3A%2F%2Fa.com%2Fx&size=32'
    );
  });
});
