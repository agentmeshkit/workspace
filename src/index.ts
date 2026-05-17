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
} from './search.js';
