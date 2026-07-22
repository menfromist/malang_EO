/* ─────────────────────────────────────────────────────────────
 * 초경량 GIF89a 인코더 (외부 의존성 없음)
 *
 * 미디언 컷으로 256색 팔레트를 만들고 LZW로 압축해
 * 반복 재생 GIF를 생성한다. 말랑이 흔들기 GIF 공유에 사용.
 * ───────────────────────────────────────────────────────────── */

const GifEncoder = (() => {
  /* ── 팔레트: 미디언 컷 ── */

  function buildPalette(samples, maxColors) {
    let boxes = [samples];

    function channelRanges(box) {
      let min = [255, 255, 255];
      let max = [0, 0, 0];
      for (const p of box) {
        for (let c = 0; c < 3; c++) {
          if (p[c] < min[c]) min[c] = p[c];
          if (p[c] > max[c]) max[c] = p[c];
        }
      }
      return [max[0] - min[0], max[1] - min[1], max[2] - min[2]];
    }

    while (boxes.length < maxColors) {
      // 가장 색 범위가 넓은 상자를 골라 중앙값에서 쪼갠다
      let bestIdx = -1;
      let bestRange = 0;
      let bestChannel = 0;
      boxes.forEach((box, i) => {
        if (box.length < 2) return;
        const ranges = channelRanges(box);
        const ch = ranges.indexOf(Math.max(...ranges));
        if (ranges[ch] > bestRange) {
          bestRange = ranges[ch];
          bestIdx = i;
          bestChannel = ch;
        }
      });
      if (bestIdx < 0 || bestRange === 0) break;

      const box = boxes[bestIdx];
      box.sort((a, b) => a[bestChannel] - b[bestChannel]);
      const mid = box.length >> 1;
      boxes.splice(bestIdx, 1, box.slice(0, mid), box.slice(mid));
    }

    return boxes.map((box) => {
      let r = 0, g = 0, b = 0;
      for (const p of box) { r += p[0]; g += p[1]; b += p[2]; }
      const n = box.length || 1;
      return [Math.round(r / n), Math.round(g / n), Math.round(b / n)];
    });
  }

  function makeIndexer(palette) {
    const cache = new Map();
    return (r, g, b) => {
      const key = ((r >> 2) << 12) | ((g >> 2) << 6) | (b >> 2);
      let idx = cache.get(key);
      if (idx !== undefined) return idx;
      let best = 0;
      let bestDist = Infinity;
      for (let i = 0; i < palette.length; i++) {
        const p = palette[i];
        const dr = r - p[0], dg = g - p[1], db = b - p[2];
        const dist = dr * dr + dg * dg + db * db;
        if (dist < bestDist) { bestDist = dist; best = i; }
      }
      cache.set(key, best);
      return best;
    };
  }

  /* ── LZW 압축 ── */

  function lzwEncode(indices, minCodeSize) {
    const CLEAR = 1 << minCodeSize;
    const EOI = CLEAR + 1;
    const bytes = [];
    let cur = 0;
    let curBits = 0;
    let codeSize = minCodeSize + 1;
    let next = EOI + 1;
    let dict = new Map();

    // 코드 크기 증가는 "비트를 내보낸 뒤" 판정해야 디코더와 동기가 맞는다
    // (compress.c 계열 인코더와 동일한 타이밍)
    const emit = (code) => {
      cur |= code << curBits;
      curBits += codeSize;
      while (curBits >= 8) {
        bytes.push(cur & 0xff);
        cur >>= 8;
        curBits -= 8;
      }
      if (next > (1 << codeSize) - 1 && codeSize < 12) codeSize++;
    };

    emit(CLEAR);
    let prev = indices[0];
    for (let i = 1; i < indices.length; i++) {
      const k = indices[i];
      const key = (prev << 8) | k;
      const found = dict.get(key);
      if (found !== undefined) {
        prev = found;
        continue;
      }
      emit(prev);
      if (next < 4096) {
        dict.set(key, next++);
      } else {
        emit(CLEAR);
        dict = new Map();
        next = EOI + 1;
        codeSize = minCodeSize + 1;
      }
      prev = k;
    }
    emit(prev);
    emit(EOI);
    if (curBits > 0) bytes.push(cur & 0xff);
    return bytes;
  }

  /* ── 파일 조립 ── */

  /**
   * @param {ImageData[]} frames  같은 크기의 프레임들
   * @param {number} width
   * @param {number} height
   * @param {number} delayCs  프레임 간격 (1/100초 단위)
   * @returns {Blob} image/gif (무한 반복)
   */
  function encode(frames, width, height, delayCs) {
    // 1) 전 프레임에서 샘플링해 공용 팔레트 생성
    const samples = [];
    const targetSamples = 24000;
    const perFrame = Math.ceil(targetSamples / frames.length);
    for (const frame of frames) {
      const data = frame.data;
      const total = width * height;
      const stride = Math.max(1, Math.floor(total / perFrame));
      for (let p = 0; p < total; p += stride) {
        const o = p * 4;
        samples.push([data[o], data[o + 1], data[o + 2]]);
      }
    }
    const palette = buildPalette(samples, 256);
    while (palette.length < 256) palette.push([0, 0, 0]);
    const indexOf = makeIndexer(palette);

    const out = [];
    const push = (...vals) => out.push(...vals);
    const pushStr = (s) => { for (const ch of s) out.push(ch.charCodeAt(0)); };
    const push16 = (v) => push(v & 0xff, (v >> 8) & 0xff);

    // 헤더 + 논리 화면 기술자 (전역 팔레트 256색)
    pushStr('GIF89a');
    push16(width);
    push16(height);
    push(0xf7, 0, 0);
    for (const [r, g, b] of palette) push(r, g, b);

    // 무한 반복 (Netscape 확장)
    push(0x21, 0xff, 0x0b);
    pushStr('NETSCAPE2.0');
    push(0x03, 0x01, 0x00, 0x00, 0x00);

    for (const frame of frames) {
      // 그래픽 제어 확장 (지연 시간)
      push(0x21, 0xf9, 0x04, 0x04);
      push16(delayCs);
      push(0x00, 0x00);

      // 이미지 기술자
      push(0x2c);
      push16(0); push16(0);
      push16(width); push16(height);
      push(0x00);

      // 픽셀 → 팔레트 인덱스 → LZW
      const data = frame.data;
      const indices = new Uint8Array(width * height);
      for (let p = 0; p < indices.length; p++) {
        const o = p * 4;
        indices[p] = indexOf(data[o], data[o + 1], data[o + 2]);
      }
      push(0x08); // 최소 코드 크기
      const compressed = lzwEncode(indices, 8);
      for (let i = 0; i < compressed.length; i += 255) {
        const chunk = compressed.slice(i, i + 255);
        push(chunk.length, ...chunk);
      }
      push(0x00);
    }

    push(0x3b); // 트레일러
    return new Blob([new Uint8Array(out)], { type: 'image/gif' });
  }

  return { encode };
})();
