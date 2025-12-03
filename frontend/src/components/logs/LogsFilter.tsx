import { useTranslation } from 'react-i18next';
import { Box, Button, Card, CardContent, FormControl, InputAdornment, InputLabel, MenuItem, Select, TextField } from '@mui/material';
import { Search as SearchIcon, Delete as DeleteIcon, FilterList as FilterIcon } from '@mui/icons-material';
import type { LogLevel, LogCategory } from '@videoforest/types';

interface LogsFilterProps {
  search: string;
  levelFilter: LogLevel | '';
  categoryFilter: LogCategory | '';
  onSearchChange: (search: string) => void;
  onLevelFilterChange: (level: LogLevel | '') => void;
  onCategoryFilterChange: (category: LogCategory | '') => void;
  onDeleteAll: () => void;
}

export default function LogsFilter({
  search,
  levelFilter,
  categoryFilter,
  onSearchChange,
  onLevelFilterChange,
  onCategoryFilterChange,
  onDeleteAll,
}: LogsFilterProps) {
  const { t } = useTranslation();

  return (
    <Card sx={{ mb: 3 }}>
      <CardContent>
        <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', alignItems: 'center' }}>
          <FilterIcon color='action' />
          <TextField
            size='small'
            placeholder={t('logs.search')}
            value={search}
            onChange={e => onSearchChange(e.target.value)}
            InputProps={{
              startAdornment: (
                <InputAdornment position='start'>
                  <SearchIcon fontSize='small' />
                </InputAdornment>
              ),
            }}
            sx={{ minWidth: 250 }}
          />
          <FormControl size='small' sx={{ minWidth: 120 }}>
            <InputLabel>{t('logs.level')}</InputLabel>
            <Select value={levelFilter} label={t('logs.level')} onChange={e => onLevelFilterChange(e.target.value as LogLevel | '')}>
              <MenuItem value=''>{t('logs.all')}</MenuItem>
              <MenuItem value='ERROR'>ERROR</MenuItem>
              <MenuItem value='WARN'>WARN</MenuItem>
              <MenuItem value='INFO'>INFO</MenuItem>
              <MenuItem value='DEBUG'>DEBUG</MenuItem>
            </Select>
          </FormControl>
          <FormControl size='small' sx={{ minWidth: 120 }}>
            <InputLabel>{t('logs.category')}</InputLabel>
            <Select
              value={categoryFilter}
              label={t('logs.category')}
              onChange={e => onCategoryFilterChange(e.target.value as LogCategory | '')}
            >
              <MenuItem value=''>{t('logs.all')}</MenuItem>
              <MenuItem value='api'>{t('logs.categories.api')}</MenuItem>
              <MenuItem value='streaming'>{t('logs.categories.streaming')}</MenuItem>
              <MenuItem value='media'>{t('logs.categories.media')}</MenuItem>
              <MenuItem value='auth'>{t('logs.categories.auth')}</MenuItem>
              <MenuItem value='system'>{t('logs.categories.system')}</MenuItem>
              <MenuItem value='database'>{t('logs.categories.database')}</MenuItem>
            </Select>
          </FormControl>
          <Box sx={{ flexGrow: 1 }} />
          <Button variant='outlined' color='error' size='small' startIcon={<DeleteIcon />} onClick={onDeleteAll}>
            {t('logs.deleteAll')}
          </Button>
        </Box>
      </CardContent>
    </Card>
  );
}
