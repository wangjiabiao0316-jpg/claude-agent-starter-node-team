import React from 'react';

/**
 * NiuHead —— 牛头剪影（无框 logo 图形）。
 *
 * 实心剪影：双长角上扬外展、两侧尖耳、面部收窄至吻部，双眼为镂空缝形
 * （fillRule=evenodd 挖洞，透出底色）。笔画/填充跟随容器 currentColor（var(--gold)）。
 * 与 .brand-mark（无边框）配合，右上角 AI 气泡由 .mark-ai 承担。
 */
const NiuHead: React.FC<{ className?: string }> = ({ className }) => (
  <svg className={className} viewBox="0 0 48 48" aria-hidden="true" focusable="false">
    <path
      fill="currentColor"
      fillRule="evenodd"
      d="M5.5 3.5
         C2.8 9 2.6 17 6.3 23.2
         L3.2 26.8
         C5 27.9 7.2 28.9 9.8 29.9
         C11.4 33.6 12.8 37.4 14.2 41
         Q14.8 44.2 17.5 44.2
         L30.5 44.2
         Q33.2 44.2 33.8 41
         C35.2 37.4 36.6 33.6 38.2 29.9
         C40.8 28.9 43 27.9 44.8 26.8
         L41.7 23.2
         C45.4 17 45.2 9 42.5 3.5
         C39.8 8.8 37 13.8 33.8 18.4
         Q29.5 23.6 24 23.6
         Q18.5 23.6 14.2 18.4
         C11 13.8 8.2 8.8 5.5 3.5
         Z
         M14.2 26.4 Q18.4 24.9 21.6 26.6 Q18.2 29.2 14.2 26.4 Z
         M26.4 26.6 Q29.6 24.9 33.8 26.4 Q29.8 29.2 26.4 26.6 Z"
    />
  </svg>
);

export default NiuHead;
