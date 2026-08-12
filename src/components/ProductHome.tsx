import React from 'react';
import { useT } from '../i18n';
import ParticleField from './ParticleField';
import styles from './ProductHome.module.css';

/**
 * ProductHome — 产品首页(固定展示页)。
 *
 * 触发方式:点击 header 左上角 logo / 产品名(App.tsx 的 logoBtn)后,
 * uiStage 切到 'home',本组件在 chatWindowShell 内渲染。
 *
 * 内容分三块:产品简介 / 产品价值(三卡) / 使用方法(四步)。
 * hero 区复用 i18n 的 welcome.*(eyebrow/title/subtitle),三块正文用 home.*。
 * 叠加在全局 CityScene 3D 背景之上,自身只渲染毛玻璃内容卡片。
 * 点击「开始使用」回调 onStart,由父组件 setUiStage('intake') 进入采集向导。
 */
interface ProductHomeProps {
  /** 点击「开始使用」按钮时触发,父组件据此进入 IntakeWizard */
  onStart: () => void;
}

// 使用方法五步的流程图节点定义:图标 + 短标签 + hover 完整说明
const USAGE_NODES = [
  { icon: '▸', label: 'home.usageLabel1', full: 'home.usage1' },
  { icon: '✎', label: 'home.usageLabel2', full: 'home.usage2' },
  { icon: '⚙', label: 'home.usageLabel3', full: 'home.usage3' },
  { icon: '▤', label: 'home.usageLabel4', full: 'home.usage4' },
  { icon: '↻', label: 'home.usageLabel5', full: 'home.usage5' },
] as const;

export const ProductHome: React.FC<ProductHomeProps> = ({ onStart }) => {
  const { t } = useT();

  return (
    <div className={styles.page}>
      {/* —— hero 区:复用 welcome.* —— */}
      <header className={styles.hero}>
        <p className={styles.eyebrow}>{t('welcome.eyebrow')}</p>
        <h1 className={styles.heroTitle}>{t('welcome.title')}</h1>
        <p className={styles.heroSubtitle}>{t('welcome.subtitle')}</p>
      </header>

      {/* —— 板块一:产品简介 —— */}
      <section className={styles.section}>
        <p className={styles.eyebrow}>{t('home.eyebrow')}</p>
        <h2 className={styles.sectionTitle}>{t('home.introTitle')}</h2>
        <p className={styles.introText}>{t('home.intro')}</p>
      </section>

      {/* —— 板块二:产品价值(粒子形态变换动画,合并原四张卡) ——
          粒子在六边形logo → 环 → 三色灯 → 网格 → 循环箭头 之间消散重组,
          字幕随形态轮播对应价值点。 */}
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>{t('home.valueTitle')}</h2>
        <ParticleField t={t} />
      </section>

      {/* —— 板块三:使用方法(时间轴样式:左侧贯穿轴线 + 图标在轴上 + 右侧文字) —— */}
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>{t('home.usageTitle')}</h2>
        <ol className={styles.timeline}>
          {USAGE_NODES.map((node) => (
            <li key={node.full} className={styles.timelineItem}>
              <span className={styles.timelineIcon} aria-hidden="true">{node.icon}</span>
              <div className={styles.timelineText}>
                <span className={styles.timelineLabel}>{t(node.label)}</span>
                <span className={styles.timelineDesc}>{t(node.full)}</span>
              </div>
            </li>
          ))}
        </ol>
      </section>

      {/* —— 底部:开始使用按钮 + 声明条 —— */}
      <div className={styles.ctaWrap}>
        <button className={styles.cta} onClick={onStart}>
          {t('home.cta')}
        </button>
        <p className={styles.foot}>{t('welcome.foot')}</p>
      </div>
    </div>
  );
};

export default ProductHome;
