import React, { useEffect, useRef, useState } from 'react';
import { type MessageKeys } from '../i18n';
import styles from './ParticleField.module.css';

/**
 * ParticleField — 粒子形态变换动画。
 *
 * 演示逻辑:粒子在不同图形之间"消散 → 重组"。
 * 形态序列:大六边形(产品logo) → 环(价值1) → 三色灯(价值2) → 网格(价值3) → 循环箭头(价值4) → 循环回六边形。
 *
 * 实现原理(粒子形态变换/morphing 的标准做法):
 *   1. 用一个离屏 canvas 把目标图形画出来,读像素,取不透明像素的坐标作为粒子的"目标位置"。
 *   2. 每个粒子维护 {x,y, tx,ty, vx,vy} —— 当前位置、目标位置、速度。
 *   3. 每帧用弹簧/插值把粒子推向目标位置;形态切换时重新采样目标,粒子自动过渡。
 *   4. 消散阶段:给粒子加随机扰动 + 降低对目标的吸引力,粒子散开;重组阶段:恢复吸引力,粒子聚拢。
 *
 * 字幕在 Canvas 下方的 DOM 中切换(不画进 Canvas,便于 i18n 与清晰渲染)。
 *
 * 性能:粒子数随画布尺寸自适应,限制在 ~1500 内;用 requestAnimationFrame;
 * 组件卸载时清理动画帧与 resize 监听。
 */

// 形态类型:每个形态对应一个"在离屏 canvas 上画图形"的函数 + 一条字幕 i18n key
type ShapeId = 'hexagon' | 'ring' | 'lamp' | 'grid' | 'loop';

interface Shape {
  id: ShapeId;
  /** 在 ctx 上画目标图形(白色实心/描边均可,只要不透明像素就能被采样) */
  draw: (ctx: CanvasRenderingContext2D, size: number) => void;
  /** 配套字幕的 i18n key(显示在 Canvas 下方) */
  captionKey: MessageKeys;
}

