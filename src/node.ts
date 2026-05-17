import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { Readable } from 'node:stream';
import type {
  AttachmentMetadata,
  SessionWorkspace,
  WorkspaceTreeNode,
} from './types.js';
import {
  flattenWorkspaceFilePaths,
  flattenWorkspaceFiles,
  normalizeAttachmentInfo,
  searchWorkspaceFiles,
} from './search.js';

export type {
  AttachmentInfo,
  AttachmentMetadata,
  NormalizeAttachmentInput,
  SessionWorkspace,
  WorkspaceFileIndexEntry,
  WorkspaceNodeKind,
  WorkspaceTreeNode,
} from './types.js';

export {
  flattenWorkspaceFilePaths,
  flattenWorkspaceFiles,
  normalizeAttachmentInfo,
  searchWorkspaceFiles,
};

export interface CreateSessionWorkspaceOptions {
  root: string;
  sessionId: string;
  workspaceDirName?: string;
}

export interface ListWorkspaceTreeOptions {
  includeHidden?: boolean;
  ignoredNames?: readonly string[];
  maxDepth?: number;
  followSymlinks?: boolean;
}

export interface AttachmentPolicy {
  maxBytes?: number;
  allowedExtensions?: readonly string[];
  allow?: (input: {
    originalName: string;
    sanitizedName: string;
    contentType?: string;
    size?: number;
  }) => void | Promise<void>;
}

export interface WriteAttachmentOptions {
  policy?: AttachmentPolicy;
  attachmentsDir?: string;
  now?: () => Date;
}

export interface AttachmentFileLike {
  name?: string;
  filename?: string;
  originalName?: string;
  data?: Uint8Array | ArrayBuffer | ArrayBufferView | AsyncIterable<Uint8Array> | Readable;
  stream?: AsyncIterable<Uint8Array> | Readable;
  arrayBuffer?: () => Promise<ArrayBuffer>;
  size?: number;
  type?: string;
  contentType?: string;
  lastModified?: number;
}

const DEFAULT_ATTACHMENTS_DIR = 'attachments';
const DEFAULT_MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;
const MAX_FILENAME_LENGTH = 200;

export function assertSafeSessionId(sessionId: string): void {
  if (!sessionId || sessionId.includes('\0')) {
    throw new Error('sessionId is required');
  }
  if (
    path.isAbsolute(sessionId) ||
    sessionId === '.' ||
    sessionId === '..' ||
    sessionId.includes('/') ||
    sessionId.includes('\\')
  ) {
    throw new Error('sessionId must be a safe path segment');
  }
}

function isInsidePath(root: string, target: string): boolean {
  const rel = path.relative(root, target);
  return rel === '' || (!!rel && !rel.startsWith('..') && !path.isAbsolute(rel));
}

export function safeJoin(root: string, ...segments: string[]): string {
  if (!path.isAbsolute(root)) {
    throw new Error('root path must be absolute');
  }

  for (const segment of segments) {
    if (segment.includes('\0')) {
      throw new Error('path contains a null byte');
    }
    if (path.isAbsolute(segment)) {
      throw new Error('absolute paths are not allowed');
    }
  }

  const resolvedRoot = path.resolve(root);
  const target = path.resolve(resolvedRoot, ...segments);

  if (!isInsidePath(resolvedRoot, target)) {
    throw new Error('path escapes workspace');
  }

  return target;
}

function toPosixPath(value: string): string {
  return value.split(path.sep).join('/');
}

function basenameFromUploadName(original: string): string {
  const normalized = original.replaceAll('\\', '/');
  return normalized.slice(normalized.lastIndexOf('/') + 1);
}

