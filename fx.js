/* 일일펑 폭발 효과 — Canvas 파티클 (외부 라이브러리 없음)
   app.js 의 explodeCard 가 IlilFX.blast(x, y, rect, power) 를 부른다. */
(function () {
  'use strict';
  const COLORS = ['#ff593d', '#ffd456', '#ff9459', '#ffffff', '#ff3d8b', '#4de2ff'];
  const MAX_PARTICLES = 700;
  let canvas = null, ctx = null, raf = 0, last = 0, dpr = 1;
  const sparks = [], confetti = [], shards = [], rings = [], glows = [];

  function ensureCanvas() {
    if (canvas) return;
    canvas = document.createElement('canvas');
    canvas.setAttribute('aria-hidden', 'true');
    canvas.style.cssText = 'position:fixed;inset:0;width:100vw;height:100vh;pointer-events:none;z-index:60';
    document.body.appendChild(canvas);
    ctx = canvas.getContext('2d');
    resize();
    addEventListener('resize', resize);
  }
  function resize() {
    dpr = Math.min(devicePixelRatio || 1, 2);
    canvas.width = Math.round(innerWidth * dpr);
    canvas.height = Math.round(innerHeight * dpr);
  }
  const rand = (a, b) => a + Math.random() * (b - a);
  const pick = () => COLORS[(Math.random() * COLORS.length) | 0];
  const total = () => sparks.length + confetti.length + shards.length;

  function blast(x, y, rect, power) {
    ensureCanvas();
    const p = Math.max(1, Math.min(power || 1, 6));
    glows.push({ x, y, r: 60, life: 0, max: 0.45, grow: 520 + p * 60 });
    rings.push({ x, y, r: 10, life: 0, max: 0.6, speed: 700, w: 10, color: '#ffd456' });
    rings.push({ x, y, r: 6, life: 0, max: 0.8, speed: 480, w: 5, color: '#ff593d' });
    if (p >= 3) rings.push({ x, y, r: 4, life: 0, max: 1.0, speed: 900, w: 3, color: '#4de2ff' });

    if (total() > MAX_PARTICLES) return;

    // 불꽃: 빛줄기처럼 길게 튀어 나가는 선
    const nSpark = 46 + p * 14;
    for (let i = 0; i < nSpark; i++) {
      const a = Math.random() * Math.PI * 2, v = rand(260, 820 + p * 60);
      sparks.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 80, life: 0, max: rand(0.45, 1.0), w: rand(1.5, 3.8), color: pick() });
    }
    // 색종이: 팔랑이며 떨어지는 조각
    const nConf = 34 + p * 10;
    for (let i = 0; i < nConf; i++) {
      const a = rand(-Math.PI * 0.95, -Math.PI * 0.05), v = rand(300, 780 + p * 50);
      confetti.push({ x, y, vx: Math.cos(a) * v * rand(0.6, 1.3), vy: Math.sin(a) * v, rot: rand(0, 6.28), vr: rand(-12, 12), flip: rand(0, 6.28), vf: rand(6, 14), w: rand(7, 15), h: rand(4, 9), life: 0, max: rand(1.3, 2.1), color: pick() });
    }
    // 카드 조각: 카드 크기에서 떨어져 나가는 종이 파편
    if (rect) {
      const cols = 9, rows = 3, cw = rect.width / cols, ch = rect.height / rows;
      for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
        const px = rect.left + c * cw + cw / 2, py = rect.top + r * ch + ch / 2;
        const dx = px - x, dy = py - y, d = Math.hypot(dx, dy) || 1, v = rand(260, 560);
        shards.push({ x: px, y: py, vx: (dx / d) * v + rand(-60, 60), vy: (dy / d) * v - rand(80, 260), rot: 0, vr: rand(-9, 9), w: cw * 0.95, h: ch * 0.95, life: 0, max: rand(0.7, 1.15) });
      }
    }
    if (!raf) { last = performance.now(); raf = requestAnimationFrame(tick); }
  }

  function tick(now) {
    const dt = Math.min((now - last) / 1000, 0.04);
    last = now;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, innerWidth, innerHeight);

    // 번쩍이는 빛
    for (let i = glows.length - 1; i >= 0; i--) {
      const g = glows[i]; g.life += dt;
      const t = g.life / g.max; if (t >= 1) { glows.splice(i, 1); continue; }
      const r = g.r + g.grow * t, grad = ctx.createRadialGradient(g.x, g.y, 0, g.x, g.y, r);
      grad.addColorStop(0, `rgba(255,240,170,${0.85 * (1 - t)})`);
      grad.addColorStop(0.4, `rgba(255,120,60,${0.4 * (1 - t)})`);
      grad.addColorStop(1, 'rgba(255,60,40,0)');
      ctx.fillStyle = grad; ctx.beginPath(); ctx.arc(g.x, g.y, r, 0, 6.283); ctx.fill();
    }
    // 충격파 링
    for (let i = rings.length - 1; i >= 0; i--) {
      const r = rings[i]; r.life += dt;
      const t = r.life / r.max; if (t >= 1) { rings.splice(i, 1); continue; }
      r.r += r.speed * dt * (1 - t * 0.7);
      ctx.strokeStyle = r.color; ctx.globalAlpha = 1 - t; ctx.lineWidth = r.w * (1 - t) + 0.5;
      ctx.beginPath(); ctx.arc(r.x, r.y, r.r, 0, 6.283); ctx.stroke();
    }
    // 불꽃 (꼬리가 남는 선)
    ctx.lineCap = 'round';
    for (let i = sparks.length - 1; i >= 0; i--) {
      const s = sparks[i]; s.life += dt;
      if (s.life >= s.max) { sparks.splice(i, 1); continue; }
      s.vx *= 1 - 2.2 * dt; s.vy = s.vy * (1 - 2.2 * dt) + 520 * dt;
      const px = s.x, py = s.y; s.x += s.vx * dt; s.y += s.vy * dt;
      ctx.globalAlpha = 1 - s.life / s.max; ctx.strokeStyle = s.color; ctx.lineWidth = s.w;
      ctx.beginPath(); ctx.moveTo(px - s.vx * 0.035, py - s.vy * 0.035); ctx.lineTo(s.x, s.y); ctx.stroke();
    }
    ctx.globalAlpha = 1;

    // 카드 조각 (잉크색 테두리의 종이)
    for (let i = shards.length - 1; i >= 0; i--) {
      const s = shards[i]; s.life += dt;
      if (s.life >= s.max) { shards.splice(i, 1); continue; }
      s.vy += 1500 * dt; s.x += s.vx * dt; s.y += s.vy * dt; s.rot += s.vr * dt;
      ctx.save(); ctx.translate(s.x, s.y); ctx.rotate(s.rot); ctx.globalAlpha = 1 - Math.pow(s.life / s.max, 2);
      ctx.fillStyle = '#fffaf0'; ctx.strokeStyle = '#1b1a23'; ctx.lineWidth = 2;
      ctx.fillRect(-s.w / 2, -s.h / 2, s.w, s.h); ctx.strokeRect(-s.w / 2, -s.h / 2, s.w, s.h);
      ctx.restore();
    }
    // 색종이
    for (let i = confetti.length - 1; i >= 0; i--) {
      const c = confetti[i]; c.life += dt;
      if (c.life >= c.max) { confetti.splice(i, 1); continue; }
      c.vx *= 1 - 1.4 * dt; c.vy = c.vy * (1 - 1.4 * dt) + 900 * dt;
      c.x += c.vx * dt; c.y += c.vy * dt; c.rot += c.vr * dt; c.flip += c.vf * dt;
      ctx.save(); ctx.translate(c.x, c.y); ctx.rotate(c.rot); ctx.scale(1, Math.cos(c.flip));
      ctx.globalAlpha = Math.min(1, (c.max - c.life) * 2.5); ctx.fillStyle = c.color;
      ctx.fillRect(-c.w / 2, -c.h / 2, c.w, c.h); ctx.restore();
    }
    ctx.globalAlpha = 1;

    if (sparks.length || confetti.length || shards.length || rings.length || glows.length) raf = requestAnimationFrame(tick);
    else { raf = 0; ctx.clearRect(0, 0, innerWidth, innerHeight); }
  }

  window.IlilFX = { blast };
})();
