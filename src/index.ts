export interface WorkspaceFile {
  name: string;
  path: string;
  kind: 'file' | 'dir';
  size?: number;
  children?: WorkspaceFile[];
}

export function flattenWorkspaceFiles(tree: WorkspaceFile | null): WorkspaceFile[] {
  if (!tree) return [];
  const out: WorkspaceFile[] = [];
  const walk = (node: WorkspaceFile) => {
    out.push(node);
    node.children?.forEach(walk);
  };
  walk(tree);
  return out;
}

