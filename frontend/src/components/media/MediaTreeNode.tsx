import { useMediaStore } from '../../stores/mediaStore';
import MediaFileItem from './MediaFileItem';
import MediaFolderItem from './MediaFolderItem';
import type { MediaTreeNode as MediaTreeNodeType } from '@videoforest/types';

interface MediaTreeNodeProps {
  node: MediaTreeNodeType;
  depth?: number;
}

export default function MediaTreeNode({ node, depth = 0 }: MediaTreeNodeProps) {
  const { expandedFolders, toggleFolder } = useMediaStore();

  if (node.type === 'folder') {
    const isExpanded = expandedFolders.has(node.id);

    return (
      <MediaFolderItem node={node} depth={depth} isExpanded={isExpanded} onToggle={() => toggleFolder(node.id)}>
        {node.children?.map(child => (
          <MediaTreeNode key={child.id} node={child} depth={depth + 1} />
        ))}
      </MediaFolderItem>
    );
  } else {
    return <MediaFileItem node={node} depth={depth} />;
  }
}
