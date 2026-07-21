/* ─────────────────────────────────────────────────────────────
 * 말랑이 생성 엔진 (Mallang Engine)
 *
 * 사진을 말랑이(스퀴시) 캐릭터로 변환한다.
 * 현재는 온디바이스 캔버스 렌더링으로 동작하며,
 * 추후 실제 AI 이미지 생성 API(예: 이미지 변환 모델)로
 * generate()의 내부 구현만 교체하면 된다.
 * ───────────────────────────────────────────────────────────── */

const Mallang = (() => {
  const SIZE = 640;

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

    // 4) 테두리(림) — 말랑이 젤 같은 외곽
    blobPath(ctx, cx, cy, r, style, mulberry32(seed)); // 같은 시드로 동일 경로 재생성
    ctx.strokeStyle = style.rim;
    ctx.lineWidth = SIZE * 0.018;
    ctx.stroke();

    // 5) 얼굴
    drawFace(ctx, cx, cy, r, style);

    return canvas;
  }

  return { generate, STYLES };
})();
