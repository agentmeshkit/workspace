export type WorkspaceNodeKind = 'file' | 'dir';

export interface SessionWorkspace {
  sessionId: string;
  path: string;
  sessionPath: string;
  root: string;
}

export interface WorkspaceTreeNode {
  name: string;
  path: string;
  kind: WorkspaceNodeKind;
  size?: number;
  mtimeMs?: number;
  children?: WorkspaceTreeNode[];
}

export interface WorkspaceFileIndexEntry {
  name: string;
  path: string;
  size?: number;
  mtimeMs?: number;
}

export interface AttachmentMetadata {
  name: string;
  originalName: string;
  relPath: string;
  size: number;
  contentType?: string;
  lastModified?: number;
  createdAt: string;
}

export interface AttachmentInfo {
  name: string;
  relPath: string;
  size: number;
  contentType?: string;
  lastModified?: number;
  createdAt?: string;
  originalName?: string;
}

export interface NormalizeAttachmentInput {
  name?: string;
  filename?: string;
  originalName?: string;
  relPath?: string;
  path?: string;
  size?: number;
  contentType?: string;
  type?: string;
  lastModified?: number;
  createdAt?: string;
}
