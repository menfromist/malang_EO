/* ─────────────────────────────────────────────────────────────
 * 말랑 놀이터 — 만지기(스프링 물리) · 꾸미기 · 공유
 * ───────────────────────────────────────────────────────────── */

const Play = (() => {
  const SIZE = 640;
  const MAX_STICKERS = 12;

  const canvas = document.getElementById('play-canvas');
  const ctx = canvas.getContext('2d');

  let state = null;   // { img, baseDataUrl, styleKey, deco, itemId, returnTo }
  let layer = null;   // 말랑이+모자+스티커 합성 레이어
  let active = false;
  let lastT = 0;
  let exporting = false;

  /* ── 스프링 물리 ── */
  const phys = { sx: 1, sy: 1, tx: 0, ty: 0 };
  const vel = { sx: 0, sy: 0, tx: 0, ty: 0 };
  let target = { sx: 1, sy: 1, tx: 0, ty: 0 };
  let dragging = false;
  let grab = null;
  let dragSticker = null;
  let currentTab = 'touch';

  function resetPhys() {
    Object.assign(phys, { sx: 1, sy: 1, tx: 0, ty: 0 });
    Object.assign(vel, { sx: 0, sy: 0, tx: 0, ty: 0 });
    target = { sx: 1, sy: 1, tx: 0, ty: 0 };
    dragging = false;
    grab = null;
  }

  function step(dt) {
    const k = dragging ? 260 : 130;   // 스프링 강성
    const c = dragging ? 26 : 7.5;    // 감쇠 (놓으면 통통 튀도록 낮게)
    for (const key of ['sx', 'sy', 'tx', 'ty']) {
      const a = k * (target[key] - phys[key]) - c * vel[key];
      vel[key] += a * dt;
      phys[key] += vel[key] * dt;
    }
  }

  function clamp(v, lo, hi) { return Math.min(hi, Math.max(lo, v)); }

  function render() {
    ctx.clearRect(0, 0, SIZE, SIZE);
    Mallang.drawBackground(ctx, SIZE, state.deco.bg);
    ctx.save();
    ctx.translate(SIZE / 2 + phys.tx * SIZE, SIZE / 2 + phys.ty * SIZE);
    ctx.scale(clamp(phys.sx, 0.45, 1.7), clamp(phys.sy, 0.45, 1.7));
    ctx.drawImage(layer, -SIZE / 2, -SIZE / 2);
    ctx.restore();
  }

  function loop(t) {
    if (!active) return;
    const dt = Math.min((t - lastT) / 1000 || 0.016, 0.05);
    lastT = t;
    step(dt);
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

  /* ── 뽁뽁 효과음 ── */
  let audioCtx = null;
  function pop() {
    try {
      audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
      const t = audioCtx.currentTime;
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(420, t);
      osc.frequency.exponentialRampToValueAtTime(140, t + 0.09);
      gain.gain.setValueAtTime(0.12, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
      osc.connect(gain).connect(audioCtx.destination);
      osc.start(t);
      osc.stop(t + 0.13);
    } catch { /* 오디오 미지원 환경은 조용히 넘어감 */ }
  }

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

  canvas.addEventListener('pointerdown', (e) => {
    if (!state) return;
    canvas.setPointerCapture(e.pointerId);
    const n = pointerPos(e);
    if (currentTab === 'deco') {
      dragSticker = findSticker(n);
      return;
    }
    dragging = true;
    grab = n;
    pop();
    vel.sx += 3.2;   // 눌리는 순간 납작해지는 임펄스
    vel.sy -= 3.2;
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
    if (!dragging) return;
    const dx = clamp(n.x - grab.x, -0.5, 0.5);
    const dy = clamp(n.y - grab.y, -0.5, 0.5);
    target = {
      tx: dx * 0.5,
      ty: dy * 0.5,
      sx: clamp(1 + Math.abs(dx) * 0.9 - Math.abs(dy) * 0.35, 0.6, 1.5),
      sy: clamp(1 + Math.abs(dy) * 0.9 - Math.abs(dx) * 0.35, 0.6, 1.5),
    };
  });

  function releasePointer() {
    if (dragSticker) {
      dragSticker = null;
      autosave();
      return;
    }
    if (!dragging) return;
    dragging = false;
    target = { sx: 1, sy: 1, tx: 0, ty: 0 };
  }
  canvas.addEventListener('pointerup', releasePointer);
  canvas.addEventListener('pointercancel', releasePointer);

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
      const mime = MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
        ? 'video/webm;codecs=vp9' : 'video/webm';
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

      const blob = new Blob(chunks, { type: 'video/webm' });
      await deliver(blob, `mallang-${stamp()}.webm`);
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

  return { enter, save, exportImage, exportGif, exportVideo, stop };
})();
