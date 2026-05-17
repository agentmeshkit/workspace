import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  createSessionWorkspace,
  flattenWorkspaceFilePaths,
  flattenWorkspaceFiles,
  listWorkspaceTree,
  normalizeAttachmentInfo,
  safeJoin,
  searchWorkspaceFiles,
  writeAttachment,
} from './node.js';

let tmpRoot: string;

beforeEach(async () => {
  tmpRoot = await fsp.mkdtemp(path.join(os.tmpdir(), 'agentmeshkit-workspace-'));
});

afterEach(async () => {
  await fsp.rm(tmpRoot, { recursive: true, force: true });
});

describe('safeJoin', () => {
  it('joins paths inside the root', () => {
    const root = path.join(tmpRoot, 'workspace');
    expect(safeJoin(root, 'attachments', 'hello.txt')).toBe(
      path.join(root, 'attachments', 'hello.txt'),
    );
  });

  it('rejects traversal, absolute paths, and prefix collisions', () => {
    const root = path.join(tmpRoot, 'workspace');

    expect(() => safeJoin(root, '..', 'outside.txt')).toThrow(/escapes workspace/);
    expect(() => safeJoin(root, '/tmp/outside.txt')).toThrow(/absolute paths/);
    expect(() => safeJoin(root, '..', `${path.basename(root)}-sibling`)).toThrow(
      /escapes workspace/,
    );
  });

  it('rejects non-absolute roots', () => {
    expect(() => safeJoin('relative-root', 'file.txt')).toThrow(/absolute/);
  });
});

describe('createSessionWorkspace', () => {
  it('creates a session workspace under the configured root', async () => {
    const workspace = await createSessionWorkspace({ root: tmpRoot, sessionId: 'chat-1' });

    expect(workspace.path).toBe(path.join(tmpRoot, 'chat-1', 'workspace'));
    await expect(fsp.stat(workspace.path)).resolves.toMatchObject({ isDirectory: expect.any(Function) });
  });

  it('rejects unsafe session ids', async () => {
    await expect(
      createSessionWorkspace({ root: tmpRoot, sessionId: '../escape' }),
    ).rejects.toThrow(/safe path segment/);
    await expect(
      createSessionWorkspace({ root: tmpRoot, sessionId: 'nested/session' }),
    ).rejects.toThrow(/safe path segment/);
    await expect(
      createSessionWorkspace({ root: 'relative-root', sessionId: 'chat-1' }),
    ).rejects.toThrow(/root path must be absolute/);
  });
});

describe('listWorkspaceTree and search helpers', () => {
  it('returns deterministic file trees and flattened file indexes', async () => {
    const workspace = await createSessionWorkspace({ root: tmpRoot, sessionId: 'tree' });
    await fsp.mkdir(path.join(workspace.path, 'src'), { recursive: true });
    await fsp.mkdir(path.join(workspace.path, 'docs'), { recursive: true });
    await fsp.mkdir(path.join(workspace.path, 'node_modules'), { recursive: true });
    await fsp.writeFile(path.join(workspace.path, 'src', 'index.ts'), 'export {};\n');
    await fsp.writeFile(path.join(workspace.path, 'docs', 'index.ts'), '# duplicate name\n');
    await fsp.writeFile(path.join(workspace.path, 'README.md'), '# readme\n');
    await fsp.writeFile(path.join(workspace.path, '.env'), 'SECRET=1\n');
    await fsp.writeFile(path.join(workspace.path, 'node_modules', 'dep.js'), 'ignored\n');

    const tree = await listWorkspaceTree(workspace);
    const paths = flattenWorkspaceFilePaths(tree);

    expect(tree.path).toBe('');
    expect(paths).toEqual(['README.md', 'docs/index.ts', 'src/index.ts']);
    expect(flattenWorkspaceFiles(tree).map((file) => file.name)).toEqual([
      'README.md',
      'index.ts',
      'index.ts',
    ]);
    expect(searchWorkspaceFiles(paths, 'INDEX')).toEqual(['docs/index.ts', 'src/index.ts']);
    expect(searchWorkspaceFiles(flattenWorkspaceFiles(tree), 'read', { maxResults: 1 })).toEqual([
      expect.objectContaining({ path: 'README.md' }),
    ]);
  });

  it('can include hidden files when requested', async () => {
    const workspace = await createSessionWorkspace({ root: tmpRoot, sessionId: 'hidden' });
    await fsp.writeFile(path.join(workspace.path, '.env'), 'SECRET=1\n');

    const tree = await listWorkspaceTree(workspace, { includeHidden: true });

    expect(flattenWorkspaceFilePaths(tree, { includeHidden: true })).toEqual(['.env']);
  });

  it('skips symlinks by default and refuses followed symlinks outside the workspace', async () => {
    const workspace = await createSessionWorkspace({ root: tmpRoot, sessionId: 'tree-symlink' });
    const inside = path.join(workspace.path, 'actual');
    const outside = path.join(tmpRoot, 'outside');

    await fsp.mkdir(inside);
    await fsp.mkdir(outside);
    await fsp.writeFile(path.join(inside, 'inside.txt'), 'inside\n');
    await fsp.writeFile(path.join(outside, 'outside.txt'), 'outside\n');
    await fsp.symlink(inside, path.join(workspace.path, 'inside-link'));
    await fsp.symlink(outside, path.join(workspace.path, 'outside-link'));

    expect(flattenWorkspaceFilePaths(await listWorkspaceTree(workspace))).toEqual([
      'actual/inside.txt',
    ]);
    expect(
      flattenWorkspaceFilePaths(await listWorkspaceTree(workspace, { followSymlinks: true })),
    ).toEqual(['actual/inside.txt', 'inside-link/inside.txt']);
  });
});

