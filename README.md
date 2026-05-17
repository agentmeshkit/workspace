# @agentmeshkit/workspace

Workspace utilities for agent sessions.

Use this package to create per-session workspaces, safely accept uploaded
attachments, list files for UI/agent context, and search file paths for
composer mentions.

## Install

```sh
pnpm add @agentmeshkit/workspace
```

## Import Surfaces

`@agentmeshkit/workspace` is browser-safe. It exports types, attachment metadata
normalization, tree flattening, and search helpers. It does not import
`node:fs`, `node:path`, or other Node built-ins.

```ts
import {
  flattenWorkspaceFiles,
  flattenWorkspaceFilePaths,
  normalizeAttachmentInfo,
  searchWorkspaceFiles,
  type WorkspaceTreeNode,
} from '@agentmeshkit/workspace';
```

`@agentmeshkit/workspace/node` is backend-only. Use it for filesystem work:
creating a session workspace, validating joined paths, listing a tree from disk,
and writing attachments.

```ts
import {
  createSessionWorkspace,
  listWorkspaceTree,
  safeJoin,
  writeAttachment,
} from '@agentmeshkit/workspace/node';
```

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

`root` must be absolute. `sessionId` must be one safe path segment: no slashes,
backslashes, absolute paths, `.`/`..`, or null bytes. By default the workspace is
created at `<root>/<sessionId>/workspace`.

Use `safeJoin(root, ...segments)` when joining untrusted relative path segments
inside a known absolute root. It rejects absolute segments, null bytes, and
resolved paths outside the root.

## Attachment Writing

`writeAttachment` writes to `attachments/` by default, sanitizes upload names,
deduplicates filename collisions, rejects traversal, enforces a default 10 MiB
limit, and returns JSON-safe metadata:

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

Supported file-like inputs include a Node `Readable`, an async iterable of
`Uint8Array`, `Uint8Array`/`ArrayBuffer` data, or an object with
`arrayBuffer()`. Policy hooks can enforce size, extension, and custom checks:

```ts
await writeAttachment(workspace, file, {
  policy: {
    maxBytes: 10 * 1024 * 1024,
    allowedExtensions: ['.txt', '.md', '.pdf'],
  },
});
```

Pass returned `relPath` to agents or UIs. Do not expose or persist absolute
server paths.

## Tree Listing

```ts
const tree = await listWorkspaceTree(workspace, {
  maxDepth: 5,
  ignoredNames: ['node_modules', '.git'],
});
```

`listWorkspaceTree` returns a deterministic `WorkspaceTreeNode` rooted at the
workspace directory. Paths are POSIX-style relative paths. Hidden files are
excluded by default, `node_modules` is ignored by default, and symlinks are not
followed unless `followSymlinks: true`. Symlinks that resolve outside the
workspace are ignored.

## Browser Helpers

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

`flattenWorkspaceFiles` returns sorted file entries with `name`, relative
`path`, `size`, and `mtimeMs`. `flattenWorkspaceFilePaths` returns only relative
path strings. Hidden paths are excluded unless `includeHidden: true`.

## Search Ranking

`searchWorkspaceFiles` is dependency-free and safe to run in browsers. Matching
is case-insensitive and ranked in this order:

1. Basename prefix, for example `search.ts` for `sea`.
2. Basename contains, for example `research.md` for `search`.
3. Full path contains, for example `src/search/index.ts` for `search`.

Results keep their input order within the same rank, and `maxResults` is applied
after ranking. Empty queries return the first `maxResults` entries without
ranking.

## Node/Browser Split

Use `@agentmeshkit/workspace` or `@agentmeshkit/workspace/browser` in frontend
code. These exports do not import `node:fs`, `node:path`, or other Node built-ins.

Use `@agentmeshkit/workspace/node` for filesystem work such as creating session
workspaces, listing trees from disk, and writing attachments.

## AI Agent Integration

See [`docs/AI_AGENT_INTEGRATION.md`](docs/AI_AGENT_INTEGRATION.md) for a compact
guide intended to be copied into agent/tool integration context.
