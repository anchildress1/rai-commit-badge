import { describe, expect, it } from 'vitest';
import { isExcluded, splitChurn } from '../src/churn.js';

describe('isExcluded', () => {
  it.each([
    'package-lock.json',
    'packages/app/package-lock.json',
    'uv.lock',
    'go.sum',
    'node_modules/left-pad/index.js',
    'web/vendor/thing.php',
    'dist/index.js',
    'packages/app/build/main.css',
    'assets/app.min.js',
    'assets/app.min.css',
    'dist/index.js.map',
  ])('excludes %s', (path) => {
    expect(isExcluded(path)).toBe(true);
  });

  it.each(['src/index.js', 'README.md', 'docs/prd.md', 'src/lockfile.js', 'distributed/thing.js'])(
    'keeps %s',
    (path) => {
      expect(isExcluded(path)).toBe(false);
    }
  );
});

describe('splitChurn', () => {
  it('separates excluded lines from counted lines', () => {
    const files = [
      { added: 10, deleted: 5, path: 'src/index.js' },
      { added: 900, deleted: 100, path: 'package-lock.json' },
    ];
    expect(splitChurn(files)).toEqual({ churn: 15, excluded: 1000 });
  });

  it('returns zeroes for a commit with no counted files', () => {
    expect(splitChurn([])).toEqual({ churn: 0, excluded: 0 });
  });
});
