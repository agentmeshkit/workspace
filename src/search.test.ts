import { describe, expect, it } from 'vitest';
import {
  flattenWorkspaceFilePaths,
  flattenWorkspaceFiles,
  searchWorkspaceFiles,
  type WorkspaceTreeNode,
} from './index.js';
import * as workspace from './index.js';

describe('browser-safe workspace search helpers', () => {
  const tree: WorkspaceTreeNode = {
    name: 'workspace',
    path: '',
    kind: 'dir',
    children: [
      {
        name: '.cache',
        path: '.cache',
        kind: 'dir',
        children: [{ name: 'index.ts', path: '.cache/index.ts', kind: 'file' }],
      },
      { name: '.env', path: '.env', kind: 'file' },
      { name: 'README.md', path: 'README.md', kind: 'file' },
      {
        name: 'docs',
        path: 'docs',
        kind: 'dir',
        children: [
          { name: 'index.ts', path: 'docs/index.ts', kind: 'file' },
          { name: 'research-notes.md', path: 'docs/research-notes.md', kind: 'file' },
        ],
      },
      {
        name: 'src',
        path: 'src',
        kind: 'dir',
        children: [
          { name: 'index.ts', path: 'src/index.ts', kind: 'file' },
          { name: 'search.ts', path: 'src/utils/search.ts', kind: 'file' },
        ],
      },
    ],
  };

  it('keeps duplicate filenames as separate index entries', () => {
    expect(flattenWorkspaceFiles(tree).filter((file) => file.name === 'index.ts')).toEqual([
      expect.objectContaining({ path: 'docs/index.ts' }),
      expect.objectContaining({ path: 'src/index.ts' }),
    ]);
  });

  it('filters hidden files and directories unless includeHidden is requested', () => {
    expect(flattenWorkspaceFilePaths(tree)).toEqual([
      'README.md',
      'docs/index.ts',
      'docs/research-notes.md',
      'src/index.ts',
      'src/utils/search.ts',
    ]);
    expect(flattenWorkspaceFilePaths(tree, { includeHidden: true })).toEqual([
      '.cache/index.ts',
      '.env',
      'README.md',
      'docs/index.ts',
      'docs/research-notes.md',
      'src/index.ts',
      'src/utils/search.ts',
    ]);
  });

  it('ranks basename prefixes before basename contains before path contains', () => {
    const files = [
      'src/search/index.ts',
      'docs/research-notes.md',
      'src/utils/search.ts',
      'packages/SearchBox.tsx',
      'unmatched.ts',
    ];

    expect(searchWorkspaceFiles(files, 'search')).toEqual([
      'src/utils/search.ts',
      'packages/SearchBox.tsx',
      'docs/research-notes.md',
      'src/search/index.ts',
    ]);
  });

  it('applies maxResults after ranking for paths and file index entries', () => {
    const paths = [
      'src/search/index.ts',
      'docs/research-notes.md',
      'src/utils/search.ts',
      'packages/SearchBox.tsx',
    ];
    const entries = paths.map((path) => ({
      name: path.slice(path.lastIndexOf('/') + 1),
      path,
    }));

    expect(searchWorkspaceFiles(paths, 'search', 2)).toEqual([
      'src/utils/search.ts',
      'packages/SearchBox.tsx',
    ]);
    expect(searchWorkspaceFiles(entries, 'search', { maxResults: 1 })).toEqual([
      expect.objectContaining({ path: 'src/utils/search.ts' }),
    ]);
    expect(searchWorkspaceFiles(paths, 'search', 0)).toEqual([]);
  });

  it('keeps the root export free of Node IO APIs', () => {
    expect('createSessionWorkspace' in workspace).toBe(false);
    expect('listWorkspaceTree' in workspace).toBe(false);
    expect('writeAttachment' in workspace).toBe(false);
  });
});
