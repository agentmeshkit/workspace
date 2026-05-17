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

function basenameOf(path: string): string {
  const normalizedPath = path.replaceAll('\\', '/');
  return normalizedPath.slice(normalizedPath.lastIndexOf('/') + 1);
}

function normalizeSearchText(value: string): string {
  return value.replaceAll('\\', '/').toLowerCase();
}

function normalizeMaxResults(maxResults: number | undefined): number {
  if (maxResults === undefined) return 10;
  if (!Number.isFinite(maxResults)) return 0;
  return Math.max(0, Math.floor(maxResults));
}

function rankWorkspacePath(path: string, normalizedQuery: string): number | null {
  const normalizedPath = normalizeSearchText(path);
  const basename = basenameOf(normalizedPath);

  if (basename.startsWith(normalizedQuery)) return 0;
  if (basename.includes(normalizedQuery)) return 1;
  if (normalizedPath.includes(normalizedQuery)) return 2;
  return null;
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
  const maxResults = normalizeMaxResults(typeof options === 'number' ? options : options.maxResults);
  const normalizedQuery = normalizeSearchText(query.trim());
  const entries = [...files];

  if (!normalizedQuery) {
    return entries.slice(0, maxResults) as string[] | WorkspaceFileIndexEntry[];
  }

  return entries
    .map((entry, index) => {
      const path = typeof entry === 'string' ? entry : entry.path;
      return {
        entry,
        index,
        rank: rankWorkspacePath(path, normalizedQuery),
      };
    })
    .filter((candidate) => candidate.rank !== null)
    .sort((a, b) => {
      if (a.rank !== b.rank) return (a.rank ?? 0) - (b.rank ?? 0);
      return a.index - b.index;
    })
    .map((candidate) => candidate.entry)
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
