import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Container,
  Box,
  Card,
  CardContent,
  Typography,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TablePagination,
  Chip,
  IconButton,
  TextField,
  InputAdornment,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  CircularProgress,
  Alert,
  Tooltip,
  Paper,
  Divider,
  Stack,
  useTheme,
  alpha,
} from '@mui/material';
import {
  Search as SearchIcon,
  Refresh as RefreshIcon,
  Delete as DeleteIcon,
  Settings as SettingsIcon,
  ErrorOutline as ErrorIcon,
  Warning as WarningIcon,
  Info as InfoIcon,
  BugReport as DebugIcon,
  ArrowBack as ArrowBackIcon,
  FilterList as FilterIcon,
  CleaningServices as CleanupIcon,
} from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import type { LogItem, LogLevel, LogCategory, LogSettings } from '@videoforest/types';
import { getLogs, getLogStats, deleteLogs, getLogSettings, updateLogSettings, cleanupLogs } from '../api/logs';

// 로그 레벨 색상 및 아이콘
const levelConfig: Record<LogLevel, { color: 'error' | 'warning' | 'info' | 'secondary'; icon: React.ReactElement }> = {
  ERROR: { color: 'error', icon: <ErrorIcon fontSize="small" /> },
  WARN: { color: 'warning', icon: <WarningIcon fontSize="small" /> },
  INFO: { color: 'info', icon: <InfoIcon fontSize="small" /> },
  DEBUG: { color: 'secondary', icon: <DebugIcon fontSize="small" /> },
};

// 카테고리 라벨
const categoryLabels: Record<LogCategory, string> = {
  api: 'API',
  streaming: '스트리밍',
  media: '미디어',
  auth: '인증',
  system: '시스템',
  database: 'DB',
};

