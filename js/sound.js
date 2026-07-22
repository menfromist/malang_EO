/* ─────────────────────────────────────────────────────────────
 * 말랑 사운드 — WebAudio 합성 효과음 (음원 파일 없음)
 * 모든 소리는 사용자 제스처 안에서 재생되어 자동재생 정책과 호환.
 * ───────────────────────────────────────────────────────────── */

const Sound = (() => {
  const KEY = 'mallang.sound';
  let enabled = localStorage.getItem(KEY) !== 'off';
  let ctx = null;

  function ac() {
    if (!enabled) return null;
    try {
      ctx = ctx || new (window.AudioContext || window.webkitAudioContext)();
      if (ctx.state === 'suspended') ctx.resume();
      return ctx;
    } catch {
      return null; // 오디오 미지원 환경은 조용히 넘어감
    }
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
    osc.connect(g).connect(c.destination);
    osc.start(t);
    osc.stop(t + dur + 0.05);
  }

  /* ── 효과음 카탈로그 ── */

  // 버튼·칩 탭
  function tap() {
    tone({ type: 'triangle', from: 660, to: 520, dur: 0.05, gain: 0.05 });
  }

  // 뽁 — 누르기, 스티커 붙이기, 사진 업로드
  function pop() {
    tone({ type: 'sine', from: 420, to: 140, dur: 0.1, gain: 0.12 });
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
  }

  // 딩 — 저장 완료
  function ding() {
    tone({ type: 'sine', from: 880, dur: 0.32, gain: 0.09 });
    tone({ type: 'sine', from: 1320, dur: 0.26, gain: 0.04, delay: 0.02 });
  }

  // 슉 — 삭제·비우기
  function trash() {
    tone({ type: 'sawtooth', from: 420, to: 120, dur: 0.18, gain: 0.045 });
  }

  // 휙 — 던지기·빙글빙글
  function whoosh() {
    tone({ type: 'sawtooth', from: 180, to: 760, dur: 0.22, gain: 0.04 });
    tone({ type: 'sine', from: 300, to: 900, dur: 0.2, gain: 0.03, delay: 0.02 });
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

  return { tap, pop, boing, blip, sparkle, ding, trash, whoosh, toggle, isEnabled };
})();
