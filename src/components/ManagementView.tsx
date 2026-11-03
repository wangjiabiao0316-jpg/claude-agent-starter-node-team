import React, { MouseEvent, useMemo, useState } from 'react';
import type { ConversationSummary } from '../types';
import { useT } from '../i18n';
import ParticleField from './ParticleField';

/**
 * ManagementView — V4.0 大气版项目管理屏（pm-layout 三栏）。
 *
 *   左 .pm-history   —— 历史项目列表（真实 conversations CRUD：选中/删除/加载更多）
 *                       + 项目组分组（前端 localStorage 持久化，后端无分组 API）：
 *                       新建组 / 会话归组 / 按模型提炼名智能归组 / 组折叠与删除
 *   中 .pm-main      —— 选中档案详情（标题 / 预览 / 创建·更新时间 / 打开档案）
 *   右 .pm-create    —— 新建项目卡（径向渐变 + 双圆环 + 球面粒子场 + 金色 ＋）
 *
 * V3.0 的 ConversationSidebar 组件退役，本组件内联等价交互逻辑
 * （stopPropagation 删除、disabled 熔断、加载更多分页）。
 * 评级位 pm-grade 无真实数据源，显示中性「—」，不伪造评级。
 */

/** 项目组（前端持久化；组内成员关系见 convGroup 映射） */
export interface ProjectGroup {
  id: string;
  name: string;
}