describe('attachments', () => {
  it('writes attachments with sanitized names and JSON-safe metadata', async () => {
    const workspace = await createSessionWorkspace({ root: tmpRoot, sessionId: 'attach' });
    const attachment = await writeAttachment(
      workspace,
      {
        name: '../../hello.txt',
        data: new TextEncoder().encode('hello'),
        contentType: 'text/plain',
        lastModified: 123,
      },
      { now: () => new Date('2026-05-18T00:00:00.000Z') },
    );

    expect(attachment).toEqual({
      name: 'hello.txt',
      originalName: '../../hello.txt',
      relPath: 'attachments/hello.txt',
      size: 5,
      contentType: 'text/plain',
      lastModified: 123,
      createdAt: '2026-05-18T00:00:00.000Z',
    });
    await expect(fsp.readFile(path.join(workspace.path, attachment.relPath), 'utf8')).resolves.toBe(
      'hello',
    );
    expect(JSON.parse(JSON.stringify(attachment))).toEqual(attachment);
    expect(normalizeAttachmentInfo(attachment)).toEqual({
      name: 'hello.txt',
      originalName: '../../hello.txt',
      relPath: 'attachments/hello.txt',
      size: 5,
      contentType: 'text/plain',
      lastModified: 123,
      createdAt: '2026-05-18T00:00:00.000Z',
    });
  });

  it('deduplicates attachment filenames', async () => {
    const workspace = await createSessionWorkspace({ root: tmpRoot, sessionId: 'dedupe' });

    const first = await writeAttachment(workspace, {
      name: 'hello.txt',
      data: new TextEncoder().encode('one'),
    });
    const second = await writeAttachment(workspace, {
      name: 'hello.txt',
      data: new TextEncoder().encode('two'),
    });

    expect(first.relPath).toBe('attachments/hello.txt');
    expect(second.relPath).toBe('attachments/hello-1.txt');
  });

  it('enforces size and extension policies with cleanup', async () => {
    const workspace = await createSessionWorkspace({ root: tmpRoot, sessionId: 'policy' });

    await expect(
      writeAttachment(
        workspace,
        { name: 'large.txt', data: new TextEncoder().encode('too large') },
        { policy: { maxBytes: 3 } },
      ),
    ).rejects.toThrow(/exceeds 3 bytes/);

    await expect(
      writeAttachment(
        workspace,
        { name: 'script.js', data: new TextEncoder().encode('alert(1)') },
        { policy: { allowedExtensions: ['.txt'] } },
      ),
    ).rejects.toThrow(/extension is not allowed/);

    await expect(fsp.readdir(path.join(workspace.path, 'attachments'))).resolves.toEqual([]);
  });

  it('rejects an attachments symlink that escapes the workspace', async () => {
    const workspace = await createSessionWorkspace({ root: tmpRoot, sessionId: 'symlink' });
    const outside = path.join(tmpRoot, 'outside');
    await fsp.mkdir(outside);
    await fsp.symlink(outside, path.join(workspace.path, 'attachments'));

    await expect(
      writeAttachment(workspace, {
        name: 'escape.txt',
        data: new TextEncoder().encode('nope'),
      }),
    ).rejects.toThrow(/attachments directory escapes workspace/);
  });
});