export default function LogsPage() {
  const { t } = useTranslation();
  const theme = useTheme();
  const navigate = useNavigate();

  // 상태
  const [logs, setLogs] = useState<LogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // 필터 상태
  const [search, setSearch] = useState('');
  const [levelFilter, setLevelFilter] = useState<LogLevel | ''>('');
  const [categoryFilter, setCategoryFilter] = useState<LogCategory | ''>('');
  
  // 페이지네이션
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(25);
  const [total, setTotal] = useState(0);
  
  // 통계
  const [stats, setStats] = useState<{
    total: number;
    byLevel: Record<string, number>;
    byCategory: Record<string, number>;
    last24h: number;
    last7d: number;
  } | null>(null);
  
  // 설정 다이얼로그
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settings, setSettings] = useState<LogSettings>({ retentionDays: 7, maxLogs: 10000 });
  const [savingSettings, setSavingSettings] = useState(false);
  
  // 선택된 로그 상세 보기
  const [selectedLog, setSelectedLog] = useState<LogItem | null>(null);

  // 로그 데이터 로드
  const loadLogs = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await getLogs({
        page: page + 1,
        limit: rowsPerPage,
        search: search || undefined,
        level: levelFilter || undefined,
        category: categoryFilter || undefined,
        sortOrder: 'desc',
      });
      setLogs(response.logs);
      setTotal(response.pagination.total);
    } catch {
      setError('로그를 불러오는데 실패했습니다');
    } finally {
      setLoading(false);
    }
  }, [page, rowsPerPage, search, levelFilter, categoryFilter]);

  // 통계 로드
  const loadStats = useCallback(async () => {
    try {
      const response = await getLogStats();
      setStats(response.stats);
    } catch {
      // 통계 로드 실패는 무시
    }
  }, []);

  // 설정 로드
  const loadSettings = useCallback(async () => {
    try {
      const response = await getLogSettings();
      setSettings(response.settings);
    } catch {
      // 설정 로드 실패는 기본값 유지
    }
  }, []);

  // 초기 로드
  useEffect(() => {
    loadLogs();
    loadStats();
    loadSettings();
  }, [loadLogs, loadStats, loadSettings]);

  // 필터 변경 시 페이지 리셋
  useEffect(() => {
    setPage(0);
  }, [search, levelFilter, categoryFilter]);

  // 설정 저장
  const handleSaveSettings = async () => {
    setSavingSettings(true);
    try {
      await updateLogSettings(settings);
      setSettingsOpen(false);
    } catch {
      setError('설정 저장에 실패했습니다');
    } finally {
      setSavingSettings(false);
    }
  };

  // 로그 정리
  const handleCleanup = async () => {
    if (!confirm('설정에 따라 오래된 로그를 정리합니다. 계속하시겠습니까?')) return;
    
    try {
      const response = await cleanupLogs();
      alert(`${response.deletedCount}개의 로그가 정리되었습니다.`);
      loadLogs();
      loadStats();
    } catch {
      setError('로그 정리에 실패했습니다');
    }
  };

  // 전체 삭제
  const handleDeleteAll = async () => {
    if (!confirm('모든 로그를 삭제합니다. 이 작업은 되돌릴 수 없습니다. 계속하시겠습니까?')) return;
    
    try {
      const oneYearAgo = new Date();
      oneYearAgo.setFullYear(oneYearAgo.getFullYear() + 1);
      await deleteLogs({ olderThan: oneYearAgo.toISOString() });
      loadLogs();
      loadStats();
    } catch {
      setError('로그 삭제에 실패했습니다');
    }
  };

  // 날짜 포맷
  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleString('ko-KR', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  };

  return (
    <Container maxWidth="xl" sx={{ py: 4 }}>
      {/* 헤더 */}
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 4 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <IconButton onClick={() => navigate('/media')} sx={{ mr: 1 }}>
            <ArrowBackIcon />
          </IconButton>
          <Box>
            <Typography variant="h4" fontWeight="bold">
              {t('logs.title', '시스템 로그')}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {t('logs.subtitle', '서버 활동 및 이벤트 기록')}
            </Typography>
          </Box>
        </Box>
        <Stack direction="row" spacing={1}>
          <Tooltip title="새로고침">
            <IconButton onClick={() => { loadLogs(); loadStats(); }}>
              <RefreshIcon />
            </IconButton>
          </Tooltip>
          <Tooltip title="로그 정리">
            <IconButton onClick={handleCleanup}>
              <CleanupIcon />
            </IconButton>
          </Tooltip>
          <Tooltip title="설정">
            <IconButton onClick={() => setSettingsOpen(true)}>
              <SettingsIcon />
            </IconButton>
          </Tooltip>
        </Stack>
      </Box>

      {/* 통계 카드 */}
      {stats && (
        <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 2, mb: 4 }}>
          <Card sx={{ bgcolor: alpha(theme.palette.primary.main, 0.1) }}>
            <CardContent sx={{ py: 2, '&:last-child': { pb: 2 } }}>
              <Typography variant="h4" fontWeight="bold">{stats.total.toLocaleString()}</Typography>
              <Typography variant="body2" color="text.secondary">전체 로그</Typography>
            </CardContent>
          </Card>
          <Card sx={{ bgcolor: alpha(theme.palette.error.main, 0.1) }}>
            <CardContent sx={{ py: 2, '&:last-child': { pb: 2 } }}>
              <Typography variant="h4" fontWeight="bold" color="error">{(stats.byLevel.ERROR || 0).toLocaleString()}</Typography>
              <Typography variant="body2" color="text.secondary">에러</Typography>
            </CardContent>
          </Card>
          <Card sx={{ bgcolor: alpha(theme.palette.warning.main, 0.1) }}>
            <CardContent sx={{ py: 2, '&:last-child': { pb: 2 } }}>
              <Typography variant="h4" fontWeight="bold" color="warning.main">{(stats.byLevel.WARN || 0).toLocaleString()}</Typography>
              <Typography variant="body2" color="text.secondary">경고</Typography>
            </CardContent>
          </Card>
          <Card sx={{ bgcolor: alpha(theme.palette.info.main, 0.1) }}>
            <CardContent sx={{ py: 2, '&:last-child': { pb: 2 } }}>
              <Typography variant="h4" fontWeight="bold">{stats.last24h.toLocaleString()}</Typography>
              <Typography variant="body2" color="text.secondary">24시간</Typography>
            </CardContent>
          </Card>
        </Box>
      )}

      {/* 필터 */}
      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', alignItems: 'center' }}>
            <FilterIcon color="action" />
            <TextField
              size="small"
              placeholder="메시지 검색..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchIcon fontSize="small" />
                  </InputAdornment>
                ),
              }}
              sx={{ minWidth: 250 }}
            />
            <FormControl size="small" sx={{ minWidth: 120 }}>
              <InputLabel>레벨</InputLabel>
              <Select
                value={levelFilter}
                label="레벨"
                onChange={(e) => setLevelFilter(e.target.value as LogLevel | '')}
              >
                <MenuItem value="">전체</MenuItem>
                <MenuItem value="ERROR">ERROR</MenuItem>
                <MenuItem value="WARN">WARN</MenuItem>
                <MenuItem value="INFO">INFO</MenuItem>
                <MenuItem value="DEBUG">DEBUG</MenuItem>
              </Select>
            </FormControl>
            <FormControl size="small" sx={{ minWidth: 120 }}>
              <InputLabel>카테고리</InputLabel>
              <Select
                value={categoryFilter}
                label="카테고리"
                onChange={(e) => setCategoryFilter(e.target.value as LogCategory | '')}
              >
                <MenuItem value="">전체</MenuItem>
                <MenuItem value="api">API</MenuItem>
                <MenuItem value="streaming">스트리밍</MenuItem>
                <MenuItem value="media">미디어</MenuItem>
                <MenuItem value="auth">인증</MenuItem>
                <MenuItem value="system">시스템</MenuItem>
                <MenuItem value="database">DB</MenuItem>
              </Select>
            </FormControl>
            <Box sx={{ flexGrow: 1 }} />
            <Button
              variant="outlined"
              color="error"
              size="small"
              startIcon={<DeleteIcon />}
              onClick={handleDeleteAll}
            >
              전체 삭제
            </Button>
          </Box>
        </CardContent>
      </Card>

      {/* 에러 표시 */}
      {error && (
        <Alert severity="error" sx={{ mb: 3 }}>
          {error}
        </Alert>
      )}

      {/* 로그 테이블 */}
      <Card>
        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell width={180}>시간</TableCell>
                <TableCell width={100}>레벨</TableCell>
                <TableCell width={100}>카테고리</TableCell>
                <TableCell>메시지</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={4} align="center" sx={{ py: 8 }}>
                    <CircularProgress />
                  </TableCell>
                </TableRow>
              ) : logs.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} align="center" sx={{ py: 8 }}>
                    <Typography color="text.secondary">로그가 없습니다</Typography>
                  </TableCell>
                </TableRow>
              ) : (
                logs.map((log) => (
                  <TableRow
                    key={log.id}
                    hover
                    sx={{ cursor: 'pointer' }}
                    onClick={() => setSelectedLog(log)}
                  >
                    <TableCell>
                      <Typography variant="body2" sx={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>
                        {formatDate(log.createdAt)}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Chip
                        icon={levelConfig[log.level].icon}
                        label={log.level}
                        color={levelConfig[log.level].color}
                        size="small"
                        variant="outlined"
                      />
                    </TableCell>
                    <TableCell>
                      <Chip
                        label={categoryLabels[log.category] || log.category}
                        size="small"
                        variant="filled"
                        sx={{ bgcolor: alpha(theme.palette.primary.main, 0.1) }}
                      />
                    </TableCell>
                    <TableCell>
                      <Typography
                        variant="body2"
                        sx={{
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                          maxWidth: 600,
                          fontFamily: 'monospace',
                          fontSize: '0.85rem',
                        }}
                      >
                        {log.message}
                      </Typography>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </TableContainer>
        <TablePagination
          component="div"
          count={total}
          page={page}
          onPageChange={(_, newPage) => setPage(newPage)}
          rowsPerPage={rowsPerPage}
          onRowsPerPageChange={(e) => {
            setRowsPerPage(parseInt(e.target.value, 10));
            setPage(0);
          }}
          rowsPerPageOptions={[10, 25, 50, 100]}
          labelRowsPerPage="페이지당 행"
          labelDisplayedRows={({ from, to, count }) => `${from}-${to} / ${count}`}
        />
      </Card>

      {/* 로그 상세 다이얼로그 */}
      <Dialog open={!!selectedLog} onClose={() => setSelectedLog(null)} maxWidth="md" fullWidth>
        <DialogTitle>
          로그 상세
          {selectedLog && (
            <Chip
              icon={levelConfig[selectedLog.level].icon}
              label={selectedLog.level}
              color={levelConfig[selectedLog.level].color}
              size="small"
              sx={{ ml: 2 }}
            />
          )}
        </DialogTitle>
        <DialogContent dividers>
          {selectedLog && (
            <Stack spacing={2}>
              <Box>
                <Typography variant="caption" color="text.secondary">시간</Typography>
                <Typography variant="body1" fontFamily="monospace">
                  {formatDate(selectedLog.createdAt)}
                </Typography>
              </Box>
              <Divider />
              <Box>
                <Typography variant="caption" color="text.secondary">카테고리</Typography>
                <Typography variant="body1">
                  {categoryLabels[selectedLog.category] || selectedLog.category}
                </Typography>
              </Box>
              <Divider />
              <Box>
                <Typography variant="caption" color="text.secondary">메시지</Typography>
                <Paper variant="outlined" sx={{ p: 2, mt: 1, bgcolor: 'background.default' }}>
                  <Typography
                    variant="body2"
                    sx={{ fontFamily: 'monospace', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}
                  >
                    {selectedLog.message}
                  </Typography>
                </Paper>
              </Box>
              {selectedLog.meta && (
                <>
                  <Divider />
                  <Box>
                    <Typography variant="caption" color="text.secondary">메타데이터</Typography>
                    <Paper variant="outlined" sx={{ p: 2, mt: 1, bgcolor: 'background.default' }}>
                      <Typography
                        component="pre"
                        variant="body2"
                        sx={{ fontFamily: 'monospace', whiteSpace: 'pre-wrap', wordBreak: 'break-all', m: 0 }}
                      >
                        {JSON.stringify(JSON.parse(selectedLog.meta), null, 2)}
                      </Typography>
                    </Paper>
                  </Box>
                </>
              )}
            </Stack>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setSelectedLog(null)}>닫기</Button>
        </DialogActions>
      </Dialog>

      {/* 설정 다이얼로그 */}
      <Dialog open={settingsOpen} onClose={() => setSettingsOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>로그 설정</DialogTitle>
        <DialogContent dividers>
          <Stack spacing={3} sx={{ pt: 1 }}>
            <TextField
              label="보관 기간 (일)"
              type="number"
              value={settings.retentionDays}
              onChange={(e) => setSettings({ ...settings, retentionDays: parseInt(e.target.value, 10) || 7 })}
              helperText="지정된 기간이 지난 로그는 자동 정리 시 삭제됩니다"
              inputProps={{ min: 1, max: 365 }}
              fullWidth
            />
            <TextField
              label="최대 로그 수"
              type="number"
              value={settings.maxLogs}
              onChange={(e) => setSettings({ ...settings, maxLogs: parseInt(e.target.value, 10) || 10000 })}
              helperText="최대 개수를 초과하면 가장 오래된 로그부터 삭제됩니다"
              inputProps={{ min: 100, max: 1000000 }}
              fullWidth
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setSettingsOpen(false)}>취소</Button>
          <Button
            variant="contained"
            onClick={handleSaveSettings}
            disabled={savingSettings}
          >
            {savingSettings ? '저장 중...' : '저장'}
          </Button>
        </DialogActions>
      </Dialog>
    </Container>
  );
}

