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

## Public API Sketch

```ts
const workspace = await createSessionWorkspace({ root, sessionId });
const attachment = await writeAttachment(workspace, upload);
const tree = await listWorkspaceTree(workspace);
```

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

