# @agentmeshkit/workspace

Workspace utilities for agent sessions.

The root export is browser-safe and contains types plus file index helpers.
Node file-system operations are exported from `@agentmeshkit/workspace/node`.

## Backend Example

```ts
import {
  createSessionWorkspace,
  listWorkspaceTree,
  writeAttachment,
} from '@agentmeshkit/workspace/node';

const workspace = await createSessionWorkspace({
  root: '/var/lib/my-agent/sessions',
  sessionId: 'chat-123',
});

const attachment = await writeAttachment(workspace, {
  name: upload.filename,
  stream: upload.file,
  contentType: upload.mimetype,
});

const tree = await listWorkspaceTree(workspace);

return {
  attachment,
  tree,
};
```

`writeAttachment` writes to `attachments/`, sanitizes upload names, deduplicates
filename collisions, rejects traversal, and returns JSON-safe metadata:

```ts
{
  name: 'notes.txt',
  originalName: '../../notes.txt',
  relPath: 'attachments/notes.txt',
  size: 128,
  contentType: 'text/plain',
  createdAt: '2026-05-18T00:00:00.000Z'
}
```

Policy hooks can enforce size and extension limits:

```ts
await writeAttachment(workspace, file, {
  policy: {
    maxBytes: 10 * 1024 * 1024,
    allowedExtensions: ['.txt', '.md', '.pdf'],
  },
});
```

## Frontend Helper Example

```ts
import {
  flattenWorkspaceFilePaths,
  searchWorkspaceFiles,
  type WorkspaceTreeNode,
} from '@agentmeshkit/workspace';

const tree = (await fetchWorkspaceTree()) as WorkspaceTreeNode;
const paths = flattenWorkspaceFilePaths(tree);
const suggestions = searchWorkspaceFiles(paths, query, 10);
```

For richer suggestion rows:

```ts
import { flattenWorkspaceFiles, searchWorkspaceFiles } from '@agentmeshkit/workspace';

const files = flattenWorkspaceFiles(tree);
const matches = searchWorkspaceFiles(files, query, { maxResults: 10 });
```
