import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { adjustIndexForSameParentMove } from '../lib/bookmark-move.js';

describe('adjustIndexForSameParentMove', () => {
  it('keeps index when moving upward (newIndex < oldIndex)', () => {
    assert.equal(adjustIndexForSameParentMove(3, 1), 1);
  });

  it('increments when moving downward (newIndex > oldIndex)', () => {
    // Visual "insert before index 3" while item is at 1 → Chrome needs 4
    assert.equal(adjustIndexForSameParentMove(1, 3), 4);
  });

  it('no-ops when equal', () => {
    assert.equal(adjustIndexForSameParentMove(2, 2), 2);
  });
});
