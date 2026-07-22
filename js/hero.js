/* ─────────────────────────────────────────────────────────────
 * 홈 히어로 캐러셀 — 스타일 4종을 피규어처럼 회전 전시
 * 캐릭터 이미지는 외부 리소스 없이 말랑이 생성 엔진으로 직접 렌더링.
 * ───────────────────────────────────────────────────────────── */

const Hero = (() => {
  const ORDER = ['mochi', 'jelly', 'pudding', 'slime'];
  const BG = { mochi: '#E882B4', jelly: '#6EB5FF', pudding: '#F4845F', slime: '#6BBF7A' };

  let active = 0;
  let animating = false;
  let items = [];

  // 스타일별 데모용 "사진" — 생성 엔진에 넣을 소스 텍스처
  function samplePhoto(styleKey) {
    const c = document.createElement('canvas');
    c.width = c.height = 400;
    const x = c.getContext('2d');
    const palettes = {
      mochi:   ['#ffe3ec', '#ffb7cf', '#ff8fb0'],
      jelly:   ['#dff2ff', '#a5d8ff', '#6fb8ff'],
      pudding: ['#ffedc9', '#f7c873', '#d99a3d'],
      slime:   ['#e9ffd6', '#b2ee8a', '#7fd452'],
    };
    const [a, b, d] = palettes[styleKey];
    const g = x.createRadialGradient(160, 150, 40, 200, 200, 300);
    g.addColorStop(0, a);
    g.addColorStop(0.6, b);
    g.addColorStop(1, d);
    x.fillStyle = g;
    x.fillRect(0, 0, 400, 400);
    // 은은한 무늬
    x.fillStyle = 'rgba(255,255,255,0.35)';
    const spots = [[90, 90, 34], [300, 120, 26], [140, 300, 30], [310, 300, 20], [220, 200, 16]];
    for (const [sx, sy, r] of spots) {
      x.beginPath();
      x.arc(sx, sy, r, 0, Math.PI * 2);
      x.fill();
    }
    return c.toDataURL('image/png');
  }

  function roles() {
    return {
      [active]: 'center',
      [(active + 3) % 4]: 'left',
      [(active + 1) % 4]: 'right',
      [(active + 2) % 4]: 'back',
    };
  }

  function apply() {
    const map = roles();
    items.forEach((el, i) => {
      el.className = `hero-item pos-${map[i]}`;
    });
    const key = ORDER[active];
    document.getElementById('screen-home').style.backgroundColor = BG[key];
    const label = (Mallang.STYLES[key] && Mallang.STYLES[key].label) || key;
    document.getElementById('hero-style-name').textContent = label;
  }

  function navigate(dir) {
    if (animating) return;
    animating = true;
    active = dir === 'next' ? (active + 1) % 4 : (active + 3) % 4;
    apply();
    Sound.pop();
    setTimeout(() => { animating = false; }, 650);
  }

  async function init() {
    const carousel = document.getElementById('hero-carousel');
    for (const key of ORDER) {
      const canvas = await Mallang.generate(samplePhoto(key), key);
      const el = document.createElement('div');
      el.className = 'hero-item';
      const img = document.createElement('img');
      img.src = canvas.toDataURL('image/png');
      img.alt = `${Mallang.STYLES[key].label} 말랑이`;
      img.draggable = false;
      el.appendChild(img);
      carousel.appendChild(el);
      items.push(el);
    }
    apply();

    document.getElementById('hero-prev').addEventListener('click', () => navigate('prev'));
    document.getElementById('hero-next').addEventListener('click', () => navigate('next'));

    document.getElementById('hero-cta').addEventListener('click', () => {
      const key = ORDER[active];
      Sound.tap();
      App.show('upload');
      const card = document.querySelector(`.style-card[data-style="${key}"]`);
      if (card) card.click();
    });

    document.addEventListener('keydown', (e) => {
      if (!document.getElementById('screen-home').classList.contains('active')) return;
      if (e.key === 'ArrowLeft') navigate('prev');
      if (e.key === 'ArrowRight') navigate('next');
    });
  }

  window.addEventListener('load', init);

  return { navigate };
})();
