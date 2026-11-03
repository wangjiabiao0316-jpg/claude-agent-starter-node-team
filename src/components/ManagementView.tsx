import React, { MouseEvent, useMemo } from 'react';
import type { ConversationSummary } from '../types';
import { useT } from '../i18n';
import ParticleField from './ParticleField';

/**
 * ManagementView — V4.0 大气版项目管理屏（pm-layout 三栏）。
 *
 *   左 .pm-history   —— 历史项目列表（真实 conversations CRUD：选中/删除/加载更多）
 *   中 .pm-main      —— 选中档案详情（标题 / 预览 / 创建·更新时间 / 打开档案）
 *   右 .pm-create    —— 新建项目卡（径向渐变 + 双圆环 + 球面粒子场 + 金色 ＋）
 *
 * V3.0 的 ConversationSidebar 组件退役，本组件内联等价交互逻辑
 * （stopPropagation 删除、disabled 熔断、加载更多分页）。
 * 评级位 pm-grade 无真实数据源，显示中性「—」，不伪造评级。
 */
interface Props {
  /** 页眉主题词后缀：当前选中项目名（App.tsx projectLabel） */
  activeProjectName: string;
  conversations: ConversationSummary[];
  activeConversationId: string;
  loading: boolean;
  loadingMore: boolean;
  hasMore: boolean;
  disabled: boolean;
  onSelect: (id: string) => void;
  /** 点击空白处/再次点击选中项：取消选中，回到未选中模板态 */
  onDeselect: () => void;
  onCreate: () => void;
  onLoadMore: () => void;
  onDelete: (id: string) => void;
}

function formatTimestamp(ts: number | undefined, lang: string): string {
  if (!ts || !Number.isFinite(ts)) return '—';
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString(lang === 'zh' ? 'zh-CN' : 'en-US', {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  });
}

