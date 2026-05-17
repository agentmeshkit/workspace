import type {
  AttachmentInfo,
  NormalizeAttachmentInput,
  WorkspaceFileIndexEntry,
  WorkspaceTreeNode,
} from './types.js';

export interface FlattenWorkspaceFilesOptions {
  includeHidden?: boolean;
}

export interface SearchWorkspaceFilesOptions {
  maxResults?: number;
}

function isHiddenPath(path: string): boolean {
  return path.split('/').some((part) => part.startsWith('.') && part !== '.');
}

function comparePath(a: string, b: string): number {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

export function flattenWorkspaceFiles(
  tree: WorkspaceTreeNode | null | undefined,
  options: FlattenWorkspaceFilesOptions = {},
): WorkspaceFileIndexEntry[] {
  if (!tree) return [];

  const files: WorkspaceFileIndexEntry[] = [];

  const walk = (node: WorkspaceTreeNode): void => {
    if (node.kind === 'file') {
      if (options.includeHidden || !isHiddenPath(node.path)) {
        files.push({
          name: node.name,
          path: node.path,
          size: node.size,
          mtimeMs: node.mtimeMs,
        });
      }
      return;
    }

    for (const child of node.children ?? []) {
      walk(child);
    }
  };

  walk(tree);
  return files.sort((a, b) => comparePath(a.path, b.path));
}

export function flattenWorkspaceFilePaths(
  tree: WorkspaceTreeNode | null | undefined,
  options: FlattenWorkspaceFilesOptions = {},
): string[] {
  return flattenWorkspaceFiles(tree, options).map((file) => file.path);
}

export function searchWorkspaceFiles(
  files: readonly string[],
  query: string,
  maxResults?: number,
): string[];
export function searchWorkspaceFiles(
  files: readonly WorkspaceFileIndexEntry[],
  query: string,
  options?: SearchWorkspaceFilesOptions,
): WorkspaceFileIndexEntry[];
export function searchWorkspaceFiles(
  files: readonly string[] | readonly WorkspaceFileIndexEntry[],
  query: string,
  options: number | SearchWorkspaceFilesOptions = {},
): string[] | WorkspaceFileIndexEntry[] {
  const maxResults = typeof options === 'number' ? options : options.maxResults ?? 10;
  const normalizedQuery = query.trim().toLowerCase();
  const entries = [...files];

  if (!normalizedQuery) {
    return entries.slice(0, maxResults) as string[] | WorkspaceFileIndexEntry[];
  }

  return entries
    .filter((entry) => {
      const path = typeof entry === 'string' ? entry : entry.path;
      return path.toLowerCase().includes(normalizedQuery);
    })
    .slice(0, maxResults) as string[] | WorkspaceFileIndexEntry[];
}

export function normalizeAttachmentInfo(input: NormalizeAttachmentInput): AttachmentInfo {
  const relPath = input.relPath ?? input.path;
  const name = input.name ?? input.filename ?? input.originalName;

  if (!name) {
    throw new Error('attachment name is required');
  }
  if (!relPath) {
    throw new Error('attachment relPath is required');
  }
  if (typeof input.size !== 'number' || !Number.isFinite(input.size) || input.size < 0) {
    throw new Error('attachment size must be a non-negative number');
  }

  return {
    name,
    relPath: relPath.replaceAll('\\', '/'),
    size: input.size,
    contentType: input.contentType ?? input.type,
    lastModified: input.lastModified,
    createdAt: input.createdAt,
    originalName: input.originalName,
  };
}
