import { Box, Typography, IconButton, Collapse } from '@mui/material';
import {
  Folder as FolderIcon,
  FolderOpen as FolderOpenIcon,
  ExpandMore as ExpandMoreIcon,
  ChevronRight as ChevronRightIcon,
} from '@mui/icons-material';
import { useTranslation } from 'react-i18next';
import { getChildrenStats } from '../../utils/mediaTree';
import type { MediaTreeNode } from '@videoforest/types';

interface MediaFolderItemProps {
  node: MediaTreeNode;
  depth: number;
  isExpanded: boolean;
  onToggle: () => void;
  children?: React.ReactNode;
}

export default function MediaFolderItem({ node, depth, isExpanded, onToggle, children }: MediaFolderItemProps) {
  const { t } = useTranslation();
  const { fileCount, folderCount } = getChildrenStats(node.children);

  return (
    <Box>
      {/* 폴더 헤더 */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          py: 1,
          px: 2,
          pl: 2 + depth * 3,
          cursor: 'pointer',
          '&:hover': {
            bgcolor: 'action.hover',
          },
          borderRadius: 1,
        }}
        onClick={onToggle}
      >
        <IconButton size='small' sx={{ mr: 1 }}>
          {isExpanded ? <ExpandMoreIcon /> : <ChevronRightIcon />}
        </IconButton>
        {isExpanded ? <FolderOpenIcon sx={{ mr: 2, color: 'primary.main' }} /> : <FolderIcon sx={{ mr: 2, color: 'primary.main' }} />}
        <Typography variant='body1' sx={{ flexGrow: 1, fontWeight: 500 }}>
          {node.name}
        </Typography>
        <Typography variant='caption' color='text.secondary' sx={{ mr: 2 }}>
          {folderCount > 0 && t('media.folders', { count: folderCount })}
          {folderCount > 0 && fileCount > 0 && ' · '}
          {fileCount > 0 && t('media.files', { count: fileCount })}
        </Typography>
      </Box>

      {/* 자식 노드들 */}
      <Collapse in={isExpanded} timeout='auto' unmountOnExit>
        <Box>{children}</Box>
      </Collapse>
    </Box>
  );
}
