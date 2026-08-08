import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import styles from './CityScene.module.css';

/**
 * CityScene — full-viewport Three.js background.
 *
 * A monochrome wireframe city that mirrors the 「万象更芯 · 智算营城」 cover
 * art: procedural building outlines, concentric ground rings, rising
 * particles and a central light core. The camera slowly orbits the core
 * with a subtle mouse parallax.
 *
 * Degradation: if WebGL initialisation fails, the component silently keeps
 * the CSS poster background (city-poster.jpg) and renders no canvas.
 */

/** Push the 12 edges of a box (center x/z, base y=0) into the arrays. */
function pushBoxEdges(
  positions: number[],
  colors: number[],
  cx: number,
  cz: number,
  w: number,
  h: number,
  brightness: number,
) {
  const x0 = cx - w / 2, x1 = cx + w / 2;
  const z0 = cz - w / 2, z1 = cz + w / 2;
  const y0 = 0, y1 = h;
  const c = [
    // 4 vertical edges — brighter toward the top
    [x0, y0, z0, x0, y1, z0, 0.35, 1],
    [x1, y0, z0, x1, y1, z0, 0.35, 1],
    [x0, y0, z1, x0, y1, z1, 0.35, 1],
    [x1, y0, z1, x1, y1, z1, 0.35, 1],
    // bottom quad
    [x0, y0, z0, x1, y0, z0, 0.25, 0.25],
    [x1, y0, z0, x1, y0, z1, 0.25, 0.25],
    [x1, y0, z1, x0, y0, z1, 0.25, 0.25],
    [x0, y0, z1, x0, y0, z0, 0.25, 0.25],
    // top quad — brightest
    [x0, y1, z0, x1, y1, z0, 1, 1],
    [x1, y1, z0, x1, y1, z1, 1, 1],
    [x1, y1, z1, x0, y1, z1, 1, 1],
    [x0, y1, z1, x0, y1, z0, 1, 1],
  ];
  for (const [ax, ay, az, bx, by, bz, ca, cb] of c) {
    positions.push(ax, ay, az, bx, by, bz);
    colors.push(ca * brightness, ca * brightness, ca * brightness,
                cb * brightness, cb * brightness, cb * brightness);
  }
}

/** Radial-gradient sprite texture (white core fading to transparent). */
function makeGlowTexture(size = 128, innerStop = 0.12): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const grad = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(innerStop, 'rgba(255,255,255,0.85)');
  grad.addColorStop(0.45, 'rgba(220,224,232,0.25)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  return new THREE.CanvasTexture(canvas);
}

/** Vertical beam texture — bright at bottom, fading upward. */
function makeBeamTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 16;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;
  const grad = ctx.createLinearGradient(0, 256, 0, 0);
  grad.addColorStop(0, 'rgba(255,255,255,0.9)');
  grad.addColorStop(0.4, 'rgba(230,233,240,0.28)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 16, 256);
  return new THREE.CanvasTexture(canvas);
}

