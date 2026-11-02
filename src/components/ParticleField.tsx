import React, { useEffect, useRef } from 'react';

/**
 * ParticleField — V4.0 大气版球面粒子场。
 *
 * 算法与设计稿 WANXIANG_CORE_V4.0 一比一移植：
 *   1. 球面均匀采样：u∈[0,2π) 方位角，v=acos(2·rand−1) 极角（球面等面积分布），
 *      半径 0.68~0.96 制造壳层厚度。
 *   2. 每帧 rot 缓转 + 极角微流动 sin(v·3+frame)，粒子在球面上缓慢漂移。
 *   3. 透视投影：tilt 轴倾斜后 perspective=2.7/(2.7+z)，近大远小、近亮远暗。
 *   4. 按 z 排序绘制，叠三条椭圆轨道线（rgba(140,170,194,.10)）。
 *   5. 每第 83 个粒子染金色 #ddb160 —— 大气版「金点」签名。
 *
 * variant:
 *   'hero'   —— 首页 product-story 大球（1250 粒，cx 51%，scale 43%）
 *   'create' —— 管理页「新建项目」卡片小球（950 粒，cx 57%，scale 48%）
 *
 * 无字幕、无形态切换 —— V4.0 是恒稳呼吸感，不是旧版的 morph 动画。
 * prefers-reduced-motion 时只绘制一帧静态球。
 */
interface ParticleFieldProps {
  variant?: 'hero' | 'create';
}

interface Point {
  u: number;
  v: number;
  r: number;
  size: number;
}

export const ParticleField: React.FC<ParticleFieldProps> = ({ variant = 'hero' }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const isFirst = variant === 'hero'; // 设计稿 canvasIndex===0
    let w = 0;
    let h = 0;
    let dpr = 1;
    let frame = 0;

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      dpr = Math.min(window.devicePixelRatio || 1, 1.6);
      w = Math.max(1, rect.width);
      h = Math.max(1, rect.height);
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    // 球面均匀采样
    const points: Point[] = [];
    const count = isFirst ? 1250 : 950;
    for (let i = 0; i < count; i++) {
      const u = Math.random() * Math.PI * 2;
      const v = Math.acos(2 * Math.random() - 1);
      const radius = 0.68 + Math.random() * 0.28;
      points.push({ u, v, r: radius, size: 0.35 + Math.random() * 1.15 });
    }

    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const draw = () => {
      frame += reduce ? 0 : 0.006;
      ctx.clearRect(0, 0, w, h);
      const cx = w * (isFirst ? 0.51 : 0.57);
      const cy = h * 0.52;
      const scale = Math.min(w, h) * (isFirst ? 0.43 : 0.48);
      const rot = frame * 0.24;
      const tilt = -0.26;
      const cosT = Math.cos(tilt);
      const sinT = Math.sin(tilt);
      const projected: Array<{ x: number; y: number; z: number; size: number; alpha: number }> = [];

      for (const p of points) {
        const flow = p.u + rot + Math.sin(p.v * 3 + frame) * 0.055;
        const x = Math.sin(p.v) * Math.cos(flow) * p.r;
        const y = Math.cos(p.v) * p.r;
        const z = Math.sin(p.v) * Math.sin(flow) * p.r;
        const yy = y * cosT - z * sinT;
        const zz = y * sinT + z * cosT;
        const perspective = 2.7 / (2.7 + zz);
        projected.push({
          x: cx + x * scale * perspective,
          y: cy + yy * scale * perspective,
          z: zz,
          size: p.size * perspective,
          alpha: 0.2 + (0.65 * (zz + 1) / 2),
        });
      }
      projected.sort((a, b) => a.z - b.z);

      // 三条椭圆轨道线
      ctx.save();
      ctx.translate(cx, cy);
      ctx.strokeStyle = 'rgba(140,170,194,.10)';
      ctx.lineWidth = 1;
      for (let k = 0; k < 3; k++) {
        ctx.beginPath();
        ctx.ellipse(0, 0, scale * (0.72 + k * 0.12), scale * (0.20 + k * 0.09), rot * 0.35 + k * 0.7, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.restore();

      // 基础粒子（近亮远暗的冷白）
      for (const q of projected) {
        ctx.beginPath();
        ctx.fillStyle = `rgba(207,220,229,${q.alpha * 0.78})`;
        ctx.arc(q.x, q.y, q.size, 0, Math.PI * 2);
        ctx.fill();
      }
      // 金色点缀：每第 83 个粒子
      for (let i = 0; i < projected.length; i += 83) {
        const q = projected[i];
        ctx.beginPath();
        ctx.fillStyle = 'rgba(221,177,112,.85)';
        ctx.arc(q.x, q.y, 1.5, 0, Math.PI * 2);
        ctx.fill();
      }

      if (!reduce) requestAnimationFrame(draw);
    };
    draw();

    return () => {
      ro.disconnect();
    };
  }, [variant]);

  return <canvas ref={canvasRef} className="particle-field" aria-hidden="true" />;
};

export default ParticleField;