export const ManagementView: React.FC<Props> = (props) => {
  const { conversations, activeConversationId, disabled, activeProjectName } = props;
  const { t, lang } = useT();
  const active = conversations.find((c) => c.id === activeConversationId);

  const items = useMemo(
    () => conversations.map((c) => ({
      ...c,
      timeText: formatTimestamp(c.lastMessageAt ?? c.createdAt, lang),
    })),
    [conversations, lang],
  );

  const handleDeleteClick = (event: MouseEvent<HTMLButtonElement>, id: string) => {
    event.stopPropagation();
    event.preventDefault();
    if (disabled) return;
    props.onDelete(id);
  };

  // 空白处（页眉/左右面板/新建卡以外）点击 → 取消项目选中
  const handleBlankClick = (event: MouseEvent<HTMLElement>) => {
    if ((event.target as HTMLElement).closest('.panel, .pm-create, .page-head')) return;
    props.onDeselect();
  };

  return (
    <section className="screen active management-screen" onClick={handleBlankClick}>
      <div className="shell">
        <div className="page-head">
          <div>
            <h1>
              {t('management.title')}
              <span className="page-head-proj">——{activeProjectName}</span>
            </h1>
            <p>Project Asset Summary</p>
          </div>
        </div>

        <div className="pm-layout">
          {/* —— 左：历史项目（真实会话列表） —— */}
          <div className="panel pm-history">
            <div className="panel-head">
              <div>
                <div className="panel-title">{t('sidebar.title')}</div>
              </div>
              <button
                type="button"
                className="btn"
                onClick={props.onCreate}
                disabled={disabled}
              >
                ＋ {t('sidebar.newChat')}
              </button>
            </div>

            <div className="pm-history-list">
              {items.length === 0 ? (
                props.loading ? null : (
                  <div className="pm-empty">
                    {t('sidebar.emptyTitle')} — {t('sidebar.emptyHint')}
                  </div>
                )
              ) : (
                items.map((c) => {
                  const isActive = c.id === activeConversationId;
                  return (
                    <div
                      key={c.id}
                      className={`pm-history-item ${isActive ? 'active' : ''}`}
                      role="button"
                      tabIndex={0}
                      aria-current={isActive ? 'true' : 'false'}
                      onClick={() => {
                        if (disabled) return;
                        // 再次点击已选中项 = 取消选中（与空白处点击等效）
                        if (isActive) {
                          props.onDeselect();
                          return;
                        }
                        props.onSelect(c.id);
                      }}
                      onKeyDown={(e) => {
                        if ((e.key === 'Enter' || e.key === ' ') && !disabled && !isActive) {
                          e.preventDefault();
                          props.onSelect(c.id);
                        }
                      }}
                    >
                      <div style={{ minWidth: 0 }}>
                        {/* 块级 + maxWidth 才能让长项目名在左栏卡片内截断，不超出模块框 */}
                        <b style={{ display: 'block', maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.title}</b>
                        <small style={{ display: 'block', maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.preview || c.timeText}</small>
                      </div>
                      <span className="pm-grade" title={t('sidebar.delete')} style={{ cursor: 'default' }}>—</span>
                      <button
                        type="button"
                        className="tag bad"
                        onClick={(e) => handleDeleteClick(e, c.id)}
                        disabled={disabled}
                        aria-label={t('sidebar.delete')}
                        title={t('sidebar.delete')}
                        style={{ padding: '3px 6px', flex: 'none' }}
                      >
                        ✕
                      </button>
                    </div>
                  );
                })
              )}
            </div>

            {props.hasMore && items.length > 0 && (
              <div className="pm-history-foot">
                <button
                  type="button"
                  className="btn ghost"
                  style={{ width: '100%' }}
                  onClick={props.onLoadMore}
                  disabled={props.loadingMore || disabled}
                >
                  {props.loadingMore ? t('sidebar.loadingMore') : t('sidebar.loadMore')}
                </button>
              </div>
            )}
          </div>

          {/* —— 中：档案详情 —— */}
          <div className="panel pm-main">
            <div className="pm-main-top">
              <div style={{ minWidth: 0 }}>
                <p className="eyebrow">{t('management.eyebrow')}</p>
                <h2 style={{ fontSize: 20, margin: '6px 0 0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {active ? active.title : t('management.emptyTitle')}
                </h2>
              </div>
              {active && <span className="tag neutral">{t('management.updatedAt')}</span>}
            </div>

            {active ? (
              <>
                <div className="pm-stats">
                  <div className="pm-stat">
                    <span>{t('management.updatedAt')}</span>
                    <b>{formatTimestamp(active.lastMessageAt ?? active.createdAt, lang)}</b>
                  </div>
                  <div className="pm-stat">
                    <span>{lang === 'zh' ? '建档时间' : 'Created'}</span>
                    <b>{formatTimestamp(active.createdAt, lang)}</b>
                  </div>
                </div>
                <div className="pm-decision">
                  <p className="eyebrow" style={{ marginBottom: 8 }}>PREVIEW</p>
                  <p style={{ fontSize: 12, lineHeight: 1.9, color: '#c2ced7', margin: 0 }}>
                    {active.preview || t('management.summaryHint')}
                  </p>
                </div>
                <button
                  type="button"
                  className="btn primary"
                  onClick={() => props.onSelect(active.id)}
                  disabled={disabled}
                >
                  {t('management.summaryHint').slice(0, lang === 'zh' ? 6 : 20)} →
                </button>
              </>
            ) : (
              <div className="pm-empty" style={{ padding: 22, fontSize: 11 }}>
                {t('management.emptyHint')}
              </div>
            )}
          </div>

          {/* —— 右：新建项目（粒子卡） —— */}
          <div className="pm-create" role="button" tabIndex={0} onClick={() => !disabled && props.onCreate()} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); props.onCreate(); } }}>
            <ParticleField variant="create" />
            <div className="pm-create-content">
              <p className="eyebrow">NEW PROJECT</p>
              <div className="pm-plus">＋</div>
              <h2>{t('management.createLabel')}</h2>
              <p>{t('transition.subtitle')}</p>
              <span className="btn primary" style={{ display: 'inline-block' }}>
                {t('sidebar.newChat')} →
              </span>
              <p className="dim" style={{ fontSize: 9, letterSpacing: 2, marginTop: 18 }}>
                {t('management.createFoot')}
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default ManagementView;
