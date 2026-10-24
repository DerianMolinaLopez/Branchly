export interface TreeNode<T> {
  /** Last path segment. */
  name: string;
  /** Full path, unique within the tree. */
  path: string;
  item: T | null;
  children: TreeNode<T>[];
}

/**
 * Builds a folder tree from slash-separated names ("feature/login" goes in a
 * "feature" folder). Folders come before leaves; both sorted by name.
 */
export function buildTree<T>(items: T[], pathOf: (item: T) => string): TreeNode<T>[] {
  const root: TreeNode<T> = { name: '', path: '', item: null, children: [] };
  for (const item of items) {
    const parts = pathOf(item).split('/').filter(Boolean);
    let node = root;
    parts.forEach((part, i) => {
      const path = parts.slice(0, i + 1).join('/');
      const isLeaf = i === parts.length - 1;
      let child = node.children.find(
        (c) =>
          c.name === part &&
          (isLeaf ? c.item === null && c.children.length === 0 : c.item === null),
      );
      if (!child || isLeaf) {
        child = {
          name: part,
          path: isLeaf ? path : `${path}/`,
          item: isLeaf ? item : null,
          children: [],
        };
        node.children.push(child);
      }
      node = child;
    });
  }
  sortTree(root);
  return root.children;
}

function sortTree<T>(node: TreeNode<T>): void {
  node.children.sort((a, b) => {
    const folderA = a.item === null ? 0 : 1;
    const folderB = b.item === null ? 0 : 1;
    return folderA - folderB || a.name.localeCompare(b.name, undefined, { numeric: true });
  });
  node.children.forEach(sortTree);
}

/** Case-insensitive substring filter that keeps every match. */
export function matchesFilter(text: string, filter: string): boolean {
  return filter.trim() === '' || text.toLowerCase().includes(filter.trim().toLowerCase());
}
