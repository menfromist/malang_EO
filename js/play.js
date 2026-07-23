/* ─────────────────────────────────────────────────────────────
 * 말랑 놀이터 — 만지기(스프링 물리) · 꾸미기 · 공유
 *
 * 제스처: 꾹 누르면 납작 → 오래 누르면 점점 펴짐(펼치기),
 *         끌면 그 방향으로 쭉 늘어남(늘어뜨리기, 살짝 기울어짐),
 *         빠르게 비비면 조물조물(주무르기),
 *         휙 튕기며 놓으면 날아가 벽에 통통(던지기).
 * 액션 버튼: 찰랑찰랑 · 주무르기 · 납작펴기 · 빙글빙글 · 던지기
 * ───────────────────────────────────────────────────────────── */

const Play = (() => {
  const SIZE = 640;
  const MAX_STICKERS = 12;
  const WALL = 0.3;         // 던지기 시 튕기는 벽 위치 (정규화 좌표)
  const TWO_PI = Math.PI * 2;

  const canvas = document.getElementById('play-canvas');
  const ctx = canvas.getContext('2d');

  let state = null;   // { img, baseDataUrl, styleKey, deco, itemId, returnTo }
  let layer = null;   // 말랑이+모자+스티커 합성 레이어
  let active = false;
  let lastT = 0;
  let exporting = false;

  /* ── 스프링 물리 ── */
  const phys = { sx: 1, sy: 1, tx: 0, ty: 0, rot: 0 };
  const vel = { sx: 0, sy: 0, tx: 0, ty: 0, rot: 0 };
  let target = { sx: 1, sy: 1, tx: 0, ty: 0, rot: 0 };

  let dragging = false;
  let grab = null;
  let moved = false;          // 누른 자리에서 벗어났는지 (펼치기 판정용)
  let downTime = 0;
  let trail = [];             // 최근 포인터 궤적 (던지기 속도 계산)
  let lastDx = 0;             // 주무르기(비비기) 방향 반전 감지
  let lastKneadSound = 0;
  let lastBounceSound = 0;
  let dragSticker = null;
  let currentTab = 'touch';

  // 멀티터치 핀치: 두 손가락으로 늘리고 줄이기
  const pointers = new Map(); // pointerId → 정규화 좌표
  let pinch = null;           // { d0, a0, size0 }
  let sizeScale = 1;          // 핀치로 조절되는 말랑이 크기 (손을 떼도 유지)

  // 주시(juiciness)·가변 보상: 터치 지점 파티클 + 7번째 뽁마다 큰 버스트
  let particles = [];
  let pokeCount = 0;

  // 애니머시: 가만히 두면 숨 쉬고, 가끔 스스로 몸짓 (살아있음 지각 → 애착)
  let lastInteraction = 0;
  let nextIdleAct = 0;

  const rest = () => ({ sx: 1, sy: 1, tx: 0, ty: 0, rot: 0 });

  function resetPhys() {
    Object.assign(phys, rest());
    Object.assign(vel, { sx: 0, sy: 0, tx: 0, ty: 0, rot: 0 });
    target = rest();
    dragging = false;
    grab = null;
    pointers.clear();
    pinch = null;
    sizeScale = 1;
    particles = [];
    pokeCount = 0;
    lastInteraction = performance.now();
    nextIdleAct = lastInteraction + 5000;
  }

  function clamp(v, lo, hi) { return Math.min(hi, Math.max(lo, v)); }

  function spawnParticles(nx, ny, count, emojis) {
    for (let i = 0; i < count; i++) {
      const a = -Math.PI / 2 + (Math.random() - 0.5) * 1.8;
      const sp = 0.25 + Math.random() * 0.5;
      particles.push({
        x: nx, y: ny,
        vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
        life: 1,
        emoji: emojis[Math.floor(Math.random() * emojis.length)],
        size: 0.05 + Math.random() * 0.05,
      });
    }
    if (particles.length > 60) particles = particles.slice(-60);
  }

  function step(dt, now) {
    // 파티클 물리
    for (const p of particles) {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += 0.25 * dt;
      p.life -= dt / 0.9;
    }
    particles = particles.filter((p) => p.life > 0);

    // 4초 이상 가만히 두면 6~12초 간격으로 스스로 꼬물거린다
    if (!dragging && !pinch && now - lastInteraction > 4000 && now > nextIdleAct) {
      nextIdleAct = now + 6000 + Math.random() * 6000;
      const act = Math.floor(Math.random() * 3);
      if (act === 0) { vel.ty -= 1.4; vel.sy += 1.6; }   // 폴짝
      else if (act === 1) { vel.rot += 1.3; }            // 갸웃
      else { vel.sx += 1.8; vel.sy -= 1.8; }             // 찰랑
    }
    // 오래 꾹 누르고 있으면 점점 펴진다 (펼치기)
    if (dragging && !moved) {
      const hold = now - downTime;
      if (hold > 350) {
        const f = Math.min((hold - 350) / 700, 1);
        target.sy = 1 - 0.45 * f;
        target.sx = 1 + 0.42 * f;
      }
    }

    const k = dragging ? 260 : 130;   // 스프링 강성
    const c = dragging ? 26 : 7.5;    // 감쇠 (놓으면 통통 튀도록 낮게)
    for (const key of ['sx', 'sy', 'tx', 'ty']) {
      const a = k * (target[key] - phys[key]) - c * vel[key];
      vel[key] += a * dt;
      phys[key] += vel[key] * dt;
    }

    // 회전: 가까운 한 바퀴 단위로 되감기며 잦아든다 (빙글빙글)
    const rotHome = dragging ? target.rot : Math.round(phys.rot / TWO_PI) * TWO_PI;
    const ra = (dragging ? 260 : 26) * (rotHome - phys.rot) - (dragging ? 26 : 3.6) * vel.rot;
    vel.rot += ra * dt;
    phys.rot += vel.rot * dt;

    // 벽 튕기기 (던지기)
    for (const axis of ['tx', 'ty']) {
      if (Math.abs(phys[axis]) > WALL) {
        phys[axis] = Math.sign(phys[axis]) * WALL;
        if (Math.abs(vel[axis]) > 0.6) {
          vel[axis] *= -0.72;
          const squash = Math.min(Math.abs(vel[axis]) * 0.8, 3);
          if (axis === 'tx') { vel.sx -= squash; vel.sy += squash; }
          else { vel.sy -= squash; vel.sx += squash; }
          if (now - lastBounceSound > 90) {
            lastBounceSound = now;
            Sound.pop();
          }
        } else {
          vel[axis] *= -0.4;
        }
      }
    }
  }

  function render() {
    ctx.clearRect(0, 0, SIZE, SIZE);
    Mallang.drawBackground(ctx, SIZE, state.deco.bg);

    // 쉬고 있을 때는 은은하게 숨을 쉰다 (애니머시)
    const breath = (!dragging && !pinch) ? Math.sin(lastT / 1000 * 2.1) * 0.012 : 0;

    ctx.save();
    ctx.translate(SIZE / 2 + phys.tx * SIZE, SIZE / 2 + phys.ty * SIZE);
    ctx.rotate(phys.rot);
    ctx.scale(
      clamp(phys.sx * sizeScale * (1 - breath * 0.6), 0.3, 2.2),
      clamp(phys.sy * sizeScale * (1 + breath), 0.3, 2.2)
    );
    ctx.drawImage(layer, -SIZE / 2, -SIZE / 2);
    ctx.restore();

    // 파티클
    if (particles.length) {
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      for (const p of particles) {
        ctx.globalAlpha = Math.max(p.life, 0);
        ctx.font = `${p.size * SIZE}px "Noto Color Emoji", "Apple Color Emoji", sans-serif`;
        ctx.fillText(p.emoji, p.x * SIZE, p.y * SIZE);
      }
      ctx.globalAlpha = 1;
    }
  }

  function loop(t) {
    if (!active) return;
    const dt = Math.min((t - lastT) / 1000 || 0.016, 0.05);
    lastT = t;
    step(dt, t);
    render();
    requestAnimationFrame(loop);
  }

  function start() {
    if (active) return;
    active = true;
    lastT = 0;
    requestAnimationFrame((t) => { lastT = t; requestAnimationFrame(loop); render(); });
  }

  function stop() { active = false; }

  /* ── 포인터 인터랙션 ── */

  function pointerPos(e) {
    const rect = canvas.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left) / rect.width,
      y: (e.clientY - rect.top) / rect.height,
    };
  }

  function findSticker(n) {
    const stickers = state.deco.stickers;
    for (let i = stickers.length - 1; i >= 0; i--) {
      const s = stickers[i];
      const d = Math.hypot(s.x - n.x, s.y - n.y);
      if (d < (s.s || 0.16) * 0.7) return s;
    }
    return null;
  }

  function normAngle(a) {
    return ((a + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
  }

  canvas.addEventListener('pointerdown', (e) => {
    if (!state) return;
    try { canvas.setPointerCapture(e.pointerId); } catch { /* 합성 이벤트 등 */ }
    const n = pointerPos(e);
    if (currentTab === 'deco') {
      dragSticker = findSticker(n);
      return;
    }
    pointers.set(e.pointerId, n);
    lastInteraction = performance.now();

    // 두 번째 손가락 → 핀치 시작 (늘리기/줄이기)
    if (pointers.size === 2) {
      dragging = false;
      grab = null;
      const [p1, p2] = [...pointers.values()];
      pinch = {
        d0: Math.max(Math.hypot(p2.x - p1.x, p2.y - p1.y), 0.01),
        a0: Math.atan2(p2.y - p1.y, p2.x - p1.x),
        size0: sizeScale,
      };
      Sound.blip();
      return;
    }
    if (pointers.size > 2) return;

    dragging = true;
    grab = n;
    moved = false;
    downTime = performance.now();
    trail = [{ ...n, t: downTime }];
    lastDx = 0;
    Sound.pop();
    vel.sx += 3.2;   // 눌리는 순간 납작해지는 임펄스
    vel.sy -= 3.2;

    // 터치 지점 파티클 + 7번째 뽁마다 큰 버스트 (가변 보상)
    pokeCount++;
    spawnParticles(n.x, n.y, 2, ['💗', '✨']);
    if (pokeCount % 7 === 0) {
      spawnParticles(0.5, 0.42, 10, ['💖', '⭐', '✨', '🎉']);
      Sound.sparkle();
    }
  });

  canvas.addEventListener('pointermove', (e) => {
    if (!state) return;
    const n = pointerPos(e);
    if (dragSticker) {
      dragSticker.x = clamp(n.x, 0.05, 0.95);
      dragSticker.y = clamp(n.y, 0.05, 0.95);
      rebuildLayer();
      render();
      return;
    }
    if (pointers.has(e.pointerId)) pointers.set(e.pointerId, n);

    // 핀치 중: 크기 조절 + 핀치 축 방향으로 젤리처럼 늘어남 + 비틀기 회전
    if (pinch && pointers.size >= 2) {
      const [p1, p2] = [...pointers.values()];
      const d = Math.max(Math.hypot(p2.x - p1.x, p2.y - p1.y), 0.01);
      const a = Math.atan2(p2.y - p1.y, p2.x - p1.x);
      const ratio = d / pinch.d0;
      sizeScale = clamp(pinch.size0 * ratio, 0.45, 1.8);
      const stretch = clamp(ratio, 0.7, 1.4);
      target = {
        tx: 0, ty: 0,
        sx: clamp(1 + (stretch - 1) * Math.abs(Math.cos(a)), 0.7, 1.5),
        sy: clamp(1 + (stretch - 1) * Math.abs(Math.sin(a)), 0.7, 1.5),
        rot: clamp(normAngle(a - pinch.a0), -0.6, 0.6),
      };
      dragging = true; // 핀치 동안엔 강성 스프링으로 손가락을 따라감
      return;
    }
    if (!dragging) return;

    const now = performance.now();
    trail.push({ ...n, t: now });
    if (trail.length > 6) trail.shift();

    const dx = clamp(n.x - grab.x, -0.6, 0.6);
    const dy = clamp(n.y - grab.y, -0.6, 0.6);
    if (Math.hypot(dx, dy) > 0.035) moved = true;

    // 주무르기: 좌우로 빠르게 비비면 방향이 바뀔 때마다 조물조물
    const prev = trail[trail.length - 2];
    const sdx = prev ? n.x - prev.x : 0;
    if (Math.abs(dx) < 0.18 && Math.abs(sdx) > 0.004 && lastDx * sdx < 0) {
      vel.sx += (sdx > 0 ? 1 : -1) * 2.4;
      vel.sy -= 1.2;
      if (now - lastKneadSound > 130) {
        lastKneadSound = now;
        Sound.blip();
      }
    }
    if (Math.abs(sdx) > 0.004) lastDx = sdx;

    // 늘어뜨리기: 끄는 방향으로 쭉 늘어나고 살짝 기울어진다
    target = {
      tx: dx * 0.5,
      ty: dy * 0.5,
      sx: clamp(1 + Math.abs(dx) * 1.05 - Math.abs(dy) * 0.35, 0.55, 1.7),
      sy: clamp(1 + Math.abs(dy) * 1.05 - Math.abs(dx) * 0.35, 0.55, 1.7),
      rot: dx * 0.5,
    };
  });

  function releasePointer(e) {
    if (dragSticker) {
      dragSticker = null;
      autosave();
      return;
    }
    if (e) pointers.delete(e.pointerId);

    // 핀치 종료: 조절된 크기는 유지하고 통통 튀며 마무리
    if (pinch) {
      if (pointers.size < 2) {
        pinch = null;
        pointers.clear();
        dragging = false;
        target = rest();
        vel.sx += 1.6;
        vel.sy -= 1.6;
        Sound.boing();
      }
      return;
    }
    if (!dragging) return;
    dragging = false;
    target = rest();

    // 던지기: 놓는 순간 속도가 빠르면 날아간다
    const now = performance.now();
    const past = trail.find((p) => now - p.t < 90) || trail[0];
    const last = trail[trail.length - 1];
    if (past && last && last.t > past.t) {
      const dt = (last.t - past.t) / 1000;
      const vx = (last.x - past.x) / dt;
      const vy = (last.y - past.y) / dt;
      const speed = Math.hypot(vx, vy);
      if (speed > 1.3) {
        vel.tx += clamp(vx * 0.55, -6, 6);
        vel.ty += clamp(vy * 0.55, -6, 6);
        vel.rot += clamp(vx * 1.2, -7, 7);
        Sound.whoosh();
        return;
      }
    }
    Sound.boing();
  }
  canvas.addEventListener('pointerup', releasePointer);
  canvas.addEventListener('pointercancel', releasePointer);

  /* ── 액션 버튼 ── */

  const ACTIONS = {
    // 찰랑찰랑: 좌우로 출렁이는 젤리 웨이브
    jiggle() {
      for (let i = 0; i < 6; i++) {
        setTimeout(() => {
          const dir = i % 2 ? -1 : 1;
          vel.sx += dir * 2.6;
          vel.sy -= dir * 2.6;
          vel.rot += dir * 0.9;
          Sound.blip();
        }, i * 110);
      }
    },
    // 주무르기: 양옆에서 번갈아 조물조물
    knead() {
      for (let i = 0; i < 6; i++) {
        setTimeout(() => {
          vel.sx += (i % 2 ? -1 : 1) * 3.4;
          vel.ty += (i % 2 ? -1 : 1) * 0.35;
          Sound.pop();
        }, i * 150);
      }
    },
    // 납작펴기: 지그시 눌러 팬케이크처럼 펴졌다가 팡!
    flatten() {
      Sound.pop();
      target = { ...rest(), sx: 1.45, sy: 0.52 };
      setTimeout(() => {
        target = rest();
        vel.sy += 3.5;
        Sound.boing();
      }, 800);
    },
    // 빙글빙글: 회전시켰다가 스프링으로 되감기
    spin() {
      vel.rot += 17;
      vel.sx += 1.2;
      vel.sy -= 1.2;
      Sound.whoosh();
    },
    // 던지기: 위로 휙 던져 벽에 통통
    throw() {
      const dir = Math.random() < 0.5 ? -1 : 1;
      vel.ty -= 5.4;
      vel.tx += dir * (2.6 + Math.random() * 2);
      vel.rot += dir * 5;
      Sound.whoosh();
    },
  };

  document.querySelectorAll('.action-btn').forEach((b) => {
    b.addEventListener('click', () => {
      if (!state || currentTab !== 'touch') return;
      const fn = ACTIONS[b.dataset.action];
      if (fn) {
        lastInteraction = performance.now();
        fn();
      }
    });
  });

  /* ── 꾸미기 ── */

  function rebuildLayer() {
    layer = Mallang.buildLayer(state.img, state.deco, SIZE);
  }

  function autosave() {
    if (state.itemId) Store.update(state.itemId, { deco: state.deco });
  }

  function markSelected(row, attr, value) {
    row.querySelectorAll('.chip, .emoji-btn').forEach((b) => {
      b.classList.toggle('selected', b.dataset[attr] === value);
    });
  }

  function buildPanels() {
    const bgRow = document.getElementById('bg-row');
    bgRow.innerHTML = '';
    for (const bg of Mallang.BACKGROUNDS) {
      const b = document.createElement('button');
      b.className = 'chip';
      b.dataset.bg = bg.id;
      b.title = bg.label;
      b.style.background = bg.css;
      if (bg.id === 'none') b.textContent = '✕';
      b.addEventListener('click', () => {
        state.deco.bg = bg.id;
        markSelected(bgRow, 'bg', bg.id);
        render();
        autosave();
      });
      bgRow.appendChild(b);
    }
    markSelected(bgRow, 'bg', state.deco.bg);

    const hatRow = document.getElementById('hat-row');
    hatRow.innerHTML = '';
    for (const hat of Mallang.HATS) {
      const b = document.createElement('button');
      b.className = 'emoji-btn';
      b.dataset.hat = hat.id;
      b.title = hat.label;
      b.textContent = hat.emoji || '✕';
      b.addEventListener('click', () => {
        state.deco.hat = hat.id;
        markSelected(hatRow, 'hat', hat.id);
        rebuildLayer();
        render();
        autosave();
      });
      hatRow.appendChild(b);
    }
    markSelected(hatRow, 'hat', state.deco.hat);

    const stickerRow = document.getElementById('sticker-row');
    stickerRow.innerHTML = '';
    for (const emoji of Mallang.STICKERS) {
      const b = document.createElement('button');
      b.className = 'emoji-btn';
      b.textContent = emoji;
      b.addEventListener('click', () => {
        if (state.deco.stickers.length >= MAX_STICKERS) {
          App.toast('스티커는 12개까지 붙일 수 있어요');
          return;
        }
        state.deco.stickers.push({
          e: emoji,
          x: 0.3 + Math.random() * 0.4,
          y: 0.3 + Math.random() * 0.4,
          s: 0.16,
        });
        Sound.pop();
        rebuildLayer();
        render();
        autosave();
      });
      stickerRow.appendChild(b);
    }
    const clear = document.createElement('button');
    clear.className = 'emoji-btn clear-btn';
    clear.textContent = '🧹';
    clear.title = '스티커 비우기';
    clear.addEventListener('click', () => {
      state.deco.stickers = [];
      Sound.trash();
      rebuildLayer();
      render();
      autosave();
    });
    stickerRow.appendChild(clear);
  }

  /* ── 탭 ── */

  function switchTab(tab) {
    currentTab = tab;
    document.querySelectorAll('.play-tabs .tab').forEach((t) => {
      t.classList.toggle('selected', t.dataset.tab === tab);
    });
    document.getElementById('panel-touch').hidden = tab !== 'touch';
    document.getElementById('panel-deco').hidden = tab !== 'deco';
    document.getElementById('panel-share').hidden = tab !== 'share';
  }

  document.querySelectorAll('.play-tabs .tab').forEach((t) => {
    t.addEventListener('click', () => switchTab(t.dataset.tab));
  });

  /* ── 저장 ── */

  function save() {
    if (state.itemId) {
      Store.update(state.itemId, { deco: state.deco });
      Sound.ding();
      App.toast('꾸민 모습을 저장했어요! 🎀');
      return;
    }
    try {
      const item = Store.add({
        image: state.baseDataUrl,
        style: state.styleKey,
        deco: state.deco,
      });
      state.itemId = item.id;
      Sound.ding();
      App.celebrate(document.querySelector('.play-stage'));
      App.toast('보관함에 저장했어요! 🍡');
    } catch {
      App.toast('저장 공간이 가득 찼어요. 보관함을 정리해 주세요');
    }
  }

  document.getElementById('btn-play-save').addEventListener('click', save);
  document.getElementById('btn-play-back').addEventListener('click', () => {
    stop();
    App.show(state && state.returnTo ? state.returnTo : 'home');
  });

  /* ── 공유 ── */

  // 스크립트된 흔들림 (GIF·영상 녹화용): 감쇠 진동
  function wobbleAt(t) {
    const decay = Math.exp(-2.1 * t);
    const s = Math.sin(t * Math.PI * 4.6);
    return { sx: 1 + 0.2 * decay * s, sy: 1 - 0.16 * decay * s };
  }

  function drawWobbleFrame(fctx, size, wLayer, w) {
    fctx.fillStyle = '#fff7f0';
    fctx.fillRect(0, 0, size, size);
    Mallang.drawBackground(fctx, size, state.deco.bg);
    fctx.save();
    fctx.translate(size / 2, size / 2);
    fctx.scale(w.sx, w.sy);
    fctx.drawImage(wLayer, -size / 2, -size / 2);
    fctx.restore();
  }

  async function deliver(blob, filename) {
    const file = new File([blob], filename, { type: blob.type });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: '내 말랑이 🍡' });
        return;
      } catch (err) {
        if (err && err.name === 'AbortError') return; // 사용자가 공유 취소
      }
    }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    App.toast('파일로 저장했어요! 📁');
  }

  function stamp() {
    const d = new Date();
    return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
  }

  async function exportImage() {
    const composed = Mallang.composeStill(state.img, state.deco, SIZE, { solidBg: true });
    const blob = await new Promise((r) => composed.toBlob(r, 'image/png'));
    await deliver(blob, `mallang-${stamp()}.png`);
    return blob;
  }

  async function exportGif() {
    if (exporting) return null;
    exporting = true;
    App.toast('GIF 만드는 중... 🎞️');
    await new Promise((r) => setTimeout(r, 50)); // 토스트가 먼저 그려지도록

    try {
      const size = 320;
      const wLayer = Mallang.buildLayer(state.img, state.deco, size);
      const fc = document.createElement('canvas');
      fc.width = size;
      fc.height = size;
      const fctx = fc.getContext('2d', { willReadFrequently: true });

      const frames = [];
      const FRAME_COUNT = 16;
      for (let i = 0; i < FRAME_COUNT; i++) {
        drawWobbleFrame(fctx, size, wLayer, wobbleAt(i * 0.085));
        frames.push(fctx.getImageData(0, 0, size, size));
      }
      const blob = GifEncoder.encode(frames, size, size, 8);
      await deliver(blob, `mallang-${stamp()}.gif`);
      return blob;
    } finally {
      exporting = false;
    }
  }

  async function exportVideo() {
    if (exporting) return null;
    if (typeof MediaRecorder === 'undefined' || !canvas.captureStream) {
      App.toast('이 기기에서는 영상 저장을 지원하지 않아요');
      return null;
    }
    exporting = true;
    App.toast('영상 만드는 중... 🎬');

    try {
      const size = SIZE;
      const wLayer = Mallang.buildLayer(state.img, state.deco, size);
      const vc = document.createElement('canvas');
      vc.width = size;
      vc.height = size;
      const vctx = vc.getContext('2d');

      const stream = vc.captureStream(30);
      // iOS 사파리는 WebM을 지원하지 않으므로 mp4까지 폴백
      const mime = [
        'video/webm;codecs=vp9',
        'video/webm',
        'video/mp4;codecs=avc1',
        'video/mp4',
      ].find((m) => MediaRecorder.isTypeSupported(m));
      if (!mime) {
        App.toast('이 기기에서는 영상 저장을 지원하지 않아요');
        return null;
      }
      const recorder = new MediaRecorder(stream, { mimeType: mime });
      const chunks = [];
      recorder.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };

      const DURATION = 2600; // 두 번 튕기는 연출
      const done = new Promise((resolve) => { recorder.onstop = resolve; });
      recorder.start();

      const startTime = performance.now();
      await new Promise((resolve) => {
        (function tick(now) {
          const t = (now || performance.now()) - startTime;
          drawWobbleFrame(vctx, size, wLayer, wobbleAt((t % 1300) / 1000));
          if (t < DURATION) requestAnimationFrame(tick);
          else resolve();
        })();
      });
      recorder.stop();
      await done;

      const isMp4 = mime.startsWith('video/mp4');
      const blob = new Blob(chunks, { type: isMp4 ? 'video/mp4' : 'video/webm' });
      await deliver(blob, `mallang-${stamp()}.${isMp4 ? 'mp4' : 'webm'}`);
      return blob;
    } finally {
      exporting = false;
    }
  }

  document.getElementById('btn-share-image').addEventListener('click', exportImage);
  document.getElementById('btn-share-gif').addEventListener('click', exportGif);
  document.getElementById('btn-share-video').addEventListener('click', exportVideo);

  /* ── 진입 ── */

  /**
   * @param {object} opts { baseDataUrl, styleKey, deco, itemId, returnTo }
   */
  async function enter(opts) {
    const img = await Mallang.loadImage(opts.baseDataUrl);
    state = {
      img,
      baseDataUrl: opts.baseDataUrl,
      styleKey: opts.styleKey || 'mochi',
      deco: Mallang.normalizeDeco(opts.deco),
      itemId: opts.itemId || null,
      returnTo: opts.returnTo || 'home',
    };
    rebuildLayer();
    buildPanels();
    resetPhys();
    switchTab('touch');
    App.show('play');
    start();

    // 등장 인사: 통통!
    vel.sx += 2.2;
    vel.sy -= 2.2;
  }

  return { enter, save, exportImage, exportGif, exportVideo, stop, getPinchScale: () => sizeScale };
})();