// 五个形态:产品logo + 四个价值点。绘制坐标以画布中心为原点(调用前已 translate)。
// 全部用实心填充(fill),让粒子能采样到整个图形区域,汇聚成实心 logo。
// 尺寸统一缩小(系数 ~0.22),让 logo 紧凑精致,给满屏飞舞留出空间。
const SHAPES: Shape[] = [
  {
    id: 'hexagon',
    captionKey: 'app.title',   // 「万象更芯 · 智算营城」,复用现有 key
    draw: (ctx, size) => {
      // 实心大六边形(产品 logo)
      const r = size * 0.22;
      ctx.beginPath();
      for (let i = 0; i < 6; i++) {
        const a = (Math.PI / 3) * i - Math.PI / 6;
        const x = Math.cos(a) * r;
        const y = Math.sin(a) * r;
        i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      }
      ctx.closePath();
      ctx.fill();
    },
  },
  {
    id: 'ring',
    captionKey: 'home.value1Title',   // 咨投建运全阶段覆盖
    draw: (ctx, size) => {
      // 四芒星:上下左右四个尖角 + 四个凹角,象征"四方/全阶段"辐射覆盖。
      // 用 8 个顶点(4 尖 4 凹)交替连线,形成星形。
      const rOut = size * 0.24;   // 外径(尖角)
      const rIn = size * 0.10;    // 内径(凹角)
      ctx.beginPath();
      for (let i = 0; i < 8; i++) {
        const a = (Math.PI / 4) * i - Math.PI / 2;   // 从正上方开始
        const r = i % 2 === 0 ? rOut : rIn;          // 偶数=尖角,奇数=凹角
        const x = Math.cos(a) * r;
        const y = Math.sin(a) * r;
        i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      }
      ctx.closePath();
      ctx.fill();
    },
  },
  {
    id: 'lamp',
    captionKey: 'home.value2Title',   // 三色灯硬规则闸门
    draw: (ctx, size) => {
      // 竖排三个实心圆点,间距足够大避免粘连(三色由主渲染逻辑按 y 位置染色)
      const r = size * 0.055;
      [-0.19, 0, 0.19].forEach((dy) => {
        ctx.beginPath();
        ctx.arc(0, size * dy, r, 0, Math.PI * 2);
        ctx.fill();
      });
    },
  },
  {
    id: 'grid',
    captionKey: 'home.value3Title',   // 沙箱算账而非心算
    draw: (ctx, size) => {
      // 实心小方块矩阵(3x3),象征"沙箱算账/数据矩阵",比线条更适合粒子填充
      const cell = size * 0.08;
      const gap = size * 0.04;
      const step = cell + gap;
      for (let row = -1; row <= 1; row++) {
        for (let col = -1; col <= 1; col++) {
          ctx.fillRect(col * step - cell / 2, row * step - cell / 2, cell, cell);
        }
      }
    },
  },
  {
    id: 'loop',
    captionKey: 'home.value4Title',   // 人机协商迭代
    draw: (ctx, size) => {
      // 衔尾蛇样式(简化):粗细渐变的弧 + 蛇头,首尾留缺口不相连。
      // 用多段圆弧叠加模拟"尾部细→头部粗"的渐变,头部画一个椭圆当蛇头,
      // 尾端指向蛇头但留一段空隙,呼应"循环但不闭合(持续迭代)"。
      const cx0 = 0;
      const cy0 = 0;
      const R = size * 0.2;
      // 弧从 20° 到 320°(留 60° 缺口在右上方,蛇尾指向蛇头但不接)
      const aTail = Math.PI * 0.11;    // 尾端角度(细)
      const aHead = Math.PI * 1.78;    // 头端角度(粗),与尾端之间留缺口
      const segs = 14;
      for (let i = 0; i < segs; i++) {
        // 从尾到头,线宽由细到粗
        const t0 = i / segs;
        const t1 = (i + 1) / segs;
        const a0 = aTail + (aHead - aTail) * t0;
        const a1 = aTail + (aHead - aTail) * t1;
        const lw = size * (0.018 + t0 * 0.03);   // 尾 0.018 → 头 0.048
        ctx.lineWidth = lw;
        ctx.beginPath();
        ctx.arc(cx0, cy0, R, a0, a1);
        ctx.stroke();
      }
      // 蛇头:在 aHead 处画一个椭圆,长轴沿切线方向
      const hx = cx0 + Math.cos(aHead) * R;
      const hy = cy0 + Math.sin(aHead) * R;
      ctx.save();
      ctx.translate(hx, hy);
      ctx.rotate(aHead + Math.PI / 2);   // 椭圆长轴对齐弧切线
      ctx.beginPath();
      ctx.ellipse(0, 0, size * 0.05, size * 0.032, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    },
  },
];

// 单个粒子
interface Particle {
  x: number;
  y: number;
  tx: number;       // 目标位置
  ty: number;
  vx: number;
  vy: number;
  size: number;
  hue: number;      // 0~1,用于按形态着色(0 银白,三色灯时切彩)
}

interface ParticleFieldProps {
  /** 字幕翻译函数,由父组件传入 t() */
  t: (key: MessageKeys) => string;
}

// 每个形态的节奏:重组(聚拢+停留)给足时间让粒子成形,消散(慢飘扩散)长一些。
// 形态周期四阶段(毫秒):混沌 → 聚拢 → 发光 → 炸开 →(下一形态)
// CHAOS:  粒子满屏混沌飞舞(随机的混沌状态)
// GATHER: 粒子从混沌汇聚成形
// GLOW:   聚拢完成,矢量 logo 立即显现 + 辉光从弱渐强到峰值
// (峰值后自动炸开,进入下一形态的 CHAOS)
const CHAOS_MS = 1500;
const GATHER_MS = 1000;
const GLOW_MS = 1200;
// 阶段边界(从周期起点 phaseStart 起算)
const T_GATHER_END = CHAOS_MS;                    // 混沌结束 = 聚拢开始
const T_GLOW_END = CHAOS_MS + GATHER_MS;          // 聚拢结束 = 发光开始(矢量logo立即显现)
const T_TOTAL = CHAOS_MS + GATHER_MS + GLOW_MS;   // 发光结束 = 炸开 + 切下一形态

export const ParticleField: React.FC<ParticleFieldProps> = ({ t }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const captionRef = useRef<HTMLDivElement>(null);
  const [captionKey, setCaptionKey] = useState<MessageKeys>(SHAPES[0].captionKey);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // ---- 1. 离屏 canvas:用于把目标图形栅格化、采样像素作为粒子目标 ----
    const off = document.createElement('canvas');
    const offCtx = off.getContext('2d');
    if (!offCtx) return;

    let W = 0;
    let H = 0;
    let dpr = Math.min(window.devicePixelRatio || 1, 2);

    // 粒子池
    let particles: Particle[] = [];

    // 为指定形态采样目标点(在离屏 canvas 画图 → 读像素 → 收集不透明点)
    const sampleShape = (shape: Shape, targetCount: number): Array<{ x: number; y: number }> => {
      const size = Math.min(W, H);
      off.width = W;
      off.height = H;
      offCtx.clearRect(0, 0, W, H);
      offCtx.fillStyle = '#fff';
      offCtx.strokeStyle = '#fff';
      offCtx.save();
      offCtx.translate(W / 2, H / 2);
      shape.draw(offCtx, size);
      offCtx.restore();

      const img = offCtx.getImageData(0, 0, W, H).data;
      const pts: Array<{ x: number; y: number }> = [];
      // 步长采样:每隔几个像素取一个,控制密度。实心填充用更密的 step=2。
      const step = 2;
      for (let y = 0; y < H; y += step) {
        for (let x = 0; x < W; x += step) {
          if (img[(y * W + x) * 4 + 3] > 128) {
            pts.push({ x, y });
          }
        }
      }
      // 数量可能与粒子数不等,做一次随机重采样到 targetCount
      const result: Array<{ x: number; y: number }> = [];
      for (let i = 0; i < targetCount; i++) {
        const pt = pts[Math.floor((i / targetCount) * pts.length)];
        result.push(pt ?? { x: W / 2, y: H / 2 });
      }
      return result;
    };

    // 把粒子目标重新分配到新形态(形态切换时调用)
    const morphTo = (shape: Shape) => {
      const targets = sampleShape(shape, particles.length);
      // 打乱目标顺序,让过渡更自然(粒子不按位置顺序认领目标)
      for (let i = targets.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [targets[i], targets[j]] = [targets[j], targets[i]];
      }
      particles.forEach((p, i) => {
        const tg = targets[i] ?? { x: W / 2, y: H / 2 };
        p.tx = tg.x;
        p.ty = tg.y;
      });
    };

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      W = rect.width;
      H = rect.height;
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = W * dpr;
      canvas.height = H * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      // 粒子数按面积自适应,封顶 2500(实心填充需要比轮廓更多的粒子)
      const count = Math.min(2500, Math.max(1000, Math.floor((W * H) / 600)));
      particles = Array.from({ length: count }, () => ({
        x: W / 2 + (Math.random() - 0.5) * W,
        y: H / 2 + (Math.random() - 0.5) * H,
        tx: W / 2,
        ty: H / 2,
        vx: 0,
        vy: 0,
        size: 1.2 + Math.random() * 0.8,
        hue: 0,
      }));
      morphTo(SHAPES[0]);
    };

    resize();
    window.addEventListener('resize', resize);

    // ---- 2. 形态调度:循环切换 SHAPES,同步字幕 ----
    // 周期四阶段:混沌 → 聚拢 → 发光 →(炸开)→ 下一形态。
    // 炸开在发光峰值后(advance 时)触发:给粒子随机方向的爆发,进入下一形态的混沌。
    let shapeIdx = 0;
    let phaseStart = performance.now();
    setCaptionKey(SHAPES[0].captionKey);

    // 发光峰值后炸开时调用:给每个粒子一个完全随机的方向 + 速度,
    // 让散开后的分布真正随机混沌(而非从中心均匀辐射)。
    const triggerBurst = () => {
      const burst = Math.max(W, H) * 0.05;
      for (const p of particles) {
        // 随机角度 + 随机强度,每个粒子飞向不同方向,形成混沌状态
        const ang = Math.random() * Math.PI * 2;
        const mag = burst * (0.6 + Math.random() * 0.8);   // 强度也随机,分布更不均匀
        p.vx = Math.cos(ang) * mag;
        p.vy = Math.sin(ang) * mag;
      }
    };

    const advance = () => {
      shapeIdx = (shapeIdx + 1) % SHAPES.length;
      morphTo(SHAPES[shapeIdx]);          // 设新目标(供下一周期的聚拢使用)
      setCaptionKey(SHAPES[shapeIdx].captionKey);
      phaseStart = performance.now();
    };

    // ---- 3. 主渲染循环 ----
    let raf = 0;
    const render = () => {
      const now = performance.now();
      const elapsed = now - phaseStart;
      // 当前阶段:混沌 / 聚拢 / 发光
      const phase: 'chaos' | 'gather' | 'glow' =
        elapsed < T_GATHER_END ? 'chaos' :
        elapsed < T_GLOW_END ? 'gather' : 'glow';
      const dispersing = phase === 'chaos';   // 混沌阶段=粒子自由飞(弹簧关闭)
      const isGlow = phase === 'glow';        // 发光阶段=矢量logo显现+辉光渐强

      // 发光峰值结束 → 炸开 + advance 到下一形态(立刻进入混沌,弹簧关闭,爆发不抵消)
      if (elapsed > T_TOTAL) {
        advance();          // 切下一形态 + 设新目标
        triggerBurst();     // 从当前(logo)位置爆发,粒子随机飞向满屏混沌
      }

      // 清屏(轻拖尾,营造粒子轨迹感)
      ctx.fillStyle = 'rgba(5, 5, 7, 0.28)';
      ctx.fillRect(0, 0, W, H);

      for (const p of particles) {
        if (dispersing) {
          // 混沌阶段:粒子满屏随机飞舞。爆发给了随机初速度,这里持续注入扰动维持混沌。
          // 关键:扰动随混沌进度渐弱(后半段减弱),让粒子速度自然平缓,
          // 避免混沌→聚拢切换时速度突变造成的"卡顿"。
          const chaosProgress = elapsed / T_GATHER_END;        // 0 → 1
          const chaosKick = 0.9 * (1 - chaosProgress * 0.7);   // 扰动强度:1.0 → 0.3(渐弱)
          const cx2 = p.x - W / 2;
          const cy2 = p.y - H / 2;
          const distC = Math.sqrt(cx2 * cx2 + cy2 * cy2);
          const maxR = Math.sqrt(W * W + H * H) / 2;
          const farDamp = 0.97 - (distC / maxR) * 0.05;        // 中心 0.97 → 边缘 0.92
          p.vx += (Math.random() - 0.5) * chaosKick;
          p.vy += (Math.random() - 0.5) * chaosKick;
          p.vx *= farDamp;
          p.vy *= farDamp;
        } else {
          // 聚拢阶段:用一阶位置插值(指数衰减)替代弹簧-阻尼。
          // 一阶系统天生是 ease-out 曲线:开始大幅靠近目标(快)、末段精准收敛(稳),
          // 没有弹簧模型的"匀速爬行 + 末段振荡"钝感,观感更灵动。
          // easeK 控制收敛速度:0.18 = 快速但平滑归位。
          const easeK = 0.18;
          p.x += (p.tx - p.x) * easeK;
          p.y += (p.ty - p.y) * easeK;
          // 速度归零(一阶模型不需要维护速度,这里清掉避免边界反弹用到残留速度)
          p.vx = 0;
          p.vy = 0;
        }
        p.x += p.vx;
        p.y += p.vy;

        // 边界软反弹:粒子撞到画布边缘时反弹,保持在画布内飞舞
        if (p.x < 0) { p.x = 0; p.vx *= -0.8; }
        else if (p.x > W) { p.x = W; p.vx *= -0.8; }
        if (p.y < 0) { p.y = 0; p.vy *= -0.8; }
        else if (p.y > H) { p.y = H; p.vy *= -0.8; }

        // 着色:默认银白;三色灯形态按 y 位置染绿/黄/红
        let color = 'rgba(232, 234, 238, 0.85)';   // --accent-silver
        if (SHAPES[shapeIdx].id === 'lamp') {
          const rel = (p.y / H);
          if (rel < 0.4) color = 'rgba(61, 220, 132, 0.9)';       // 绿
          else if (rel > 0.6) color = 'rgba(255, 77, 79, 0.9)';   // 红
          else color = 'rgba(245, 200, 66, 0.9)';                  // 黄
        }
        ctx.fillStyle = color;
        ctx.fillRect(p.x, p.y, p.size, p.size);
      }

      // ---- 矢量 logo:跟着聚拢进度浮现 + 发光渐强 ----
      // 关键:矢量 logo 的透明度与粒子聚拢进度联动,避免"粒子还散着、矢量 logo 突现"的卡顿。
      // gather 后半段(进度 0.5→1.0)淡入(此时粒子已大致聚到位)→ glow 阶段全显 + 辉光渐强到峰值。
      const size = Math.min(W, H);
      let logoAlpha = 0;
      let blur = size * 0.02;
      if (phase === 'gather') {
        const g = (elapsed - T_GATHER_END) / GATHER_MS;            // 聚拢进度 0→1
        logoAlpha = g > 0.2 ? Math.min((g - 0.2) / 0.5, 1) : 0;    // 进度 0.2→0.7 淡入到全显,与粒子聚拢同步成形
      } else if (isGlow) {
        const glowProgress = (elapsed - T_GLOW_END) / GLOW_MS;      // 发光进度 0→1
        logoAlpha = 1;                                              // 聚拢完成,全显
        blur = size * (0.02 + glowProgress * 0.10);                // 辉光渐强:0.02 → 0.12
      }
      if (logoAlpha > 0) {
        const shape = SHAPES[shapeIdx];
        ctx.save();
        ctx.globalAlpha = logoAlpha;
        ctx.translate(W / 2, H / 2);
        ctx.shadowColor = 'rgba(232, 234, 238, 0.85)';
        ctx.shadowBlur = blur;
        if (shape.id === 'lamp') {
          // 三色灯:按上中下分别用绿黄红画三个实心圆点
          const r = size * 0.055;
          const lampColors = ['rgba(61, 220, 132, 1)', 'rgba(245, 200, 66, 1)', 'rgba(255, 77, 79, 1)'];
          [-0.19, 0, 0.19].forEach((dy, i) => {
            ctx.fillStyle = lampColors[i];
            ctx.beginPath();
            ctx.arc(0, size * dy, r, 0, Math.PI * 2);
            ctx.fill();
          });
        } else {
          // 其他形态:白色实心矢量图形,复用 shape.draw
          ctx.fillStyle = '#fff';
          ctx.strokeStyle = '#fff';
          ctx.lineWidth = size * 0.02;
          shape.draw(ctx, size);
        }
        ctx.restore();
      }

      raf = requestAnimationFrame(render);
    };
    raf = requestAnimationFrame(render);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
    };
  }, []);

  return (
    <div className={styles.field}>
      <canvas ref={canvasRef} className={styles.canvas} />
      <div ref={captionRef} className={styles.caption}>
        {t(captionKey)}
      </div>
    </div>
  );
};

export default ParticleField;