type GroupedItem = ConversationSummary & { timeText: string };

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
  /** 项目组：组表 + 会话归组映射（App.tsx localStorage 持久化） */
  groups: ProjectGroup[];
  convGroup: Record<string, string>;
  onCreateGroup: (name: string) => void;
  /** groupId 为 null 表示移出组 */
  onAssignGroup: (convId: string, groupId: string | null) => void;
  /** 删组：组内会话回到未分组（App.tsx 负责清映射） */
  onDeleteGroup: (groupId: string) => void;
  /** 智能归组：按模型提炼项目名把会话归入同名组 */
  onAutoGroup: () => void;
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

  // 项目组本地交互态：新建组输入框、组折叠状态
  const [showGroupInput, setShowGroupInput] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});

  const items = useMemo(
    () => conversations.map((c) => ({
      ...c,
      timeText: formatTimestamp(c.lastMessageAt ?? c.createdAt, lang),
    })),
    [conversations, lang],
  );

  // 分组视图：组表（空组也显示，让新建的组立即可见）+ 未分组项
  const grouped = useMemo(() => ({
    groups: props.groups.map((g) => ({
      group: g,
      members: items.filter((c) => props.convGroup[c.id] === g.id),
    })),
    ungrouped: items.filter((c) => !props.convGroup[c.id]),
  }), [items, props.groups, props.convGroup]);

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

  const submitNewGroup = () => {
    if (newGroupName.trim()) props.onCreateGroup(newGroupName);
    setNewGroupName('');
    setShowGroupInput(false);
  };

  /** 单个会话卡片（平铺区与组内区共用） */
  const renderConvItem = (c: GroupedItem) => {
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
        {!disabled && (
          <details
            className="pm-assign"
            onClick={(e) => e.stopPropagation() /* 展开/选择归组时不触发卡片选中 */}
          >
            <summary className="pm-assign-btn" title={lang === 'zh' ? '归入项目组' : 'Assign to group'} aria-label={lang === 'zh' ? '归入项目组' : 'Assign to group'}>▦</summary>
            <div
              className="pm-assign-pop"
              onClick={(e) => {
                // 选中即收起
                const menu = (e.target as HTMLElement).closest('details');
                if (menu) menu.removeAttribute('open');
              }}
            >
              {props.groups.length === 0 && (
                <div className="pm-assign-empty">{lang === 'zh' ? '先「新建项目组」' : 'Create a group first'}</div>
              )}
              {props.groups.map((g) => (
                <button
                  key={g.id}
                  type="button"
                  className="pm-assign-item"
                  onClick={() => props.onAssignGroup(c.id, g.id)}
                >
                  {props.convGroup[c.id] === g.id ? '● ' : ''}{g.name}
                </button>
              ))}
              {props.convGroup[c.id] && (
                <button
                  type="button"
                  className="pm-assign-item bad"
                  onClick={() => props.onAssignGroup(c.id, null)}
                >
                  {lang === 'zh' ? '移出组' : 'Remove from group'}
                </button>
              )}
            </div>
          </details>
        )}
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
  };

  const toggleGroup = (groupId: string) => {
    setCollapsedGroups(prev => ({ ...prev, [groupId]: !prev[groupId] }));
  };

  const hasAnyContent = items.length > 0 || props.groups.length > 0;

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
          {/* —— 左：历史项目（真实会话列表 + 项目组分组） —— */}
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

            {/* 项目组工具行：新建组 / 按模型提炼名智能归组 */}
            <div className="pm-group-tools">
              <button
                type="button"
                className="btn ghost"
                onClick={() => setShowGroupInput(s => !s)}
                disabled={disabled}
              >
                ＋ {lang === 'zh' ? '新建项目组' : 'New group'}
              </button>
              <button
                type="button"
                className="btn ghost"
                onClick={props.onAutoGroup}
                disabled={disabled}
                title={lang === 'zh' ? '按模型提炼的项目名，把相同项目的对话归入同一组' : 'Group conversations by distilled project name'}
              >
                ⚡ {lang === 'zh' ? '按项目归组' : 'Auto group'}
              </button>
            </div>
            {showGroupInput && (
              <div className="pm-newgroup-row">
                <input
                  value={newGroupName}
                  onChange={(e) => setNewGroupName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') submitNewGroup();
                    if (e.key === 'Escape') { setShowGroupInput(false); setNewGroupName(''); }
                  }}
                  placeholder={lang === 'zh' ? '输入项目组名，回车确认（Esc 取消）' : 'Group name, Enter to confirm'}
                  autoFocus
                />
              </div>
            )}

            <div className="pm-history-list">
              {!hasAnyContent ? (
                props.loading ? null : (
                  <div className="pm-empty">
                    {t('sidebar.emptyTitle')} — {t('sidebar.emptyHint')}
                  </div>
                )
              ) : (
                <>
                  {/* 项目组区：组头（折叠/成员数/删组）+ 组内会话 */}
                  {grouped.groups.map(({ group, members }) => (
                    <div key={group.id} className="pm-group">
                      <div
                        className="pm-group-head"
                        role="button"
                        tabIndex={0}
                        aria-expanded={!collapsedGroups[group.id]}
                        onClick={() => toggleGroup(group.id)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            toggleGroup(group.id);
                          }
                        }}
                      >
                        <span className="pm-group-caret">{collapsedGroups[group.id] ? '▸' : '▾'}</span>
                        <span className="pm-group-name">{group.name}</span>
                        <span className="pm-group-count">{members.length}</span>
                        <button
                          type="button"
                          className="pm-group-del"
                          aria-label={lang === 'zh' ? '删除组' : 'Delete group'}
                          title={lang === 'zh' ? '删除组（组内会话回到未分组）' : 'Delete group (members become ungrouped)'}
                          onClick={(e) => { e.stopPropagation(); props.onDeleteGroup(group.id); }}
                        >
                          ✕
                        </button>
                      </div>
                      {!collapsedGroups[group.id] && (
                        <div className="pm-group-list">
                          {members.length === 0 ? (
                            <div className="pm-group-empty">{lang === 'zh' ? '组内暂无对话' : 'No conversations yet'}</div>
                          ) : (
                            members.map(renderConvItem)
                          )}
                        </div>
                      )}
                    </div>
                  ))}

                  {/* 未分组区：仅当存在组时显示组头，否则平铺 */}
                  {grouped.ungrouped.length > 0 && (
                    <div className="pm-group">
                      {grouped.groups.length > 0 && (
                        <div className="pm-group-head plain">
                          <span className="pm-group-name">{lang === 'zh' ? '未分组' : 'Ungrouped'}</span>
                          <span className="pm-group-count">{grouped.ungrouped.length}</span>
                        </div>
                      )}
                      {grouped.ungrouped.map(renderConvItem)}
                    </div>
                  )}
                </>
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
