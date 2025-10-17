import type { MediaTreeNode } from '@videoforest/types';

/**
 * 트리에서 전체 파일 개수를 재귀적으로 계산
 */
export function countFiles(nodes: MediaTreeNode[]): number {
  let count = 0;
  nodes.forEach(node => {
    if (node.type === 'file') {
      count++;
    } else if (node.children) {
      count += countFiles(node.children);
    }
  });
  return count;
}

/**
 * 트리에서 모든 폴더 ID를 재귀적으로 수집
 */
export function collectAllFolderIds(nodes: MediaTreeNode[]): Set<string> {
  const folderIds = new Set<string>();

  const traverse = (nodes: MediaTreeNode[]) => {
    nodes.forEach(node => {
      if (node.type === 'folder') {
        folderIds.add(node.id);
        if (node.children) {
          traverse(node.children);
        }
      }
    });
  };

  traverse(nodes);
  return folderIds;
}

/**
 * 자식 노드의 통계 계산
 */
export function getChildrenStats(children?: MediaTreeNode[]) {
  if (!children) {
    return { fileCount: 0, folderCount: 0 };
  }

  const fileCount = children.filter(c => c.type === 'file').length;
  const folderCount = children.filter(c => c.type === 'folder').length;

  return { fileCount, folderCount };
}
