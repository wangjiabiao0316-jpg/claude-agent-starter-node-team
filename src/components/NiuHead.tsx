import React from 'react';

/**
 * NiuHead —— 卡通矢量牛头（品牌方块内使用）。
 *
 * 金色填充脸 + 弯角/耳朵描边，五官用深底色（跟随容器 currentColor=var(--gold)）。
 * 与 .brand-mark 方块配合：svg 占方块约 72%，右上角 AI 气泡由 .mark-ai 承担。
 */
const NiuHead: React.FC<{ className?: string }> = ({ className }) => (
  <svg className={className} viewBox="0 0 48 48" aria-hidden="true" focusable="false">
    {/* 弯角 */}
    <path d="M12 15 Q5 11 7 4.5 Q13 6.5 15.5 11.5" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" />
    <path d="M36 15 Q43 11 41 4.5 Q35 6.5 32.5 11.5" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" />
    {/* 耳朵 */}
    <ellipse cx="8.5" cy="19.5" rx="4.6" ry="3.4" fill="currentColor" opacity=".85" />
    <ellipse cx="39.5" cy="19.5" rx="4.6" ry="3.4" fill="currentColor" opacity=".85" />
    {/* 脸 */}
    <rect x="10" y="11.5" width="28" height="27.5" rx="12.5" fill="currentColor" />
    {/* 额头斑纹 */}
    <path d="M24 12.5 L21.5 17 L24 21 L26.5 17 Z" fill="#14212c" opacity=".28" />
    {/* 眼睛 */}
    <circle cx="18.3" cy="22.5" r="2.2" fill="#14212c" />
    <circle cx="29.7" cy="22.5" r="2.2" fill="#14212c" />
    {/* 口鼻区 */}
    <ellipse cx="24" cy="31.5" rx="9.6" ry="6.8" fill="#14212c" opacity=".24" />
    <ellipse cx="20.6" cy="31.5" rx="1.8" ry="2.4" fill="#14212c" />
    <ellipse cx="27.4" cy="31.5" rx="1.8" ry="2.4" fill="#14212c" />
  </svg>
);

export default NiuHead;
