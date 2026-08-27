import type { ProjectDraft } from './types.js';

export const validDraft: ProjectDraft = {
  id: 'ice-world',
  title: '全球冰封',
  startNodeId: 'start',
  updatedAt: '2026-08-20T00:00:00.000Z',
  assets: [
    { id: 'video-start', fileName: 'start.mp4', objectKey: 'assets/start.mp4', url: '/media/start.mp4', duration: 10, status: 'available' },
    { id: 'video-left', fileName: 'left.mp4', objectKey: 'assets/left.mp4', url: '/media/left.mp4', duration: 8, status: 'available' },
    { id: 'video-right', fileName: 'right.mp4', objectKey: 'assets/right.mp4', url: '/media/right.mp4', duration: 9, status: 'available' },
    { id: 'video-ending', fileName: 'ending.mp4', objectKey: 'assets/ending.mp4', url: '/media/ending.mp4', duration: 12, status: 'available' },
  ],
  nodes: [
    {
      id: 'start', title: '暴雪来临', type: 'normal', scriptText: '暴雪吞没了城市。',
      videoAssetId: 'video-start', position: { x: 0, y: 0 },
      choices: [
        { id: 'go-left', text: '留在家中', targetNodeId: 'left', order: 0 },
        { id: 'go-right', text: '外出寻找物资', targetNodeId: 'right', order: 1 },
      ],
    },
    {
      id: 'left', title: '固守', type: 'normal', scriptText: '封闭门窗。',
      videoAssetId: 'video-left', position: { x: -200, y: 180 },
      choices: [{ id: 'left-end', text: '等待救援', targetNodeId: 'ending', order: 0 }],
    },
    {
      id: 'right', title: '搜寻', type: 'normal', scriptText: '走进超市。',
      videoAssetId: 'video-right', position: { x: 200, y: 180 },
      choices: [{ id: 'right-end', text: '返回住处', targetNodeId: 'ending', order: 0 }],
    },
    {
      id: 'ending', title: '获救', type: 'ending', scriptText: '救援队终于抵达。',
      videoAssetId: 'video-ending', position: { x: 0, y: 360 }, choices: [],
    },
  ],
};
