# AI Agent Integration

Minimal context for integrating `@agentmeshkit/workspace`.

## Contract

- Use `@agentmeshkit/workspace` in browser or shared code for types,
  normalization, flattening, and search.
- Use `@agentmeshkit/workspace/node` only in backend Node code for filesystem IO.
- Store and pass relative POSIX paths from returned metadata. Do not expose
  absolute server paths to models, browsers, or persisted chat state.

## Browser/Shared Code

```ts
import {
  flattenWorkspaceFiles,
  flattenWorkspaceFilePaths,
  normalizeAttachmentInfo,
  searchWorkspaceFiles,
  type WorkspaceTreeNode,
} from '@agentmeshkit/workspace';
```

The root export is browser-safe and does not import Node built-ins.

Use this side to turn a fetched `WorkspaceTreeNode` into file mention
suggestions:

```ts
const files = flattenWorkspaceFiles(tree);
const matches = searchWorkspaceFiles(files, query, { maxResults: 10 });
const paths = flattenWorkspaceFilePaths(tree);
```

Search is case-insensitive. Ranking order is basename prefix, basename contains,
then full-path contains. Empty queries return the first `maxResults` entries.

## Backend Node Code

```ts
import {
  createSessionWorkspace,
  listWorkspaceTree,
  safeJoin,
  writeAttachment,
} from '@agentmeshkit/workspace/node';
```

Create or open a per-session workspace:

```ts
const workspace = await createSessionWorkspace({ root, sessionId });
```

Path rules:

- `root` must be absolute.
- `sessionId` must be one safe path segment. No slashes, backslashes, absolute
  paths, `.`/`..`, or null bytes.
- Default workspace directory is `<root>/<sessionId>/workspace`.
- Use `safeJoin(root, ...segments)` for untrusted relative path segments. It
  rejects absolute segments, null bytes, and paths that resolve outside `root`.

## Attachment Writing

```ts
const attachment = await writeAttachment(
  workspace,
  {
    name: upload.filename,
    stream: upload.file,
    contentType: upload.mimetype,
    size: upload.size,
  },
  {
    policy: {
      maxBytes: 10 * 1024 * 1024,
      allowedExtensions: ['.txt', '.md', '.png', '.jpg', '.pdf'],
    },
  },
);
```

Behavior:

- Writes under `attachments/` unless `attachmentsDir` is provided.
- Sanitizes path-like or unsafe upload names to a basename.
- Deduplicates collisions with `-1`, `-2`, and so on.
- Enforces a default 10 MiB max size unless `policy.maxBytes` is provided.
- Supports a custom `policy.allow()` hook.

Returned metadata:

```ts
{
  name: string;
  originalName: string;
  relPath: string;
  size: number;
  contentType?: string;
  lastModified?: number;
  createdAt: string;
}
```

Use `attachment.relPath` when passing files to an agent.

## Tree Listing

```ts
const tree = await listWorkspaceTree(workspace, {
  maxDepth: 5,
  ignoredNames: ['node_modules', '.git'],
});
```

Defaults:

- Hidden entries are excluded unless `includeHidden: true`.
- `node_modules` is ignored unless `ignoredNames` is overridden.
- Entries are sorted by name for deterministic output.
- Symlinks are skipped unless `followSymlinks: true`.
- Symlinks resolving outside the workspace are ignored.

The root node has `path: ''`; child paths are relative POSIX paths.

## Do / Do Not

- Do import from `/node` only in server-side code.
- Do send agents `AttachmentMetadata.relPath` and flattened tree paths.
- Do keep model-visible paths relative to the workspace.
- Do not use string concatenation for filesystem paths.
- Do not ask browsers or agents to use absolute workspace paths.
- Do not assume hidden files are present unless explicitly included.
