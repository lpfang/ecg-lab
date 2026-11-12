// 3D 视图（懒加载 three.js）：示意心脏 + 传导系统 + 空间向量环 + 导联轴。
// 坐标：three.x = 患者左侧，three.y = 上方，three.z = 前方（面向观察者）。
// Frank 向量（X 左、Y 下、Z 后）→ (X, −Y, −Z)。
// 心脏是程序化生成的示意模型，不是解剖模型。

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { FRONTAL_AXES, CHEST_AXES, korsVector, leadValuesAt } from '../vcg/vector.js';
import { WAVE_COLORS } from '../ecg/paper.js';

const REST = new THREE.Color('#ece6e2');
const ACTIVE = new THREE.Color('#ea580c');
const SA_COLOR = new THREE.Color('#facc15');
const PATH_COLOR = new THREE.Color('#a16207');

/** 心尖方向：左、下、前 */
const APEX_DIR = new THREE.Vector3(0.62, -0.58, 0.52).normalize();

function frankToThree(k, s) {
  return new THREE.Vector3(k.X * s, -k.Y * s, -k.Z * s);
}

/** 给几何体每个顶点算激动先后（0–1），返回 Float32Array */
function activationOrder(geom, fn) {
  const pos = geom.attributes.position;
  const order = new Float32Array(pos.count);
  const v = new THREE.Vector3();
  let lo = Infinity;
  let hi = -Infinity;
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    order[i] = fn(v);
    lo = Math.min(lo, order[i]);
    hi = Math.max(hi, order[i]);
  }
  for (let i = 0; i < pos.count; i++) order[i] = (order[i] - lo) / (hi - lo || 1);
  geom.setAttribute('color', new THREE.BufferAttribute(new Float32Array(pos.count * 3), 3));
  return order;
}

function chamber(radius, scale, position, quat) {
  const g = new THREE.SphereGeometry(radius, 40, 28);
  g.scale(...scale);
  if (quat) g.applyQuaternion(quat);
  g.translate(...position);
  return g;
}

