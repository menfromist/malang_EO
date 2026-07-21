/* ── 말랑 Mallang — 앱 로직 (화면 전환·업로드·생성·저장·보관함) ── */

(() => {
  const STORAGE_KEY = 'mallang.library.v1';

  const state = {
    photo: null,          // 업로드한 원본 사진 (데이터 URL)
    style: 'mochi',       // 선택한 스타일
    resultDataUrl: null,  // 생성된 말랑이 (데이터 URL)
    saved: false,         // 현재 결과가 저장됐는지
  };

  const $ = (sel) => document.querySelector(sel);

  /* ───── 화면 전환 ───── */
  function show(name) {
    document.querySelectorAll('.screen').forEach((s) => s.classList.remove('active'));
    $(`#screen-${name}`).classList.add('active');
    if (name === 'library') renderLibrary();
    if (name === 'home') updateHomeCount();
  }

  document.querySelectorAll('[data-nav]').forEach((el) => {
    el.addEventListener('click', () => show(el.dataset.nav));
  });

  /* ───── 홈: 마스코트 꾹 누르기 ───── */
  const logoBlob = $('#logo-blob');
  logoBlob.addEventListener('pointerdown', () => {
    logoBlob.classList.remove('squished');
    void logoBlob.offsetWidth; // 애니메이션 재시작
    logoBlob.classList.add('squished');
  });

  /* ───── 보관함 데이터 ───── */
  function loadLibrary() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
    } catch {
      return [];
    }
  }

  function saveLibrary(items) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  }

  function updateHomeCount() {
    const n = loadLibrary().length;
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

    let step = 0;
    const ticker = setInterval(() => {
      step = Math.min(step + 1, GENERATING_MESSAGES.length - 1);
      text.textContent = GENERATING_MESSAGES[step];
      fill.style.width = `${Math.min(20 + step * 25, 92)}%`;
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
      state.saved = false;
      drawResult(canvas);
      setTimeout(() => show('result'), 250);
    } catch (err) {
      clearInterval(ticker);
      toast(err.message || '생성에 실패했어요. 다시 시도해 주세요');
      show('upload');
    }
  });

  function drawResult(sourceCanvas) {
    const target = $('#result-canvas');
    const ctx = target.getContext('2d');
    ctx.clearRect(0, 0, target.width, target.height);
    ctx.drawImage(sourceCanvas, 0, 0, target.width, target.height);
  }

  /* ───── 결과: 말랑말랑 인터랙션 ───── */
  const resultCanvas = $('#result-canvas');
  let squishTimer = null;

  function squish(scaleX, scaleY) {
    resultCanvas.style.transition = 'transform 0.15s ease';
    resultCanvas.style.transform = `scale(${scaleX}, ${scaleY})`;
  }

  resultCanvas.addEventListener('pointerdown', (e) => {
    resultCanvas.setPointerCapture(e.pointerId);
    squish(1.15, 0.8);
  });

  function release() {
    clearTimeout(squishTimer);
    // 통통 튀며 원래대로
    squish(0.9, 1.12);
    squishTimer = setTimeout(() => squish(1.05, 0.96), 150);
    squishTimer = setTimeout(() => squish(1, 1), 300);
  }
  resultCanvas.addEventListener('pointerup', release);
  resultCanvas.addEventListener('pointercancel', release);

  /* ───── 결과 저장 ───── */
  $('#btn-save').addEventListener('click', () => {
    if (!state.resultDataUrl) return;
    if (state.saved) {
      toast('이미 저장된 말랑이에요!');
      return;
    }
    const items = loadLibrary();
    items.unshift({
      id: `m_${Date.now()}`,
      image: state.resultDataUrl,
      style: state.style,
      createdAt: new Date().toISOString(),
    });
    try {
      saveLibrary(items);
      state.saved = true;
      toast('보관함에 저장했어요! 🍡');
    } catch {
      toast('저장 공간이 가득 찼어요. 보관함을 정리해 주세요');
    }
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

  function renderLibrary() {
    const items = loadLibrary();
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
    });
  }

  /* ───── 상세 모달 ───── */
  const modal = $('#detail-modal');
  let detailId = null;

  function openDetail(id) {
    const item = loadLibrary().find((i) => i.id === id);
    if (!item) return;
    detailId = id;
    $('#detail-img').src = item.image;
    $('#detail-meta').textContent = `${styleLabel(item.style)} 스타일 · ${formatDate(item.createdAt)}`;
    $('#btn-download').href = item.image;
    $('#btn-download').download = `mallang-${styleLabel(item.style)}.png`;
    modal.hidden = false;
  }

  $('#btn-close-modal').addEventListener('click', () => (modal.hidden = true));
  modal.addEventListener('click', (e) => {
    if (e.target === modal) modal.hidden = true;
  });

  $('#btn-delete').addEventListener('click', () => {
    if (!detailId) return;
    saveLibrary(loadLibrary().filter((i) => i.id !== detailId));
    modal.hidden = true;
    renderLibrary();
    toast('말랑이를 삭제했어요');
  });

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
})();
