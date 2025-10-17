import { useState, useEffect } from 'react';
import { Container, Card, CardContent, CircularProgress, Alert, Box } from '@mui/material';
import { useMediaStore } from '../stores/mediaStore';
import MediaHeader from '../components/media/MediaHeader';
import MediaTreeNode from '../components/media/MediaTreeNode';
import EmptyMediaState from '../components/media/EmptyMediaState';
import ScanDialog from '../components/ScanDialog';

export default function MediaListPage() {
  const { mediaTree, loading, error, loadMediaTree } = useMediaStore();
  const [scanDialogOpen, setScanDialogOpen] = useState(false);

  useEffect(() => {
    loadMediaTree();
  }, [loadMediaTree]);

  return (
    <Container maxWidth='xl' sx={{ py: 4 }}>
      {/* 헤더 */}
      <MediaHeader onScanClick={() => setScanDialogOpen(true)} />

      {/* 로딩 상태 */}
      {loading && (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
          <CircularProgress size={60} />
        </Box>
      )}

      {/* 에러 상태 */}
      {!loading && error && (
        <Alert severity='error' sx={{ mb: 4 }}>
          {error}
        </Alert>
      )}

      {/* 빈 상태 */}
      {!loading && !error && mediaTree.length === 0 && <EmptyMediaState />}

      {/* 트리뷰 */}
      {!loading && !error && mediaTree.length > 0 && (
        <Card>
          <CardContent>
            {mediaTree.map(node => (
              <MediaTreeNode key={node.id} node={node} />
            ))}
          </CardContent>
        </Card>
      )}

      {/* 스캔 다이얼로그 */}
      <ScanDialog open={scanDialogOpen} onClose={() => setScanDialogOpen(false)} onComplete={loadMediaTree} />
    </Container>
  );
}
