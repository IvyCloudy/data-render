import { describe, expect, it } from 'vitest';
import { collectUploadMappingValues } from './uploadResults';

describe('collectUploadMappingValues', () => {
  it('keeps file selection order when responses finish out of order', () => {
    const results = new Map([
      ['second', { uid: 'second', order: 1, values: [{ id: 2 }, 'b'] }],
      ['first', { uid: 'first', order: 0, values: [{ id: 1 }, 'a'] }],
    ]);

    expect(collectUploadMappingValues(results.values(), 0)).toEqual([
      { id: 1 },
      { id: 2 },
    ]);
  });

  it('removes only the deleted file result', () => {
    const results = new Map([
      ['first', { uid: 'first', order: 0, values: ['a'] }],
      ['second', { uid: 'second', order: 1, values: ['b'] }],
    ]);
    results.delete('first');

    expect(collectUploadMappingValues(results.values(), 0)).toEqual(['b']);
  });
});
