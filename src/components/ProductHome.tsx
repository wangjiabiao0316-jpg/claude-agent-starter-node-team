import React, { useLayoutEffect, useRef } from 'react';
import { useT } from '../i18n';
import ParticleField from './ParticleField';

/**
 * ProductHome — V4.0 大气版产品首页。
 *
 * 结构与设计稿 1:1：
 *   .hero            —— full-bleed 城市图 hero（左深右透渐变压图）：
 *                        overline / 大标题（金色 span）/ lead / desc / CTA / 竖排章 / 角标
 *   .product-story   —— 产品叙事区：
 *                        head（eyebrow+大标题+总述）
 *                        product-visual（球面粒子场 + 左侧文案 + 右下角标）
 *                        product-principles（三张原则卡 = 咨投建运/三色灯/沙箱算账）
 *                        product-story-action（开始使用 CTA）
 *
 * hero 在 .home-fullscreen（App 根类）下撑满 100vh-68px。
 * 点击「开始使用」回调 onStart → setUiStage('transition')。
 */
interface ProductHomeProps {
  /** 点击「开始使用」时触发，父组件据此进入 transition 屏 */
  onStart: () => void;
}

export const ProductHome: React.FC<ProductHomeProps> = ({ onStart }) => {
  const { t, lang } = useT();

  // 主题位品牌组合等比放大：宽度对齐下方 lead 文本行（zoom 等比缩放整组，布局占位同步）
  const brandRef = useRef<HTMLDivElement | null>(null);
  const leadRef = useRef<HTMLSpanElement | null>(null);
  const baseWidthRef = useRef(0);
  useLayoutEffect(() => {
    const fit = () => {
      const brand = brandRef.current;
      const lead = leadRef.current;
      if (!brand || !lead) return;
      // 基准宽 = zoom=1 时的自然宽度（此后 offsetWidth 已含 zoom，需除回）
      const zoomNow = Number(brand.style.zoom) || 1;
      if (!baseWidthRef.current) baseWidthRef.current = brand.offsetWidth / zoomNow;
      // 内联 span 的宽度 = 文本自然宽（折行时≈块宽），比块级 clientWidth 精确
      const target = lead.offsetWidth;
      if (target > 0 && baseWidthRef.current > 0) {
        brand.style.zoom = String(target / baseWidthRef.current);
      }
    };
    fit();
    window.addEventListener('resize', fit);
    return () => window.removeEventListener('resize', fit);
  }, []);

  // product-visual 左侧文案（视觉叙事件，内联双语）
  const visualCopy = lang === 'zh'
    ? { h3a: '七大智能体，', h3b: '一份上会答卷', p: '从产权筛查到财务测算，从政策合规到失败案例对标——链路上每一步的判定都留有证据与轨迹，可回溯、可复核、可迭代。' }
    : { h3a: 'Seven agents, ', h3b: 'one board-ready answer', p: 'From property screening to financial modeling, policy compliance to failure-case benchmarking — every judgment on the chain leaves evidence and trace, auditable and iterable.' };

  // 三张原则卡（i18n home.value1~3）
  const principles = [
    { title: t('home.value1Title'), text: t('home.value1Text') },
    { title: t('home.value2Title'), text: t('home.value2Text') },
    { title: t('home.value3Title'), text: t('home.value3Text') },
  ];

  return (
    <section className="screen active">
      {/* —— V4.0 hero：城市图 + 金色大字 —— */}
      <div className="hero">
        <div className="hero-content">
          <p className="hero-overline">{t('welcome.eyebrow')}</p>
          {/* —— 主题位：左上角品牌块复制（等比放大至与下方 lead 行同宽） —— */}
          <div className="hero-brand" ref={brandRef}>
            <span className="brand-mark">
              <span className="mark-niu">牛</span>
              <i className="mark-ai">AI</i>
            </span>
            <span className="brand-name">
              <span className="brand-title">{t('app.title')}</span>
              <span className="brand-en">{t('app.subtitle')}</span>
            </span>
          </div>
          <p className="hero-lead">
            <span ref={leadRef}>{t('welcome.subtitle')}</span>
          </p>
          <p className="hero-desc">{t('home.intro')}</p>
          <div className="hero-foot">
            <button type="button" className="btn primary" onClick={onStart}>
              {t('home.cta')} →
            </button>
            {/* 产品价值按钮：与「开始使用」等宽，点击平滑滚动到产品价值区 */}
            <button
              type="button"
              className="btn ghost"
              onClick={() => document.getElementById('product-value')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
            >
              {t('home.valueTitle')}
            </button>
          </div>
        </div>
        <span className="hero-stamp">CSCEC · URBAN RENEWAL · AI</span>
        <span className="hero-index">
          WANXIANG CORE
          <span>01 — PRODUCT</span>
        </span>
      </div>

      {/* —— V4.0 product-story：粒子球 + 三原则（产品价值锚点） —— */}
      <div className="product-story" id="product-value">
        <div className="product-story-head">
          <p className="eyebrow">{t('home.eyebrow')}</p>
          <h2>{t('home.valueTitle')}</h2>
          <p>{t('app.subtitle')}</p>
        </div>

        <div className="product-visual">
          <ParticleField variant="hero" />
          <div className="product-visual-copy">
            <p className="eyebrow">DECISION PIPELINE</p>
            <h3>
              {visualCopy.h3a}
              <span>{visualCopy.h3b}</span>
            </h3>
            <p>{visualCopy.p}</p>
          </div>
          <div className="product-visual-index">
            03 — AGENTS
            <span>{t('welcome.foot')}</span>
          </div>
        </div>

        <div className="product-principles">
          {principles.map((card) => (
            <div key={card.title}>
              <b>{card.title}</b>
              <span>{card.text}</span>
            </div>
          ))}
        </div>

        <div className="product-story-action">
          <button type="button" className="btn primary" onClick={onStart}>
            {t('home.cta')} →
          </button>
        </div>
      </div>
    </section>
  );
};

export default ProductHome;
