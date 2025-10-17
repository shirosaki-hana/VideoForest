import { useEffect, useState, useRef } from 'react';
import { Dialog, DialogTitle, DialogContent, DialogActions, Button, LinearProgress, Typography, Box, Alert } from '@mui/material';
import { useTranslation } from 'react-i18next';
import { scanMediaLibrary } from '../api/media';
import type { ScanEvent } from '@videoforest/types';

interface ScanDialogProps {
  open: boolean;
  onClose: () => void;
  onComplete?: () => void;
}

export default function ScanDialog({ open, onClose, onComplete }: ScanDialogProps) {
  const { t } = useTranslation();
  const [status, setStatus] = useState<'idle' | 'scanning' | 'complete' | 'error'>('idle');
  const [current, setCurrent] = useState(0);
  const [total, setTotal] = useState(0);
  const [fileName, setFileName] = useState('');
  const [result, setResult] = useState<{
    total: number;
    success: number;
    failed: number;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  // onComplete를 ref로 저장하여 의존성 배열에서 제거
  const onCompleteRef = useRef(onComplete);
  useEffect(() => {
    onCompleteRef.current = onComplete;
  }, [onComplete]);

  // 다이얼로그가 열릴 때 스캔 시작
  useEffect(() => {
    if (!open) {
      return;
    }

    const cleanup = scanMediaLibrary(
      (event: ScanEvent) => {
        switch (event.type) {
          case 'start':
            setStatus('scanning');
            break;

          case 'progress':
            setCurrent(event.current);
            setTotal(event.total);
            setFileName(event.fileName);
            break;

          case 'complete':
            setStatus('complete');
            setResult({
              total: event.total,
              success: event.success,
              failed: event.failed,
            });
            // ref를 통해 최신 onComplete 호출
            if (onCompleteRef.current) {
              onCompleteRef.current();
            }
            break;

          case 'error':
            setStatus('error');
            setError(event.message);
            break;
        }
      },
      err => {
        setStatus('error');
        setError(err.message);
      }
    );

    return () => {
      cleanup();
    };
  }, [open]); // onComplete를 의존성 배열에서 제거

  const handleClose = () => {
    if (status === 'scanning') {
      // 스캔 중에는 닫지 않음
      return;
    }
    onClose();
  };

  // 다이얼로그 트랜지션이 완료된 후 상태 초기화
  const handleExited = () => {
    setStatus('idle');
    setCurrent(0);
    setTotal(0);
    setFileName('');
    setResult(null);
    setError(null);
  };

  const progress = total > 0 ? (current / total) * 100 : 0;

  return (
    <Dialog open={open} onClose={handleClose} maxWidth='sm' fullWidth TransitionProps={{ onExited: handleExited }}>
      <DialogTitle>{t('media.scanDialog.title')}</DialogTitle>
      <DialogContent>
        <Box sx={{ py: 2 }}>
          {status === 'scanning' && (
            <>
              <Typography variant='body2' color='text.secondary' gutterBottom>
                {t('media.scanDialog.scanning')}
              </Typography>
              <LinearProgress variant={total > 0 ? 'determinate' : 'indeterminate'} value={progress} sx={{ my: 2 }} />
              {total > 0 && (
                <>
                  <Typography variant='body2' align='center' gutterBottom>
                    {t('media.scanDialog.progress', { current, total })}
                  </Typography>
                  <Typography
                    variant='caption'
                    color='text.secondary'
                    sx={{
                      display: 'block',
                      textAlign: 'center',
                      mt: 1,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {t('media.scanDialog.currentFile')}: {fileName}
                  </Typography>
                </>
              )}
            </>
          )}

          {status === 'complete' && result && (
            <Alert severity='success' sx={{ mb: 2 }}>
              <Typography variant='body2' gutterBottom>
                {t('media.scanDialog.complete')}
              </Typography>
              <Typography variant='caption' display='block'>
                {t('media.scanDialog.total', { count: result.total })}
              </Typography>
              <Typography variant='caption' display='block'>
                {t('media.scanDialog.success', { count: result.success })}
              </Typography>
              {result.failed > 0 && (
                <Typography variant='caption' display='block' color='warning.main'>
                  {t('media.scanDialog.failed', { count: result.failed })}
                </Typography>
              )}
            </Alert>
          )}

          {status === 'error' && (
            <Alert severity='error'>
              <Typography variant='body2'>{t('media.scanDialog.error')}</Typography>
              {error && (
                <Typography variant='caption' display='block' sx={{ mt: 1 }}>
                  {error}
                </Typography>
              )}
            </Alert>
          )}
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={handleClose} disabled={status === 'scanning'} variant='contained'>
          {t('media.scanDialog.close')}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
