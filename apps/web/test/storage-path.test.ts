import { test } from 'node:test';
import assert from 'node:assert/strict';
import { aircraftStoragePath } from '../src/lib/storagePath';
test('service storage references remain inside the authorized aircraft', () => {
  for (const path of ['B/page.jpg', 'A/../B/page.jpg', 'A/%2e%2e/B', 'A//page', 'A/./page', 'A/back\\slash', 'A/x\u0000']) {
    assert.equal(aircraftStoragePath(path, 'A'), false, path);
  }
  assert.equal(aircraftStoragePath('A/pages/scan.jpg', 'A'), true);
  assert.equal(aircraftStoragePath('B/docs/x.pdf', ['A', 'B']), true);
});
