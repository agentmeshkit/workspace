# PRD: AgentMeshKit Workspace

## Summary

`@agentmeshkit/workspace` provides file-backed workspace primitives for agent
apps: session directories, attachment intake, file tree snapshots, safe path
handling, and search indexes for composer mentions.

## Problem

Agent products repeatedly need the same workspace services. AgentWeb currently
owns session workspace folders, uploaded attachments, file trees, and `@file`
mention indexing inside the app. That logic should become reusable.

## Users

- Backend apps creating per-session workspaces.
- Frontends rendering file trees and attachment chips.
- Composer packages needing file mention suggestions.

## Goals

- Create and validate session workspace paths.
- Store attachment metadata without exposing unsafe paths.
- Produce stable file tree snapshots for UI consumption.
- Provide small search helpers for filename/path mentions.
- Keep storage local-file based for the first release.

## Non-Goals

- No cloud object storage in MVP.
- No document parsing or embeddings.
- No chat runtime.
- No UI components beyond optional data helpers.

## MVP Scope

- `createSessionWorkspace(root, sessionId)`.
- `writeAttachment(workspace, fileLike)`.
- `listWorkspaceTree(workspace)`.
- `flattenWorkspaceFiles(tree)` and `searchWorkspaceFiles(files, query)`.
- Path traversal protection.
- Size and extension policy hooks.
- Browser-safe exports for tree flattening, search, and attachment metadata
  normalization.
- Node-only exports for file-system IO under `@agentmeshkit/workspace/node`.

## Public API Sketch

```ts
import { flattenWorkspaceFiles, searchWorkspaceFiles } from '@agentmeshkit/workspace';
import {
  createSessionWorkspace,
  listWorkspaceTree,
  writeAttachment,
} from '@agentmeshkit/workspace/node';

const workspace = await createSessionWorkspace({ root, sessionId });
const attachment = await writeAttachment(workspace, upload);
const tree = await listWorkspaceTree(workspace);
const files = flattenWorkspaceFiles(tree);
const suggestions = searchWorkspaceFiles(files, query);
```

## Implemented API Notes

- `createSessionWorkspace({ root, sessionId })` creates
  `<root>/<sessionId>/workspace` and rejects session IDs containing traversal,
  separators, absolute paths, or null bytes.
- `safeJoin(root, ...segments)` resolves paths under an absolute root and rejects
  absolute segments, null bytes, and resolved paths outside the root.
- `listWorkspaceTree(workspace)` returns a deterministic `WorkspaceTreeNode`
  rooted at the workspace directory with POSIX-style relative `path` values.
  Hidden files and `node_modules` are excluded by default; `includeHidden` and
  `ignoredNames` are configurable.
- `flattenWorkspaceFiles(tree)` returns sorted file index entries; directories
  are excluded. `flattenWorkspaceFilePaths(tree)` returns just relative paths.
- `searchWorkspaceFiles(files, query)` works on either string paths or file index
  entries, performs case-insensitive matching, ranks basename prefixes before
  basename contains before path contains, and caps results after ranking.
- `writeAttachment(workspace, fileLike)` writes to `attachments/`, sanitizes
  names, deduplicates collisions with `-1`, `-2`, and returns JSON-safe
  `AttachmentMetadata`.
- `normalizeAttachmentInfo(input)` converts backend attachment metadata into the
  compact frontend shape used for attachment chips.

## Runtime Split

- `@agentmeshkit/workspace` and `@agentmeshkit/workspace/browser` are
  browser-safe. They expose types, tree flattening, search, and attachment
  metadata normalization without importing Node built-ins.
- `@agentmeshkit/workspace/node` is the only entry point for Node IO helpers:
  session directory creation, safe joins, tree listing from disk, and attachment
  writes.

## Acceptance Criteria

- Path traversal attempts are rejected.
- File tree snapshots are deterministic.
- Search helpers work in browser-safe code.
- Attachment metadata can round-trip through JSON.
- Fixtures cover nested folders, hidden files, and duplicate filenames.

## Milestones

1. Extract workspace tree and search helpers.
2. Add Node file IO with policy hooks.
3. Add tests for path safety.
4. Publish `0.1.0`.
