import { z } from 'zod';

// 미디어 폴더 스키마
export const MediaFolderSchema = z.object({
  id: z.string(),
  name: z.string(),
  path: z.string(),
  parentId: z.string().nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
});
export type MediaFolder = z.infer<typeof MediaFolderSchema>;

// API 응답용 미디어 폴더 스키마
export const MediaFolderResponseSchema = MediaFolderSchema.extend({
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type MediaFolderResponse = z.infer<typeof MediaFolderResponseSchema>;

// 미디어 항목 스키마
export const MediaItemSchema = z.object({
  id: z.string(),
  name: z.string(),
  filePath: z.string(),
  folderId: z.string().nullable(),
  duration: z.number().nullable(),
  width: z.number().int().nullable(),
  height: z.number().int().nullable(),
  codec: z.string().nullable(),
  bitrate: z.number().int().nullable(),
  fps: z.number().nullable(),
  audioCodec: z.string().nullable(),
  fileSize: z.number().int().nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
});
export type MediaItem = z.infer<typeof MediaItemSchema>;

// API 응답용 미디어 항목 스키마 (날짜를 문자열로 변환)
export const MediaItemResponseSchema = MediaItemSchema.extend({
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type MediaItemResponse = z.infer<typeof MediaItemResponseSchema>;

// 트리 노드 타입 (폴더 또는 미디어 파일)
export type MediaTreeNode = {
  id: string;
  name: string;
  type: 'folder' | 'file';
  path: string;
  folderId: string | null;
  children?: MediaTreeNode[];
  // 파일인 경우의 메타데이터
  duration?: number | null;
  width?: number | null;
  height?: number | null;
  codec?: string | null;
  bitrate?: number | null;
  fps?: number | null;
  audioCodec?: string | null;
  fileSize?: number | null;
};

export const MediaTreeNodeSchema: z.ZodType<MediaTreeNode> = z.lazy(() => z.object({
  id: z.string(),
  name: z.string(),
  type: z.enum(['folder', 'file']),
  path: z.string(),
  folderId: z.string().nullable(),
  children: z.array(MediaTreeNodeSchema).optional(),
  // 파일인 경우의 메타데이터
  duration: z.number().nullable().optional(),
  width: z.number().int().nullable().optional(),
  height: z.number().int().nullable().optional(),
  codec: z.string().nullable().optional(),
  bitrate: z.number().int().nullable().optional(),
  fps: z.number().nullable().optional(),
  audioCodec: z.string().nullable().optional(),
  fileSize: z.number().int().nullable().optional(),
}));

// /api/refresh 응답
export const RefreshMediaResponseSchema = z.object({
  success: z.literal(true),
  count: z.number().int().nonnegative(),
  media: z.array(MediaItemResponseSchema),
});
export type RefreshMediaResponse = z.infer<typeof RefreshMediaResponseSchema>;

// /api/list 응답 (평면 리스트)
export const ListMediaResponseSchema = z.object({
  success: z.literal(true),
  count: z.number().int().nonnegative(),
  media: z.array(MediaItemResponseSchema),
});
export type ListMediaResponse = z.infer<typeof ListMediaResponseSchema>;

// /api/tree 응답 (트리 구조)
export const MediaTreeResponseSchema = z.object({
  success: z.literal(true),
  tree: z.array(MediaTreeNodeSchema),
});
export type MediaTreeResponse = z.infer<typeof MediaTreeResponseSchema>;

// SSE 이벤트 타입
export const ScanEventTypeSchema = z.enum([
  'start',      // 스캔 시작
  'progress',   // 진행 상황
  'complete',   // 스캔 완료
  'error',      // 에러 발생
]);
export type ScanEventType = z.infer<typeof ScanEventTypeSchema>;

// SSE 스캔 이벤트 데이터
export const ScanProgressEventSchema = z.object({
  type: z.literal('progress'),
  current: z.number().int().nonnegative(),
  total: z.number().int().nonnegative(),
  fileName: z.string(),
});
export type ScanProgressEvent = z.infer<typeof ScanProgressEventSchema>;

export const ScanCompleteEventSchema = z.object({
  type: z.literal('complete'),
  total: z.number().int().nonnegative(),
  success: z.number().int().nonnegative(),
  failed: z.number().int().nonnegative(),
});
export type ScanCompleteEvent = z.infer<typeof ScanCompleteEventSchema>;

export const ScanStartEventSchema = z.object({
  type: z.literal('start'),
  message: z.string(),
});
export type ScanStartEvent = z.infer<typeof ScanStartEventSchema>;

export const ScanErrorEventSchema = z.object({
  type: z.literal('error'),
  message: z.string(),
});
export type ScanErrorEvent = z.infer<typeof ScanErrorEventSchema>;

export const ScanEventSchema = z.discriminatedUnion('type', [
  ScanStartEventSchema,
  ScanProgressEventSchema,
  ScanCompleteEventSchema,
  ScanErrorEventSchema,
]);
export type ScanEvent = z.infer<typeof ScanEventSchema>;

// 스트리밍 관련 타입
export const MediaInfoResponseSchema = z.object({
  success: z.literal(true),
  media: z.object({
    id: z.string(),
    name: z.string(),
    duration: z.number().nullable(),
    width: z.number().int().nullable(),
    height: z.number().int().nullable(),
    codec: z.string().nullable(),
    bitrate: z.number().int().nullable(),
    fps: z.number().nullable(),
    audioCodec: z.string().nullable(),
    fileSize: z.number().int().nullable(),
  }),
});
export type MediaInfoResponse = z.infer<typeof MediaInfoResponseSchema>;

