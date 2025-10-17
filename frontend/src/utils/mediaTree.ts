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

/**
 * 트리에서 특정 ID의 노드를 찾기
 */
export function findNodeById(nodes: MediaTreeNode[], targetId: string): MediaTreeNode | null {
  for (const node of nodes) {
    if (node.id === targetId) {
      return node;
    }
    if (node.children) {
      const found = findNodeById(node.children, targetId);
      if (found) return found;
    }
  }
  return null;
}

/**
 * 특정 노드가 속한 폴더의 모든 파일들을 순서대로 가져오기
 * (같은 레벨의 파일들만 반환)
 */
export function getSiblingFiles(nodes: MediaTreeNode[], targetId: string): MediaTreeNode[] {
  // 먼저 대상 노드를 찾아서 folderId 확인
  const targetNode = findNodeById(nodes, targetId);
  if (!targetNode || targetNode.type !== 'file') {
    return [];
  }

  // targetNode의 folderId가 null이면 루트 레벨의 파일들
  // null이 아니면 해당 폴더의 파일들
  const findFilesInSameFolder = (nodes: MediaTreeNode[], folderId: string | null): MediaTreeNode[] => {
    let files: MediaTreeNode[] = [];

    for (const node of nodes) {
      if (node.type === 'folder') {
        if (node.id === folderId) {
          // 해당 폴더를 찾았으면 그 자식 파일들을 반환
          return (node.children || []).filter(child => child.type === 'file');
        }
        // 재귀적으로 탐색
        if (node.children) {
          const found = findFilesInSameFolder(node.children, folderId);
          if (found.length > 0) {
            return found;
          }
        }
      } else if (node.type === 'file' && folderId === null) {
        // 루트 레벨의 파일인 경우
        files.push(node);
      }
    }

    return files;
  };

  return findFilesInSameFolder(nodes, targetNode.folderId);
}

/**
 * 같은 폴더 내에서 다음 파일 찾기
 */
export function getNextFile(nodes: MediaTreeNode[], currentId: string): MediaTreeNode | null {
  const siblingFiles = getSiblingFiles(nodes, currentId);
  const currentIndex = siblingFiles.findIndex(file => file.id === currentId);

  if (currentIndex === -1 || currentIndex === siblingFiles.length - 1) {
    // 현재 파일을 찾지 못했거나 마지막 파일인 경우
    return null;
  }

  return siblingFiles[currentIndex + 1];
}

/**
 * 같은 폴더 내에서 이전 파일 찾기
 */
export function getPreviousFile(nodes: MediaTreeNode[], currentId: string): MediaTreeNode | null {
  const siblingFiles = getSiblingFiles(nodes, currentId);
  const currentIndex = siblingFiles.findIndex(file => file.id === currentId);

  if (currentIndex <= 0) {
    // 현재 파일을 찾지 못했거나 첫 번째 파일인 경우
    return null;
  }

  return siblingFiles[currentIndex - 1];
}
