/* ── 말랑 Mallang — 앱 로직 (화면 전환·업로드·생성·저장·보관함) ── */

const App = (() => {
  const state = {
    photo: null,          // 업로드한 원본 사진 (데이터 URL)
    style: 'mochi',       // 선택한 스타일
    resultDataUrl: null,  // 생성된 말랑이 (데이터 URL)
    savedItemId: null,    // 결과를 저장한 보관함 아이템 id
  };

  const $ = (sel) => document.querySelector(sel);

  /* ───── 화면 전환 ───── */
  function show(name) {
    document.querySelectorAll('.screen').forEach((s) => s.classList.remove('active'));
    $(`#screen-${name}`).classList.add('active');
    if (name !== 'play') Play.stop();
    if (name === 'library') renderLibrary();
    if (name === 'home') updateHomeCount();
  }

  document.querySelectorAll('[data-nav]').forEach((el) => {
    el.addEventListener('click', () => show(el.dataset.nav));
  });

  /* ───── 사운드 ───── */
  const btnSound = $('#btn-sound');
  function reflectSound() {
    btnSound.textContent = Sound.isEnabled() ? '🔊' : '🔇';
    btnSound.classList.toggle('muted', !Sound.isEnabled());
  }
  btnSound.addEventListener('click', () => {
    Sound.toggle();
    reflectSound();
    toast(Sound.isEnabled() ? '소리를 켰어요! 🔊' : '소리를 껐어요 🔇');
  });
  reflectSound();

  // 버튼·칩·탭 공통 탭 사운드 (놀이터 캔버스는 자체 사운드 사용)
  document.addEventListener('pointerdown', (e) => {
    if (e.target.closest('.btn, .btn-back, .style-card, .tab, .chip, .emoji-btn, .action-btn, .library-item, .hero-round-sm')) {
      Sound.tap();
    }
  }, true);

  function updateHomeCount() {
    const n = Store.load().length;
    $('#home-count').textContent = n > 0 ? String(n) : '';
  }

  /* ───── 사진 업로드 ───── */
  const fileInput = $('#file-input');
  const dropZone = $('#drop-zone');
  const preview = $('#upload-preview');
  const placeholder = $('#upload-placeholder');
  const btnGenerate = $('#btn-generate');

  function setPhoto(dataUrl) {
    state.photo = dataUrl;
    preview.src = dataUrl;
    preview.hidden = false;
    placeholder.hidden = true;
    btnGenerate.disabled = false;
    Sound.pop();
  }

  function readFile(file) {
    if (!file || !file.type.startsWith('image/')) {
      toast('이미지 파일을 선택해 주세요');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setPhoto(reader.result);
    reader.readAsDataURL(file);
  }

  fileInput.addEventListener('change', () => readFile(fileInput.files[0]));

  ['dragover', 'dragleave', 'drop'].forEach((type) => {
    dropZone.addEventListener(type, (e) => {
      e.preventDefault();
      dropZone.classList.toggle('dragover', type === 'dragover');
      if (type === 'drop') readFile(e.dataTransfer.files[0]);
    });
  });

  /* ───── 스타일 선택 ───── */
  document.querySelectorAll('.style-card').forEach((card) => {
    card.addEventListener('click', () => {
      document.querySelectorAll('.style-card').forEach((c) => c.classList.remove('selected'));
      card.classList.add('selected');
      state.style = card.dataset.style;
    });
  });

  /* ───── AI 생성 흐름 ───── */
  const GENERATING_MESSAGES = [
    '말랑말랑 반죽하는 중...',
    '몰캉몰캉 모양 잡는 중...',
    '반짝반짝 광택 내는 중...',
    '귀여운 얼굴 그리는 중...',
  ];

  btnGenerate.addEventListener('click', async () => {
    if (!state.photo) return;
    show('generating');

    const fill = $('#progress-fill');
    const text = $('#generating-text');
    fill.style.width = '0%';

    let stepIdx = 0;
    const ticker = setInterval(() => {
      stepIdx = Math.min(stepIdx + 1, GENERATING_MESSAGES.length - 1);
      text.textContent = GENERATING_MESSAGES[stepIdx];
      fill.style.width = `${Math.min(20 + stepIdx * 25, 92)}%`;
      Sound.blip();
    }, 550);
    text.textContent = GENERATING_MESSAGES[0];
    fill.style.width = '20%';

    try {
      // 생성 엔진 호출 (+ 최소 연출 시간 보장)
      const [canvas] = await Promise.all([
        Mallang.generate(state.photo, state.style),
        new Promise((r) => setTimeout(r, 2200)),
      ]);
      clearInterval(ticker);
      fill.style.width = '100%';

      state.resultDataUrl = canvas.toDataURL('image/png');
      state.savedItemId = null;
      drawResult(canvas);
      Sound.sparkle();
      setTimeout(() => {
        show('result');
        celebrate($('.result-stage'));
      }, 250);
    } catch (err) {
      clearInterval(ticker);
      toast(err.message || '생성에 실패했어요. 다시 시도해 주세요');
      show('upload');
    }
  });

  function drawResult(sourceCanvas) {
    const target = $('#result-canvas');
    const rctx = target.getContext('2d');
    rctx.clearRect(0, 0, target.width, target.height);
    rctx.drawImage(sourceCanvas, 0, 0, target.width, target.height);
  }

  /* ───── 결과: 말랑말랑 미리보기 ───── */
  const resultCanvas = $('#result-canvas');

  function squish(scaleX, scaleY) {
    resultCanvas.style.transition = 'transform 0.15s ease';
    resultCanvas.style.transform = `scale(${scaleX}, ${scaleY})`;
  }

  resultCanvas.addEventListener('pointerdown', (e) => {
    resultCanvas.setPointerCapture(e.pointerId);
    squish(1.15, 0.8);
    Sound.pop();
  });

  function release() {
    squish(0.9, 1.12);
    setTimeout(() => squish(1.05, 0.96), 150);
    setTimeout(() => squish(1, 1), 300);
    Sound.boing();
  }
  resultCanvas.addEventListener('pointerup', release);
  resultCanvas.addEventListener('pointercancel', release);

  /* ───── 결과 저장 · 놀이터 이동 ───── */
  $('#btn-save').addEventListener('click', () => {
    if (!state.resultDataUrl) return;
    if (state.savedItemId) {
      toast('이미 저장된 말랑이에요!');
      return;
    }
    try {
      const item = Store.add({
        image: state.resultDataUrl,
        style: state.style,
        deco: null,
      });
      state.savedItemId = item.id;
      Sound.ding();
      celebrate($('.result-stage'));
      toast('보관함에 저장했어요! 🍡');
    } catch {
      toast('저장 공간이 가득 찼어요. 보관함을 정리해 주세요');
    }
  });

  $('#btn-play').addEventListener('click', () => {
    if (!state.resultDataUrl) return;
    Play.enter({
      baseDataUrl: state.resultDataUrl,
      styleKey: state.style,
      deco: state.savedItemId ? (Store.get(state.savedItemId) || {}).deco : null,
      itemId: state.savedItemId,
      returnTo: 'result',
    });
  });

  $('#btn-retry').addEventListener('click', () => show('upload'));

  /* ───── 보관함 ───── */
  function styleLabel(key) {
    return (Mallang.STYLES[key] && Mallang.STYLES[key].label) || key;
  }

  function formatDate(iso) {
    const d = new Date(iso);
    return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
  }

  // 꾸민 상태까지 합성한 이미지 데이터 URL (썸네일·다운로드용)
  async function compositeDataUrl(item, size) {
    const img = await Mallang.loadImage(item.image);
    if (!Mallang.hasDeco(item.deco)) {
      if (size >= 640) return item.image;
      const c = document.createElement('canvas');
      c.width = size; c.height = size;
      c.getContext('2d').drawImage(img, 0, 0, size, size);
      return c.toDataURL('image/png');
    }
    return Mallang.composeStill(img, item.deco, size).toDataURL('image/png');
  }

  function renderLibrary() {
    const items = Store.load();
    const grid = $('#library-grid');
    const empty = $('#library-empty');
    grid.innerHTML = '';
    empty.hidden = items.length > 0;

    items.forEach((item) => {
      const btn = document.createElement('button');
      btn.className = 'library-item';
      btn.innerHTML = `
        <img src="${item.image}" alt="${styleLabel(item.style)} 말랑이">
        <span class="item-label">${styleLabel(item.style)} · ${formatDate(item.createdAt)}</span>`;
      btn.addEventListener('click', () => openDetail(item.id));
      grid.appendChild(btn);

      // 꾸민 말랑이는 합성 썸네일로 교체
      if (Mallang.hasDeco(item.deco)) {
        compositeDataUrl(item, 320).then((url) => {
          btn.querySelector('img').src = url;
        });
      }
    });
  }

  /* ───── 상세 모달 ───── */
  const modal = $('#detail-modal');
  let detailId = null;

  async function openDetail(id) {
    const item = Store.get(id);
    if (!item) return;
    detailId = id;
    $('#detail-img').src = item.image;
    $('#detail-meta').textContent = `${styleLabel(item.style)} 스타일 · ${formatDate(item.createdAt)}`;
    modal.hidden = false;

    const url = await compositeDataUrl(item, 640);
    $('#detail-img').src = url;
    $('#btn-download').href = url;
    $('#btn-download').download = `mallang-${styleLabel(item.style)}.png`;
  }

  $('#btn-close-modal').addEventListener('click', () => (modal.hidden = true));
  modal.addEventListener('click', (e) => {
    if (e.target === modal) modal.hidden = true;
  });

  $('#btn-delete').addEventListener('click', () => {
    if (!detailId) return;
    Store.remove(detailId);
    modal.hidden = true;
    renderLibrary();
    Sound.trash();
    toast('말랑이를 삭제했어요');
  });

  $('#btn-play-item').addEventListener('click', () => {
    const item = Store.get(detailId);
    if (!item) return;
    modal.hidden = true;
    Play.enter({
      baseDataUrl: item.image,
      styleKey: item.style,
      deco: item.deco,
      itemId: item.id,
      returnTo: 'library',
    });
  });

  /* ───── 축하 파티클 (성취 순간의 주시 피드백) ───── */
  function celebrate(target, emojis = ['✨', '⭐', '💖', '🎉', '🫧']) {
    if (!target) return;
    for (let i = 0; i < 12; i++) {
      const s = document.createElement('span');
      s.className = 'burst-particle';
      s.textContent = emojis[i % emojis.length];
      const a = Math.random() * Math.PI * 2;
      const d = 60 + Math.random() * 90;
      s.style.setProperty('--dx', `${Math.cos(a) * d}px`);
      s.style.setProperty('--dy', `${Math.sin(a) * d - 40}px`);
      s.style.animationDelay = `${Math.random() * 0.12}s`;
      target.appendChild(s);
      setTimeout(() => s.remove(), 1400);
    }
  }

  /* ───── 토스트 ───── */
  let toastTimer = null;
  function toast(message) {
    const el = $('#toast');
    el.textContent = message;
    el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => (el.hidden = true), 2200);
  }

  /* ───── 시작 ───── */
  updateHomeCount();

  // PWA: 홈 화면 앱 경험 (지원 환경에서만, 실패해도 조용히 진행)
  if ('serviceWorker' in navigator && location.protocol === 'https:') {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('sw.js').catch(() => {});
    });
  }

  return { show, toast, celebrate };
})();
