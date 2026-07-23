/* ─────────────────────────────────────────────────────────────
 * 말랑 사운드 — WebAudio 합성 효과음 (음원 파일 없음)
 * 모든 소리는 사용자 제스처 안에서 재생되어 자동재생 정책과 호환.
 * ───────────────────────────────────────────────────────────── */

const Sound = (() => {
  const KEY = 'mallang.sound';
  let enabled = localStorage.getItem(KEY) !== 'off';
  let ctx = null;

  let master = null;      // 컴프레서 → 출력 (여러 소리가 겹쳐도 깨지지 않게)
  let noiseBuf = null;    // 크래클·질감용 화이트 노이즈 버퍼

  function ac() {
    if (!enabled) return null;
    try {
      if (!ctx) {
        ctx = new (window.AudioContext || window.webkitAudioContext)();
        const comp = ctx.createDynamicsCompressor();
        comp.threshold.value = -18;
        comp.knee.value = 20;
        comp.ratio.value = 6;
        comp.attack.value = 0.002;
        comp.release.value = 0.12;
        comp.connect(ctx.destination);
        master = comp;

        noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
        const data = noiseBuf.getChannelData(0);
        for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
      }
      if (ctx.state === 'suspended') ctx.resume();
      return ctx;
    } catch {
      return null; // 오디오 미지원 환경은 조용히 넘어감
    }
  }

  // 필터 걸린 노이즈 조각 — 바삭·툽·솨 같은 '물성' 소리의 재료
  function noiseBurst({ freq = 2000, q = 6, dur = 0.02, gain = 0.08, delay = 0, type = 'bandpass' }) {
    const c = ac();
    if (!c) return;
    const t = c.currentTime + delay;
    const src = c.createBufferSource();
    src.buffer = noiseBuf;
    src.loop = true;
    src.loopStart = Math.random() * 0.5;
    src.loopEnd = src.loopStart + 0.5;
    const f = c.createBiquadFilter();
    f.type = type;
    f.frequency.setValueAtTime(freq, t);
    f.Q.value = q;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.0015); // 급격한 어택 = 깨지는 질감
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(master);
    src.start(t, src.loopStart);
    src.stop(t + dur + 0.03);
  }

  // 기본 톤: 주파수 램프 + 짧은 엔벨로프
  function tone({ type = 'sine', from = 440, to = from, dur = 0.1, gain = 0.08, delay = 0 }) {
    const c = ac();
    if (!c) return;
    const t = c.currentTime + delay;
    const osc = c.createOscillator();
    const g = c.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(from, t);
    if (to !== from) osc.frequency.exponentialRampToValueAtTime(Math.max(to, 1), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g).connect(master);
    osc.start(t);
    osc.stop(t + dur + 0.05);
  }

  /* ── 햅틱 진동 (Hoggan & Brewster CHI 2008: 촉각 피드백이 터치 수행 개선) ── */

  // iOS 사파리는 navigator.vibrate 미지원 → iOS 17.4+의
  // 네이티브 스위치(input[switch]) 토글 햅틱으로 폴백
  let hapticSwitch = null;
  function iosTick() {
    try {
      if (!hapticSwitch) {
        const label = document.createElement('label');
        label.ariaHidden = 'true';
        label.style.cssText = 'position:fixed;width:0;height:0;overflow:hidden;opacity:0;pointer-events:none;';
        const input = document.createElement('input');
        input.type = 'checkbox';
        input.setAttribute('switch', '');
        label.appendChild(input);
        document.body.appendChild(label);
        hapticSwitch = label;
      }
      hapticSwitch.click();
    } catch { /* 미지원 iOS 버전은 조용히 넘어감 */ }
  }

  function buzz(pattern) {
    try {
      if (navigator.vibrate) {
        navigator.vibrate(pattern);
        return;
      }
      // 진동 API가 없으면(아이폰) 패턴의 펄스 수만큼 햅틱 틱을 근사
      const pulses = Array.isArray(pattern) ? Math.ceil(pattern.length / 2) : 1;
      for (let i = 0; i < Math.min(pulses, 4); i++) {
        if (i === 0) iosTick();
        else setTimeout(iosTick, i * 45);
      }
    } catch { /* 미지원 기기 */ }
  }

  /* ── 효과음 카탈로그 (소리 + 진동을 짝지어 다감각 피드백) ── */

  // 버튼·칩 탭
  function tap() {
    tone({ type: 'triangle', from: 660, to: 520, dur: 0.05, gain: 0.05 });
    buzz(4);
  }

  // 뽁 — 누르기, 스티커 붙이기, 사진 업로드 (사인 드롭 + 부드러운 '툽' 노이즈)
  function pop() {
    tone({ type: 'sine', from: 420, to: 140, dur: 0.1, gain: 0.11 });
    noiseBurst({ type: 'lowpass', freq: 320, q: 1, dur: 0.06, gain: 0.1 });
    buzz(10);
  }

  // 통통 — 말랑이가 튕겨 돌아올 때
  function boing() {
    const c = ac();
    if (!c) return;
    const t = c.currentTime;
    const osc = c.createOscillator();
    const g = c.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(150, t);
    osc.frequency.linearRampToValueAtTime(330, t + 0.07);
    osc.frequency.linearRampToValueAtTime(180, t + 0.2);
    osc.frequency.linearRampToValueAtTime(240, t + 0.28);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.1, t + 0.015);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
    osc.connect(g).connect(c.destination);
    osc.start(t);
    osc.stop(t + 0.35);
    buzz([12, 40, 8]);
  }

  // 몽글 — 생성 진행 단계마다
  function blip() {
    tone({ type: 'sine', from: 560, to: 640, dur: 0.07, gain: 0.04 });
  }

  // 반짝 팡파레 — 말랑이 완성!
  function sparkle() {
    [523, 659, 784, 1047].forEach((f, i) => {
      tone({ type: 'triangle', from: f, dur: 0.2, gain: 0.07, delay: i * 0.07 });
    });
    buzz([8, 40, 8, 40, 14]);
  }

  // 딩 — 저장 완료
  function ding() {
    tone({ type: 'sine', from: 880, dur: 0.32, gain: 0.09 });
    tone({ type: 'sine', from: 1320, dur: 0.26, gain: 0.04, delay: 0.02 });
    buzz([8, 30, 12]);
  }

  // 슉 — 삭제·비우기
  function trash() {
    tone({ type: 'sawtooth', from: 420, to: 120, dur: 0.18, gain: 0.045 });
  }

  // 휙 — 던지기·빙글빙글 (공기 가르는 노이즈 스윕)
  function whoosh() {
    const c = ac();
    if (c) {
      const t = c.currentTime;
      const src = c.createBufferSource();
      src.buffer = noiseBuf;
      src.loop = true;
      const f = c.createBiquadFilter();
      f.type = 'bandpass';
      f.Q.value = 1.6;
      f.frequency.setValueAtTime(350, t);
      f.frequency.exponentialRampToValueAtTime(2600, t + 0.2);
      const g = c.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.09, t + 0.04);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.24);
      src.connect(f).connect(g).connect(master);
      src.start(t);
      src.stop(t + 0.3);
    }
    buzz(6);
  }

  // 바삭 — 왁뿌(왁스 깨기): 노이즈 파편이 겹치는 ASMR 크래클
  // intensity 0.5(문지르기)~2(크게 부서짐)에 따라 밀도·크기가 변한다
  function crackle(intensity = 1) {
    const k = Math.max(0.4, Math.min(intensity, 2));
    // 고음 '바삭' 파편들 — 매번 다른 주파수·간격이라 유기적으로 들린다
    const n = Math.round(5 + k * 5 + Math.random() * 3);
    let at = 0;
    for (let i = 0; i < n; i++) {
      noiseBurst({
        freq: 1800 * Math.pow(2, Math.random() * 1.6), // 1.8k~5.5kHz 로그 분포
        q: 5 + Math.random() * 7,
        dur: 0.008 + Math.random() * 0.02,
        gain: (0.06 + Math.random() * 0.08) * k,
        delay: at,
      });
      at += 0.004 + Math.random() * 0.02;
    }
    // 저음 '우직' 바디 — 부서지는 무게감
    noiseBurst({ freq: 420 + Math.random() * 380, q: 2.5, dur: 0.05 + 0.03 * k, gain: 0.09 * k });
    if (k > 1.2) {
      noiseBurst({ freq: 240, q: 1.5, dur: 0.09, gain: 0.08, delay: 0.015 });
    }
    buzz(k > 1.2 ? [6, 10, 5, 10, 6, 12, 8] : [5, 12, 4, 10, 5]);
  }

  // 펑! — 말랑이가 터질 때 (깊은 폭발 + 바람 빠지는 소리)
  function burst() {
    tone({ type: 'sine', from: 150, to: 35, dur: 0.35, gain: 0.22 });
    noiseBurst({ type: 'lowpass', freq: 500, q: 0.8, dur: 0.25, gain: 0.25 });
    noiseBurst({ type: 'bandpass', freq: 2500, q: 2, dur: 0.08, gain: 0.12 });
    noiseBurst({ type: 'bandpass', freq: 1200, q: 1.2, dur: 0.5, gain: 0.06, delay: 0.12 });
    buzz([30, 40, 15, 40, 60]);
  }

  // 퍽 — 터진 말랑이를 눌렀을 때의 힘없는 소리
  function thud() {
    tone({ type: 'sine', from: 120, to: 60, dur: 0.09, gain: 0.07 });
    noiseBurst({ type: 'lowpass', freq: 200, q: 1, dur: 0.05, gain: 0.06 });
    buzz(5);
  }

  /* ── 켜기/끄기 ── */

  function toggle() {
    enabled = !enabled;
    localStorage.setItem(KEY, enabled ? 'on' : 'off');
    if (enabled) ding();
    return enabled;
  }

  function isEnabled() {
    return enabled;
  }

  return { tap, pop, boing, blip, sparkle, ding, trash, whoosh, crackle, burst, thud, toggle, isEnabled };
})();