export function sanitizeFilename(original: string): string {
  let name = basenameFromUploadName(original);

  name = name
    .replace(/\0/g, '_')
    .replace(/[/\\]/g, '_')
    .replace(/\.\./g, '_')
    .replace(/^\.+/, '_');

  // eslint-disable-next-line no-control-regex
  name = name.replace(/[\x00-\x1f\x7f<>:"|?*]/g, '_');
  name = name.replace(/\s+/g, ' ').trim();

  if (name.length > MAX_FILENAME_LENGTH) {
    const ext = path.extname(name);
    const base = path.basename(name, ext);
    name = `${base.slice(0, MAX_FILENAME_LENGTH - ext.length)}${ext}`;
  }

  if (!name.replace(/[._\s-]/g, '')) {
    return 'file';
  }

  return name;
}

export async function createSessionWorkspace(
  options: CreateSessionWorkspaceOptions,
): Promise<SessionWorkspace> {
  assertSafeSessionId(options.sessionId);

  if (!path.isAbsolute(options.root)) {
    throw new Error('root path must be absolute');
  }
  const root = path.resolve(options.root);

  const workspaceDirName = options.workspaceDirName ?? 'workspace';
  if (!workspaceDirName || workspaceDirName.includes('/') || workspaceDirName.includes('\\')) {
    throw new Error('workspaceDirName must be a safe path segment');
  }

  const sessionPath = safeJoin(root, options.sessionId);
  const workspacePath = safeJoin(sessionPath, workspaceDirName);

  await fsp.mkdir(workspacePath, { recursive: true });

  return {
    sessionId: options.sessionId,
    path: workspacePath,
    sessionPath,
    root,
  };
}

function shouldSkipEntry(
  name: string,
  options: Required<Pick<ListWorkspaceTreeOptions, 'includeHidden' | 'ignoredNames'>>,
): boolean {
  if (!options.includeHidden && name.startsWith('.')) return true;
  return options.ignoredNames.includes(name);
}

async function readTreeNode(
  workspaceRoot: string,
  absolutePath: string,
  name: string,
  relPath: string,
  depth: number,
  options: Required<
    Pick<ListWorkspaceTreeOptions, 'includeHidden' | 'ignoredNames' | 'followSymlinks'>
  > & Pick<ListWorkspaceTreeOptions, 'maxDepth'>,
): Promise<WorkspaceTreeNode | null> {
  const lstat = await fsp.lstat(absolutePath);

  if (lstat.isSymbolicLink()) {
    if (!options.followSymlinks) return null;

    const real = await fsp.realpath(absolutePath);
    if (!isInsidePath(workspaceRoot, real)) {
      return null;
    }
  }

  const stat = options.followSymlinks ? await fsp.stat(absolutePath) : lstat;

  if (stat.isDirectory()) {
    const node: WorkspaceTreeNode = {
      name,
      path: relPath,
      kind: 'dir',
      mtimeMs: stat.mtimeMs,
      children: [],
    };

    if (options.maxDepth !== undefined && depth >= options.maxDepth) {
      return node;
    }

    const entries = await fsp.readdir(absolutePath, { withFileTypes: true });
    const sortedEntries = entries
      .filter((entry) => !shouldSkipEntry(entry.name, options))
      .sort((a, b) => {
        if (a.name < b.name) return -1;
        if (a.name > b.name) return 1;
        return 0;
      });

    for (const entry of sortedEntries) {
      const childRelPath = relPath ? `${relPath}/${entry.name}` : entry.name;
      const child = await readTreeNode(
        workspaceRoot,
        safeJoin(absolutePath, entry.name),
        entry.name,
        childRelPath,
        depth + 1,
        options,
      );
      if (child) node.children?.push(child);
    }

    return node;
  }

  if (!stat.isFile()) {
    return null;
  }

  return {
    name,
    path: relPath,
    kind: 'file',
    size: stat.size,
    mtimeMs: stat.mtimeMs,
  };
}

export async function listWorkspaceTree(
  workspace: SessionWorkspace | string,
  options: ListWorkspaceTreeOptions = {},
): Promise<WorkspaceTreeNode> {
  const workspacePath = typeof workspace === 'string' ? workspace : workspace.path;
  if (!path.isAbsolute(workspacePath)) {
    throw new Error('workspace path must be absolute');
  }

  const realWorkspacePath = await fsp.realpath(workspacePath);
  const node = await readTreeNode(
    realWorkspacePath,
    realWorkspacePath,
    path.basename(realWorkspacePath),
    '',
    0,
    {
      includeHidden: options.includeHidden ?? false,
      ignoredNames: options.ignoredNames ?? ['node_modules'],
      followSymlinks: options.followSymlinks ?? false,
      maxDepth: options.maxDepth,
    },
  );

  if (!node || node.kind !== 'dir') {
    throw new Error('workspace path is not a directory');
  }

  return node;
}

async function resolveUniqueName(directory: string, name: string): Promise<string> {
  const ext = path.extname(name);
  const base = path.basename(name, ext);

  for (let attempt = 0; attempt < 1000; attempt += 1) {
    const candidate = attempt === 0 ? name : `${base}-${attempt}${ext}`;
    try {
      await fsp.access(path.join(directory, candidate), fs.constants.F_OK);
    } catch {
      return candidate;
    }
  }

  throw new Error('could not resolve a unique attachment filename');
}

function getAttachmentName(fileLike: AttachmentFileLike): string {
  const name = fileLike.name ?? fileLike.filename ?? fileLike.originalName;
  if (!name) throw new Error('attachment name is required');
  return name;
}

async function toAsyncChunks(
  fileLike: AttachmentFileLike,
): Promise<AsyncIterable<Uint8Array> | Iterable<Uint8Array>> {
  const value = fileLike.stream ?? fileLike.data;

  if (value instanceof Readable) {
    return value;
  }
  if (value && Symbol.asyncIterator in Object(value)) {
    return value as AsyncIterable<Uint8Array>;
  }
  if (value instanceof ArrayBuffer) {
    return [new Uint8Array(value)];
  }
  if (ArrayBuffer.isView(value)) {
    return [new Uint8Array(value.buffer, value.byteOffset, value.byteLength)];
  }
  if (fileLike.arrayBuffer) {
    return [new Uint8Array(await fileLike.arrayBuffer())];
  }

  throw new Error('attachment data, stream, or arrayBuffer() is required');
}

function normalizeExtensionSet(extensions: readonly string[] | undefined): Set<string> | null {
  if (!extensions) return null;
  return new Set(
    extensions.map((extension) => {
      const normalized = extension.toLowerCase();
      return normalized.startsWith('.') ? normalized : `.${normalized}`;
    }),
  );
}

export async function writeAttachment(
  workspace: SessionWorkspace | string,
  fileLike: AttachmentFileLike,
  options: WriteAttachmentOptions = {},
): Promise<AttachmentMetadata> {
  const workspacePath = typeof workspace === 'string' ? workspace : workspace.path;
  const realWorkspacePath = await fsp.realpath(workspacePath);
  const attachmentsDirName = options.attachmentsDir ?? DEFAULT_ATTACHMENTS_DIR;
  const attachmentsDir = safeJoin(realWorkspacePath, attachmentsDirName);

  await fsp.mkdir(attachmentsDir, { recursive: true });

  const realAttachmentsDir = await fsp.realpath(attachmentsDir);
  if (!isInsidePath(realWorkspacePath, realAttachmentsDir)) {
    throw new Error('attachments directory escapes workspace');
  }

  const originalName = getAttachmentName(fileLike);
  const sanitizedName = sanitizeFilename(originalName);
  const allowedExtensions = normalizeExtensionSet(options.policy?.allowedExtensions);
  const extension = path.extname(sanitizedName).toLowerCase();

  if (allowedExtensions && !allowedExtensions.has(extension)) {
    throw new Error(`attachment extension is not allowed: ${extension || '(none)'}`);
  }

  await options.policy?.allow?.({
    originalName,
    sanitizedName,
    contentType: fileLike.contentType ?? fileLike.type,
    size: fileLike.size,
  });

  const finalName = await resolveUniqueName(realAttachmentsDir, sanitizedName);
  const finalPath = safeJoin(realAttachmentsDir, finalName);
  const maxBytes = options.policy?.maxBytes ?? DEFAULT_MAX_ATTACHMENT_BYTES;
  const chunks = await toAsyncChunks(fileLike);
  const handle = await fsp.open(finalPath, 'wx');
  let bytesWritten = 0;

  try {
    for await (const chunk of chunks) {
      const bytes = chunk instanceof Uint8Array ? chunk : new Uint8Array(chunk);
      bytesWritten += bytes.byteLength;

      if (bytesWritten > maxBytes) {
        throw Object.assign(new Error(`attachment exceeds ${maxBytes} bytes`), {
          statusCode: 413,
        });
      }

      await handle.write(bytes);
    }
  } catch (error) {
    await handle.close().catch(() => {});
    await fsp.unlink(finalPath).catch(() => {});
    throw error;
  } finally {
    await handle.close().catch(() => {});
  }

  const relPath = toPosixPath(path.relative(realWorkspacePath, finalPath));
  return {
    name: finalName,
    originalName,
    relPath,
    size: bytesWritten,
    contentType: fileLike.contentType ?? fileLike.type,
    lastModified: fileLike.lastModified,
    createdAt: (options.now?.() ?? new Date()).toISOString(),
  };
}