export class Heart3D {
  constructor(container) {
    this.container = container;
    const w = container.clientWidth;
    const h = container.clientHeight;
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setPixelRatio(window.devicePixelRatio || 1);
    this.renderer.setSize(w, h);
    container.append(this.renderer.domElement);
    this.labels = new CSS2DRenderer();
    this.labels.setSize(w, h);
    this.labels.domElement.className = 'labels3d';
    container.append(this.labels.domElement);

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(35, w / h, 0.1, 100);
    this.setView('front');

    this.scene.add(new THREE.AmbientLight(0xffffff, 1.6));
    const dl = new THREE.DirectionalLight(0xffffff, 1.4);
    dl.position.set(2, 3, 4);
    this.scene.add(dl);

    this.buildHeart();
    this.buildAxes();
    this.loopGroup = new THREE.Group();
    this.scene.add(this.loopGroup);
    this.arrow = new THREE.ArrowHelper(new THREE.Vector3(1, 0, 0), new THREE.Vector3(), 0.01, 0x7c3aed, 0.12, 0.07);
    this.arrow.traverse((o) => {
      if (o.material) o.material.depthTest = false;
      o.renderOrder = 11;
    });
    this.scene.add(this.arrow);
    // 投影线只建一次，之后只更新顶点，避免每帧新建几何体造成显存泄漏
    const line2 = (mat) => {
      const l = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]), mat);
      l.renderOrder = 12;
      l.frustumCulled = false;
      this.scene.add(l);
      return l;
    };
    this.projDash = line2(new THREE.LineDashedMaterial({ color: 0x7c3aed, dashSize: 0.05, gapSize: 0.04, depthTest: false }));
    this.projBar = line2(new THREE.LineBasicMaterial({ color: 0x16a34a, depthTest: false }));

    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(container);
    this.state = {};
    const tick = () => {
      this.raf = requestAnimationFrame(tick);
      if (this.controls.update()) this.draw();
    };
    tick();
  }

  setView(v) {
    const d = 5.2;
    const pos = { front: [0, 0, d], left: [d, 0, 0], top: [0, d, 0.01] }[v] ?? [0, 0, d];
    this.camera.position.set(...pos);
    this.camera.up.set(0, v === 'top' ? 0 : 1, v === 'top' ? -1 : 0);
    this.camera.lookAt(0, 0, 0);
    // OrbitControls 在创建时记住相机的 up 方向，切换视角后要重建，否则俯视时拖动会绕错轴
    this.controls?.dispose();
    this.controls = new OrbitControls(this.camera, this.labels.domElement);
    this.controls.enableDamping = true;
    this.controls.addEventListener('change', () => this.draw());
    this.draw();
  }

  buildHeart() {
    // 心脏整体缩小、半透明，放在向量环后面作为参照，不遮挡向量
    this.heartGroup = new THREE.Group();
    this.heartGroup.scale.setScalar(0.8);
    this.scene.add(this.heartGroup);
    // 心室：左室为主（左下前，指向心尖），右室在右前
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, -1, 0), APEX_DIR);
    const lv = chamber(0.62, [0.85, 1.25, 0.85], [0.18, -0.12, -0.05], q);
    const rv = chamber(0.5, [0.85, 1.05, 0.62], [-0.32, -0.08, 0.32], q);
    const ra = chamber(0.36, [1, 1, 1], [-0.62, 0.62, -0.05]);
    const la = chamber(0.33, [1, 0.9, 1], [0.32, 0.72, -0.42]);

    this.sa = new THREE.Vector3(-0.68, 0.98, 0.02);
    this.av = new THREE.Vector3(-0.12, 0.3, 0.0);
    const his = new THREE.Vector3(-0.02, 0.12, 0.05);
    const apex = new THREE.Vector3(0.18, -0.12, -0.05).addScaledVector(APEX_DIR, 0.95);
    const base = new THREE.Vector3(0, 0.35, 0);

    // 激动顺序（示意）：心房按距窦房结的距离；心室先室间隔，再心尖，最后基底部
    const atrialOrder = (p) => p.distanceTo(this.sa);
    // 离希氏束越远越晚；基底部额外推迟（最后除极）
    const ventOrder = (p) => 0.45 * p.distanceTo(his) + 0.55 * p.distanceTo(apex) * (p.y > base.y - 0.2 ? 1.3 : 1);

    const mat = new THREE.MeshLambertMaterial({ vertexColors: true, transparent: true, opacity: 0.55, depthWrite: false });
    this.chambers = [];
    for (const [g, kind, fn] of [
      [ra, 'atria', atrialOrder],
      [la, 'atria', atrialOrder],
      [lv, 'vent', ventOrder],
      [rv, 'vent', ventOrder],
    ]) {
      const order = activationOrder(g, fn);
      const m = new THREE.Mesh(g, mat);
      this.heartGroup.add(m);
      this.chambers.push({ mesh: m, kind, order });
    }

    // 传导系统
    const tube = (pts, r = 0.025) =>
      new THREE.Mesh(
        new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 40, r, 8),
        new THREE.MeshLambertMaterial({ color: PATH_COLOR }),
      );
    const lbbEnd = apex.clone().add(new THREE.Vector3(0.12, 0.05, -0.12));
    const rbbEnd = apex.clone().add(new THREE.Vector3(-0.28, 0.12, 0.22));
    this.paths = {
      internodal: tube([this.sa, new THREE.Vector3(-0.42, 0.62, 0.05), this.av], 0.018),
      his: tube([this.av, his]),
      lbb: tube([his, new THREE.Vector3(0.08, -0.25, 0.0), lbbEnd]),
      rbb: tube([his, new THREE.Vector3(-0.1, -0.25, 0.12), rbbEnd]),
    };
    Object.values(this.paths).forEach((m) => this.heartGroup.add(m));
    this.saMesh = new THREE.Mesh(new THREE.SphereGeometry(0.07, 16, 12), new THREE.MeshBasicMaterial({ color: SA_COLOR }));
    this.saMesh.position.copy(this.sa);
    this.avMesh = new THREE.Mesh(new THREE.SphereGeometry(0.06, 16, 12), new THREE.MeshBasicMaterial({ color: PATH_COLOR }));
    this.avMesh.position.copy(this.av);
    this.heartGroup.add(this.saMesh, this.avMesh);

    const lab = (text, pos, cls = 'lab3d') => {
      const d = document.createElement('div');
      d.className = cls;
      d.textContent = text;
      const o = new CSS2DObject(d);
      o.position.copy(pos);
      this.heartGroup.add(o);
      return o;
    };
    this.anatLabels = [
      lab('窦房结', this.sa.clone().add(new THREE.Vector3(-0.15, 0.15, 0))),
      lab('房室结', this.av.clone().add(new THREE.Vector3(-0.35, -0.05, 0))),
      lab('左心室', new THREE.Vector3(0.85, -0.55, 0.2)),
      lab('右心室', new THREE.Vector3(-0.75, -0.45, 0.45)),
    ];
  }

  buildAxes() {
    this.axisGroup = new THREE.Group();
    this.axisLines = {};
    const R = 1.75;
    const mk = (lead, dir) => {
      const geo = new THREE.BufferGeometry().setFromPoints([dir.clone().multiplyScalar(-R), dir.clone().multiplyScalar(R)]);
      const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0x9ca3af, transparent: true, opacity: 0.6 }));
      this.axisGroup.add(line);
      const d = document.createElement('div');
      d.className = 'lab3d axis';
      d.textContent = `${lead}+`;
      const o = new CSS2DObject(d);
      o.position.copy(dir.clone().multiplyScalar(R + 0.15));
      this.axisGroup.add(o);
      this.axisLines[lead] = { line, label: d, dir };
    };
    // 额面：角度顺时针为正（向下），three.y 向上 → y = −sin
    for (const a of FRONTAL_AXES) {
      const r = (a.deg * Math.PI) / 180;
      mk(a.lead, new THREE.Vector3(Math.cos(r), -Math.sin(r), 0));
    }
    // 水平面：角度从左侧转向前方（three.z 正方向）
    for (const a of CHEST_AXES) {
      const r = (a.deg * Math.PI) / 180;
      mk(a.lead, new THREE.Vector3(Math.cos(r), 0, Math.sin(r)));
    }
    this.scene.add(this.axisGroup);
  }

  resize() {
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;
    if (!w || !h) return;
    this.renderer.setSize(w, h);
    this.labels.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.draw();
  }

  /**
   * @param s {ecg, beat, win, baseline, t, loc, selectedLead, showAxes, showHeart}
   */
  update(s) {
    this.state = s;
    // 向量环：本心搏变化时才重建
    const key = s.beat ? `${s.ecg.meta.id}:${s.win.start}` : null;
    if (key !== this.loopKey) {
      this.loopKey = key;
      this.loopGroup.traverse((o) => {
        o.geometry?.dispose();
        o.material?.dispose();
      });
      this.loopGroup.clear();
      if (s.beat) this.buildLoop(s);
    }
    this.colorHeart(s.loc);
    this.updateVector(s);
    this.axisGroup.visible = s.showAxes;
    for (const [lead, a] of Object.entries(this.axisLines)) {
      const sel = lead === s.selectedLead;
      a.line.material.color.set(sel ? 0x7c3aed : 0x9ca3af);
      a.line.material.opacity = sel ? 1 : 0.5;
      a.label.classList.toggle('sel', sel);
    }
    this.heartGroup.visible = s.showHeart;
    for (const l of this.anatLabels) l.visible = s.showHeart;
    this.draw();
  }

  buildLoop(s) {
    const pts = [];
    let maxMag = 1;
    for (let t = s.win.start; t <= s.win.end; t += 4) {
      const k = korsVector(leadValuesAt(s.ecg, t, s.baseline));
      maxMag = Math.max(maxMag, Math.hypot(k.X, k.Y, k.Z));
      pts.push({ t, k });
    }
    this.loopScale = 1.35 / maxMag;
    const positions = [];
    const colors = [];
    const col = new THREE.Color();
    for (const p of pts) {
      positions.push(...frankToThree(p.k, this.loopScale).toArray());
      const b = s.beat;
      const c =
        b.P && p.t >= b.P.on && p.t <= b.P.off
          ? WAVE_COLORS.P.line
          : p.t >= b.QRS.on && p.t <= b.QRS.off
            ? WAVE_COLORS.QRS.line
            : b.T && p.t >= b.T.on && p.t <= b.T.off
              ? WAVE_COLORS.T.line
              : '#9ca3af';
      col.set(c);
      colors.push(col.r, col.g, col.b);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    const loop = new THREE.Line(g, new THREE.LineBasicMaterial({ vertexColors: true, depthTest: false }));
    loop.renderOrder = 10;
    this.loopGroup.add(loop);
  }

  updateVector(s) {
    this.projDash.visible = false;
    this.projBar.visible = false;
    if (!s.beat) {
      this.arrow.visible = false;
      return;
    }
    const k = korsVector(leadValuesAt(s.ecg, s.t, s.baseline));
    const v = frankToThree(k, this.loopScale);
    const len = v.length();
    this.arrow.visible = len > 0.02;
    if (this.arrow.visible) {
      this.arrow.setDirection(v.clone().normalize());
      this.arrow.setLength(len, Math.min(0.12, len * 0.4), Math.min(0.07, len * 0.25));
    }
    const ax = this.axisLines[s.selectedLead];
    if (ax && s.showAxes && this.arrow.visible) {
      const dot = v.dot(ax.dir);
      const foot = ax.dir.clone().multiplyScalar(dot);
      const setPts = (line, a, b) => {
        const pos = line.geometry.attributes.position;
        pos.setXYZ(0, a.x, a.y, a.z);
        pos.setXYZ(1, b.x, b.y, b.z);
        pos.needsUpdate = true;
        line.visible = true;
      };
      setPts(this.projDash, v, foot);
      this.projDash.computeLineDistances();
      setPts(this.projBar, new THREE.Vector3(), foot);
      this.projBar.material.color.set(dot >= 0 ? 0x16a34a : 0xdc2626);
    }
  }

  /** 按时相给心房、心室、传导系统上色（示意） */
  colorHeart(loc) {
    const phase = loc?.phase;
    const f = loc?.frac ?? 0;
    const tmp = new THREE.Color();
    for (const c of this.chambers) {
      const colors = c.mesh.geometry.attributes.color;
      for (let i = 0; i < c.order.length; i++) {
        let a = 0; // 0 静息，1 激动
        const o = c.order[i];
        if (c.kind === 'atria') {
          if (phase === 'P') a = o <= f ? 1 : 0;
          else if (phase === 'PR') a = 1 - f * 0.6; // 心房复极（被 QRS 掩盖），示意为逐渐恢复
          else if (phase === 'QRS') a = 0.4 * (1 - f);
        } else if (phase === 'QRS') a = o <= f ? 1 : 0;
        else if (phase === 'ST') a = 1;
        // 复极大体与除极顺序相反：最后除极的区域（o 大）最先恢复
        else if (phase === 'T') a = o <= 1 - f ? 1 : 0.15;
        tmp.copy(REST).lerp(ACTIVE, a);
        colors.setXYZ(i, tmp.r, tmp.g, tmp.b);
      }
      colors.needsUpdate = true;
    }
    this.saMesh.scale.setScalar(phase === 'P' && f < 0.3 ? 1.8 : 1);
    this.avMesh.material.color.set(phase === 'PR' ? '#f97316' : '#a16207');
    const hot = phase === 'QRS' && f < 0.5;
    for (const k of ['his', 'lbb', 'rbb']) this.paths[k].material.color.set(hot || (phase === 'PR' && f > 0.7) ? '#f97316' : '#a16207');
  }

  draw() {
    if (!this.renderer) return;
    this.renderer.render(this.scene, this.camera);
    this.labels.render(this.scene, this.camera);
  }

  dispose() {
    cancelAnimationFrame(this.raf);
    this.ro.disconnect();
    this.controls.dispose();
    this.renderer.dispose();
    this.container.replaceChildren();
    this.renderer = null;
  }
}
