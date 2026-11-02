import React from 'react';

/**
 * NiuHead —— 「牛」字象形图形（金文风格笔画），品牌方块内使用。
 *
 * 双角上仰内拢、中笔短竖、横笔两端上挑、竖笔下展收尖，笔画跟随容器 currentColor（var(--gold)）。
 * 与 .brand-mark 方块配合：svg 占方块约 72%，右上角 AI 气泡由 .mark-ai 承担。
 */
const NiuHead: React.FC<{ className?: string }> = ({ className }) => (
  <svg className={className} viewBox="0 0 48 48" aria-hidden="true" focusable="false">
    {/* 左角 */}
    <path d="M15.5 3.5 C11 7.5 9.5 13 12.5 17 C14.2 19.3 17.5 21.5 22 23.5" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
    {/* 右角（镜像） */}
    <path d="M32.5 3.5 C37 7.5 38.5 13 35.5 17 C33.8 19.3 30.5 21.5 26 23.5" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
    {/* 中笔：两角之间的短竖 */}
    <path d="M24 6 L24 22.5" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
    {/* 横笔：两端上挑 */}
    <path d="M6.5 23.5 C8.5 26 11 26.8 14 26.8 L34 26.8 C37 26.8 39.5 26 41.5 23.5" fill="none" stroke="currentColor" strokeWidth="3.4" strokeLinecap="round" />
    {/* 竖笔：向下展笔收尖 */}
    <path d="M22.2 25 L25.8 25 L24.8 43 Q24 45.4 23.2 43 Z" fill="currentColor" />
  </svg>
);

export default NiuHead;