export default function CityScene() {
  const mountRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    } catch {
      // WebGL unavailable — keep the poster fallback.
      return;
    }

    renderer.setClearColor(0x050507, 1);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    renderer.setSize(mount.clientWidth, mount.clientHeight);
    mount.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.fog = new THREE.Fog(0x050507, 55, 170);

    const camera = new THREE.PerspectiveCamera(
      55,
      mount.clientWidth / Math.max(mount.clientHeight, 1),
      0.1,
      400,
    );

    const disposables: Array<{ dispose(): void }> = [];

    // ── Buildings ────────────────────────────────────────────
    const positions: number[] = [];
    const colors: number[] = [];
    const HALF = 64;
    const STEP = 4.4;
    for (let gx = -HALF; gx <= HALF; gx += STEP) {
      for (let gz = -HALF; gz <= HALF; gz += STEP) {
        const jx = gx + (Math.random() - 0.5) * 1.6;
        const jz = gz + (Math.random() - 0.5) * 1.6;
        const dist = Math.hypot(jx, jz);
        if (dist < 11) continue;                 // central plaza
        if (Math.random() < 0.22) continue;      // gaps between blocks
        const falloff = Math.max(0, 1 - dist / (HALF * 1.25));
        const h = 2.5 + falloff * (6 + Math.random() * 22);
        const w = 2.4 + Math.random() * 1.2;
        const brightness = 0.16 + falloff * 0.5 + Math.random() * 0.12;
        pushBoxEdges(positions, colors, jx, jz, w, h, brightness);
      }
    }
    const cityGeo = new THREE.BufferGeometry();
    cityGeo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    cityGeo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    const cityMat = new THREE.LineBasicMaterial({
      vertexColors: true,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    scene.add(new THREE.LineSegments(cityGeo, cityMat));
    disposables.push(cityGeo, cityMat);

    // ── Ground rings + radial spokes ─────────────────────────
    const ringPos: number[] = [];
    const ringCol: number[] = [];
    for (let r = 12; r <= 92; r += 8) {
      const seg = 72;
      const b = r === 12 ? 0.5 : 0.16;
      for (let i = 0; i < seg; i++) {
        const a0 = (i / seg) * Math.PI * 2;
        const a1 = ((i + 1) / seg) * Math.PI * 2;
        ringPos.push(Math.cos(a0) * r, 0, Math.sin(a0) * r,
                     Math.cos(a1) * r, 0, Math.sin(a1) * r);
        ringCol.push(b, b, b, b, b, b);
      }
    }
    for (let i = 0; i < 24; i++) {
      const a = (i / 24) * Math.PI * 2;
      ringPos.push(Math.cos(a) * 12, 0, Math.sin(a) * 12,
                   Math.cos(a) * 92, 0, Math.sin(a) * 92);
      ringCol.push(0.22, 0.22, 0.22, 0.04, 0.04, 0.04);
    }
    const ringGeo = new THREE.BufferGeometry();
    ringGeo.setAttribute('position', new THREE.Float32BufferAttribute(ringPos, 3));
    ringGeo.setAttribute('color', new THREE.Float32BufferAttribute(ringCol, 3));
    const ringMat = new THREE.LineBasicMaterial({
      vertexColors: true,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    scene.add(new THREE.LineSegments(ringGeo, ringMat));
    disposables.push(ringGeo, ringMat);

    // ── Rising particles ─────────────────────────────────────
    const COUNT = 700;
    const pPos = new Float32Array(COUNT * 3);
    const pSpeed = new Float32Array(COUNT);
    for (let i = 0; i < COUNT; i++) {
      const r = Math.sqrt(Math.random()) * 95;
      const a = Math.random() * Math.PI * 2;
      pPos[i * 3] = Math.cos(a) * r;
      pPos[i * 3 + 1] = Math.random() * 42;
      pPos[i * 3 + 2] = Math.sin(a) * r;
      pSpeed[i] = 0.8 + Math.random() * 2.2;
    }
    const pGeo = new THREE.BufferGeometry();
    pGeo.setAttribute('position', new THREE.BufferAttribute(pPos, 3));
    const pMat = new THREE.PointsMaterial({
      color: 0xffffff,
      size: 0.32,
      transparent: true,
      opacity: 0.75,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      sizeAttenuation: true,
    });
    const particles = new THREE.Points(pGeo, pMat);
    scene.add(particles);
    disposables.push(pGeo, pMat);

    // ── Central light core + beam ────────────────────────────
    const glowTex = makeGlowTexture();
    const glowMat = new THREE.SpriteMaterial({
      map: glowTex,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const glow = new THREE.Sprite(glowMat);
    glow.position.set(0, 1.6, 0);
    glow.scale.set(26, 26, 1);
    scene.add(glow);
    disposables.push(glowTex, glowMat);

    const beamTex = makeBeamTexture();
    const beamMat = new THREE.SpriteMaterial({
      map: beamTex,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const beam = new THREE.Sprite(beamMat);
    beam.position.set(0, 17, 0);
    beam.scale.set(7, 34, 1);
    scene.add(beam);
    disposables.push(beamTex, beamMat);

    // ── Orbit + parallax + animation loop ────────────────────
    let orbitAngle = Math.PI / 5;
    let mouseX = 0;
    let mouseY = 0;
    const onMouseMove = (e: MouseEvent) => {
      mouseX = (e.clientX / window.innerWidth - 0.5) * 2;
      mouseY = (e.clientY / window.innerHeight - 0.5) * 2;
    };
    window.addEventListener('mousemove', onMouseMove);

    const onResize = () => {
      const w = mount.clientWidth;
      const h = Math.max(mount.clientHeight, 1);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener('resize', onResize);

    const clock = new THREE.Clock();
    let raf = 0;
    const animate = () => {
      raf = requestAnimationFrame(animate);
      const dt = Math.min(clock.getDelta(), 0.05);
      const t = clock.elapsedTime;

      orbitAngle += dt * 0.045;
      const radius = 46;
      const camX = Math.cos(orbitAngle) * radius + mouseX * 3;
      const camZ = Math.sin(orbitAngle) * radius;
      const camY = 17 + Math.sin(t * 0.18) * 1.2 - mouseY * 2;
      camera.position.set(camX, camY, camZ);
      camera.lookAt(0, 7, 0);

      // Particles drift upward and wrap around.
      const arr = pGeo.attributes.position.array as Float32Array;
      for (let i = 0; i < COUNT; i++) {
        arr[i * 3 + 1] += pSpeed[i] * dt;
        if (arr[i * 3 + 1] > 44) arr[i * 3 + 1] = 0;
      }
      pGeo.attributes.position.needsUpdate = true;

      // Core breathing.
      const pulse = 0.82 + Math.sin(t * 1.6) * 0.18;
      glowMat.opacity = pulse;
      beamMat.opacity = 0.55 + Math.sin(t * 1.6 + 0.6) * 0.2;

      renderer.render(scene, camera);
    };

    const onVisibility = () => {
      if (document.hidden) {
        cancelAnimationFrame(raf);
        clock.stop();
      } else {
        clock.start();
        animate();
      }
    };
    document.addEventListener('visibilitychange', onVisibility);

    animate();

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('resize', onResize);
      document.removeEventListener('visibilitychange', onVisibility);
      for (const d of disposables) d.dispose();
      renderer.dispose();
      if (renderer.domElement.parentElement === mount) {
        mount.removeChild(renderer.domElement);
      }
    };
  }, []);

  return (
    <div className={styles.scene} aria-hidden="true">
      <div ref={mountRef} className={styles.canvasHost} />
      <div className={styles.veil} />
    </div>
  );
}
