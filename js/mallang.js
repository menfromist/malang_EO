/* ─────────────────────────────────────────────────────────────
 * 말랑이 생성 엔진 (Mallang Engine)
 *
 * 사진을 말랑이(스퀴시) 캐릭터로 변환하고,
 * 꾸미기(배경·모자·스티커) 합성을 담당한다.
 * 현재는 온디바이스 캔버스 렌더링으로 동작하며,
 * 추후 실제 AI 이미지 생성 API로 generate()의 내부 구현만
 * 교체하면 나머지 앱은 그대로 동작한다.
 * ───────────────────────────────────────────────────────────── */

const Mallang = (() => {
  const SIZE = 640;
  const EMOJI_FONT = '"Noto Color Emoji", "Apple Color Emoji", "Segoe UI Emoji", sans-serif';

  // 스타일 정의: 틴트 색, 광택, 블롭 모양의 성격
  const STYLES = {
    mochi: {
      label: '모찌',
      tint: 'rgba(255, 214, 228, 0.55)',
      rim: '#ffb6c9',
      gloss: 0.35,
      wobble: 0.055,
      points: 8,
      cheek: 'rgba(255, 138, 168, 0.55)',
    },
    jelly: {
      label: '젤리',
      tint: 'rgba(180, 225, 255, 0.45)',
      rim: '#8fd3ff',
      gloss: 0.7,
      wobble: 0.075,
      points: 7,
      cheek: 'rgba(120, 180, 255, 0.45)',
    },
    pudding: {
      label: '푸딩',
      tint: 'rgba(255, 224, 170, 0.5)',
      rim: '#f2c063',
      gloss: 0.5,
      wobble: 0.05,
      points: 6,
      cheek: 'rgba(240, 160, 90, 0.5)',
    },
    slime: {
      label: '슬라임',
      tint: 'rgba(190, 255, 190, 0.5)',
      rim: '#8fe08f',
      gloss: 0.6,
      wobble: 0.11,
      points: 9,
      cheek: 'rgba(110, 200, 110, 0.5)',
    },
  };

  /* ── 꾸미기 카탈로그 ── */

  const BACKGROUNDS = [
    { id: 'none', label: '없음', css: 'transparent' },
    { id: 'peach', label: '피치', css: 'linear-gradient(160deg,#ffe5d4,#ffc9d8)' },
    { id: 'mint', label: '민트', css: 'linear-gradient(160deg,#e0fff5,#b8f2e6)' },
    { id: 'lavender', label: '라벤더', css: 'linear-gradient(160deg,#f3ecff,#e3d7ff)' },
    { id: 'dots', label: '도트', css: 'radial-gradient(circle at 30% 30%, #ffb6c9 12%, #fff3e8 13%)' },
    { id: 'night', label: '밤하늘', css: 'linear-gradient(160deg,#2b2350,#4a3f75)' },
  ];

  const HATS = [
    { id: 'none', label: '없음', emoji: '' },
    { id: 'top', label: '모자', emoji: '🎩' },
    { id: 'crown', label: '왕관', emoji: '👑' },
    { id: 'ribbon', label: '리본', emoji: '🎀' },
    { id: 'cap', label: '캡', emoji: '🧢' },
    { id: 'flower', label: '꽃', emoji: '🌸' },
  ];

  const STICKERS = ['⭐', '❤️', '✨', '🌈', '🍓', '🎵', '🫧', '🍬'];

  // 밤하늘 별 위치 (고정 시드)
  const NIGHT_STARS = [
    [0.12, 0.14], [0.3, 0.07], [0.55, 0.12], [0.8, 0.08], [0.92, 0.22],
    [0.07, 0.42], [0.9, 0.5], [0.15, 0.78], [0.5, 0.93], [0.85, 0.85],
    [0.4, 0.2], [0.68, 0.9], [0.25, 0.9],
  ];

  function normalizeDeco(deco) {
    return {
      bg: (deco && deco.bg) || 'none',
      hat: (deco && deco.hat) || 'none',
      stickers: (deco && Array.isArray(deco.stickers)) ? deco.stickers : [],
    };
  }

  function hasDeco(deco) {
    const d = normalizeDeco(deco);
    return d.bg !== 'none' || d.hat !== 'none' || d.stickers.length > 0;
  }

  /* ── 유틸 ── */

  // 시드 기반 의사 난수 — 같은 사진+스타일이면 같은 모양이 나오도록
  function mulberry32(seed) {
    return function () {
      seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function loadImage(src) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('이미지를 불러올 수 없어요'));
      img.src = src;
    });
  }

  // 울퉁불퉁한 말랑이 블롭 경로 만들기
  function blobPath(ctx, cx, cy, r, style, rand) {
    const pts = [];
    const n = style.points;
    for (let i = 0; i < n; i++) {
      const angle = (i / n) * Math.PI * 2;
      const radius = r * (1 - style.wobble + rand() * style.wobble * 2);
      pts.push({
        x: cx + Math.cos(angle) * radius,
        y: cy + Math.sin(angle) * radius * 0.92, // 살짝 눌린 찐빵 느낌
      });
    }
    ctx.beginPath();
    for (let i = 0; i < n; i++) {
      const p0 = pts[i];
      const p1 = pts[(i + 1) % n];
      const mx = (p0.x + p1.x) / 2;
      const my = (p0.y + p1.y) / 2;
      if (i === 0) ctx.moveTo(mx, my);
      else ctx.quadraticCurveTo(p0.x, p0.y, mx, my);
    }
    const pLast = pts[0];
    const mFirst = { x: (pts[0].x + pts[1 % pts.length].x) / 2, y: (pts[0].y + pts[1 % pts.length].y) / 2 };
    ctx.quadraticCurveTo(pLast.x, pLast.y, mFirst.x, mFirst.y);
    ctx.closePath();
  }

  function drawFace(ctx, cx, cy, r, style) {
    const eyeY = cy - r * 0.02;
    const eyeGap = r * 0.34;
    const eyeR = r * 0.075;

    // 볼터치
    ctx.fillStyle = style.cheek;
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.ellipse(cx + side * r * 0.52, eyeY + r * 0.22, r * 0.13, r * 0.085, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    // 눈 (반짝이 포함)
    for (const side of [-1, 1]) {
      const ex = cx + side * eyeGap;
      ctx.fillStyle = '#3d3238';
      ctx.beginPath();
      ctx.ellipse(ex, eyeY, eyeR, eyeR * 1.18, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.95)';
      ctx.beginPath();
      ctx.arc(ex - eyeR * 0.32, eyeY - eyeR * 0.38, eyeR * 0.36, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(ex + eyeR * 0.3, eyeY + eyeR * 0.35, eyeR * 0.16, 0, Math.PI * 2);
      ctx.fill();
    }

    // 입
    ctx.strokeStyle = '#3d3238';
    ctx.lineWidth = r * 0.028;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.arc(cx, eyeY + r * 0.16, r * 0.09, 0.15 * Math.PI, 0.85 * Math.PI);
    ctx.stroke();
  }

  /* ── 스타일별 시그니처 ── */

  // 블롭 뒤에 그려지는 요소 (모찌 귀)
  function drawSignatureBehind(ctx, cx, cy, r, styleKey) {
    if (styleKey !== 'mochi') return;
    ctx.fillStyle = '#ffd9e3';
    ctx.strokeStyle = '#ffb6c9';
    ctx.lineWidth = r * 0.03;
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.ellipse(cx + side * r * 0.5, cy - r * 0.82, r * 0.19, r * 0.24, side * 0.45, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
  }

  // 블롭 위에 그려지는 요소 (푸딩 카라멜·젤리 기포·슬라임 흘러내림)
  function drawSignatureFront(ctx, cx, cy, r, styleKey, seed) {
    if (styleKey === 'pudding') {
      ctx.save();
      blobPath(ctx, cx, cy, r, STYLES.pudding, mulberry32(seed));
      ctx.clip();
      const g = ctx.createLinearGradient(0, cy - r, 0, cy - r * 0.2);
      g.addColorStop(0, 'rgba(150, 85, 30, 0.8)');
      g.addColorStop(0.7, 'rgba(190, 120, 50, 0.45)');
      g.addColorStop(1, 'rgba(190, 120, 50, 0)');
      ctx.fillStyle = g;
      ctx.fillRect(cx - r, cy - r, r * 2, r * 0.8);
      // 크림 한 덩이
      ctx.fillStyle = 'rgba(255, 250, 240, 0.95)';
      ctx.beginPath();
      ctx.ellipse(cx, cy - r * 0.8, r * 0.22, r * 0.12, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    if (styleKey === 'jelly') {
      ctx.fillStyle = 'rgba(255,255,255,0.4)';
      for (const [dx, dy, br] of [[-0.45, 0.45, 0.07], [0.5, 0.3, 0.05], [0.35, 0.62, 0.045]]) {
        ctx.beginPath();
        ctx.arc(cx + dx * r, cy + dy * r, r * br, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    if (styleKey === 'slime') {
      ctx.fillStyle = 'rgba(125, 205, 125, 0.9)';
      for (const [dx, len] of [[-0.32, 0.3], [0.05, 0.42], [0.42, 0.24]]) {
        const x = cx + dx * r;
        const y0 = cy + r * 0.62;
        const w = r * 0.085;
        ctx.beginPath();
        ctx.roundRect(x - w / 2, y0, w, r * len, w / 2);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(x, y0 + r * len, w * 0.62, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  /**
   * 사진 → 말랑이 변환
   * @param {string} imageSrc  데이터 URL 또는 이미지 URL
   * @param {string} styleKey  'mochi' | 'jelly' | 'pudding' | 'slime'
   * @returns {Promise<HTMLCanvasElement>} 640x640 투명 배경 캔버스
   */
  async function generate(imageSrc, styleKey) {
    const style = STYLES[styleKey] || STYLES.mochi;
    const img = await loadImage(imageSrc);

    // 사진 내용 기반 시드 → 같은 입력이면 같은 말랑이
    let seed = imageSrc.length;
    for (let i = 0; i < Math.min(imageSrc.length, 500); i += 7) {
      seed = (seed * 31 + imageSrc.charCodeAt(i)) | 0;
    }
    for (const c of styleKey) seed = (seed * 31 + c.charCodeAt(0)) | 0;
    const rand = mulberry32(seed);

    const canvas = document.createElement('canvas');
    canvas.width = SIZE;
    canvas.height = SIZE;
    const ctx = canvas.getContext('2d');

    const cx = SIZE / 2;
    const cy = SIZE / 2;
    const r = SIZE * 0.42;

    // 0) 블롭 뒤 요소 (모찌 귀)
    drawSignatureBehind(ctx, cx, cy, r, styleKey);

    // 1) 블롭 모양으로 클리핑하여 사진 채우기
    ctx.save();
    blobPath(ctx, cx, cy, r, style, rand);
    ctx.clip();

    // 중앙 정사각형 크롭 후 블롭 영역을 덮도록 그리기
    const srcSide = Math.min(img.width, img.height);
    const sx = (img.width - srcSide) / 2;
    const sy = (img.height - srcSide) / 2;
    const pad = r * 2.15;
    ctx.filter = 'saturate(1.25) brightness(1.08) contrast(0.95)';
    ctx.drawImage(img, sx, sy, srcSide, srcSide, cx - pad / 2, cy - pad / 2, pad, pad);
    ctx.filter = 'none';

    // 2) 스타일 틴트 (말랑이 재질감)
    ctx.fillStyle = style.tint;
    ctx.fillRect(0, 0, SIZE, SIZE);

    // 아래쪽 음영 → 볼륨감
    const shade = ctx.createRadialGradient(cx, cy - r * 0.3, r * 0.2, cx, cy + r * 0.4, r * 1.35);
    shade.addColorStop(0, 'rgba(255,255,255,0)');
    shade.addColorStop(1, 'rgba(120, 70, 90, 0.28)');
    ctx.fillStyle = shade;
    ctx.fillRect(0, 0, SIZE, SIZE);

    // 3) 광택 하이라이트
    ctx.globalAlpha = style.gloss;
    const gloss = ctx.createRadialGradient(cx - r * 0.4, cy - r * 0.5, 0, cx - r * 0.4, cy - r * 0.5, r * 0.75);
    gloss.addColorStop(0, 'rgba(255,255,255,0.95)');
    gloss.addColorStop(0.4, 'rgba(255,255,255,0.35)');
    gloss.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = gloss;
    ctx.fillRect(0, 0, SIZE, SIZE);
    ctx.globalAlpha = 1;

    ctx.restore();

    // 4) 테두리(림) — 같은 시드로 동일 경로 재생성
    blobPath(ctx, cx, cy, r, style, mulberry32(seed));
    ctx.strokeStyle = style.rim;
    ctx.lineWidth = SIZE * 0.018;
    ctx.stroke();

    // 5) 스타일 시그니처 + 얼굴
    drawSignatureFront(ctx, cx, cy, r, styleKey, seed);
    drawFace(ctx, cx, cy, r, style);

    return canvas;
  }

  /* ── 꾸미기 합성 ── */

  function drawBackground(ctx, size, bgId) {
    if (!bgId || bgId === 'none') return;
    if (bgId === 'peach' || bgId === 'mint' || bgId === 'lavender') {
      const colors = {
        peach: ['#ffe5d4', '#ffc9d8'],
        mint: ['#e0fff5', '#b8f2e6'],
        lavender: ['#f3ecff', '#e3d7ff'],
      }[bgId];
      const g = ctx.createLinearGradient(0, 0, size * 0.4, size);
      g.addColorStop(0, colors[0]);
      g.addColorStop(1, colors[1]);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, size, size);
    } else if (bgId === 'dots') {
      ctx.fillStyle = '#fff3e8';
      ctx.fillRect(0, 0, size, size);
      ctx.fillStyle = 'rgba(255, 182, 201, 0.65)';
      const step = size / 6;
      for (let row = 0; row < 7; row++) {
        for (let col = 0; col < 7; col++) {
          const x = col * step + (row % 2 ? step / 2 : 0);
          ctx.beginPath();
          ctx.arc(x, row * step, size * 0.03, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    } else if (bgId === 'night') {
      const g = ctx.createLinearGradient(0, 0, size * 0.3, size);
      g.addColorStop(0, '#2b2350');
      g.addColorStop(1, '#4a3f75');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, size, size);
      ctx.fillStyle = 'rgba(255, 250, 210, 0.9)';
      for (const [nx, ny] of NIGHT_STARS) {
        ctx.beginPath();
        ctx.arc(nx * size, ny * size, size * 0.008, 0, Math.PI * 2);
        ctx.fill();
      }
      // 초승달
      ctx.font = `${size * 0.09}px ${EMOJI_FONT}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('🌙', size * 0.86, size * 0.12);
    }
  }

  // 말랑이 + 모자 + 스티커를 한 장의 레이어로 (스퀴시할 때 함께 움직이도록)
  function buildLayer(baseImg, deco, size) {
    const d = normalizeDeco(deco);
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(baseImg, 0, 0, size, size);

    const hat = HATS.find((h) => h.id === d.hat);
    if (hat && hat.emoji) {
      ctx.font = `${size * 0.24}px ${EMOJI_FONT}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(hat.emoji, size / 2, size * 0.13);
    }

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const s of d.stickers) {
      ctx.font = `${(s.s || 0.16) * size}px ${EMOJI_FONT}`;
      ctx.fillText(s.e, s.x * size, s.y * size);
    }
    return canvas;
  }

  // 정지 화면 합성 (보관함 썸네일·다운로드·상세용)
  function composeStill(baseImg, deco, size, opts = {}) {
    const d = normalizeDeco(deco);
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (opts.solidBg) {
      ctx.fillStyle = '#fff7f0';
      ctx.fillRect(0, 0, size, size);
    }
    drawBackground(ctx, size, d.bg);
    ctx.drawImage(buildLayer(baseImg, d, size), 0, 0);
    return canvas;
  }

  return {
    generate, loadImage, STYLES,
    BACKGROUNDS, HATS, STICKERS,
    normalizeDeco, hasDeco,
    drawBackground, buildLayer, composeStill,
  };
})();
