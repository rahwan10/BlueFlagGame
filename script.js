"use strict";

const CHAR_STATE = {
  STAND: "./img/graffe_standing.png",
  JUMP: "./img/graffe_jump.png",
  LIE: "./img/graffe_lieDown.png",
};

let currentState = "STAND";
function setCharState(state) {
  currentState = state;
  document.getElementById("char").src = CHAR_STATE[state];
}
const Metronome = (() => {
  let intervalId = null;
  let swingLeft = true;
  let armEl = null;
  let bobEl = null;
  let beatMs = 374.6;

  function init(ms) {
    beatMs = ms || window._BEAT_MS || 374.6;

    // 메트로놈 HTML을 .left-col 안에 주입
    const leftCol = document.querySelector(".left-col");
    leftCol.insertAdjacentHTML(
      "afterbegin",
      `
      <div class="metronome" id="metronome">
        <div class="metro-arm" id="metroArm">
          <div class="metro-bob" id="metroBob"></div>
        </div>
        <div class="metro-pivot"></div>
      </div>
    `,
    );

    armEl = document.getElementById("metroArm");
    bobEl = document.getElementById("metroBob");

    // arm 높이를 left-col 높이에 맞게
    resizeArm();
    window.addEventListener("resize", resizeArm);
  }

  function resizeArm() {
    if (!armEl) return;
    const leftCol = document.querySelector(".left-col");
    const h = leftCol.clientHeight * 0.6;
    armEl.style.height = h + "px";
    // bob은 arm 상단에 위치
    bobEl.style.top = "0px";
  }

  function start() {
    if (!armEl) init();
    stop();
    swing(); // 즉시 첫 스윙
    intervalId = setInterval(swing, beatMs);
  }

  function swing() {
    if (!armEl) return;

    // arm 방향 전환
    swingLeft = !swingLeft;
    armEl.style.transition = `transform ${beatMs * 0.9}ms ease-in-out`;
    armEl.classList.toggle("swing", swingLeft);

    // bob 색 잠깐 바꾸기
    bobEl.classList.add("beat");
    setTimeout(() => bobEl && bobEl.classList.remove("beat"), 80);
  }

  function stop() {
    if (intervalId) {
      clearInterval(intervalId);
      intervalId = null;
    }
  }

  return { init, start, stop };
})();
let charTimer;
function charAct(action) {
  clearTimeout(charTimer);
  if (action === "UP") {
    setCharState("JUMP");
  } else if (action === "DOWN") {
    setCharState("LIE");
  } else {
    setCharState("STAND");
  }
  charTimer = setTimeout(() => {
    setCharState("STAND");
  }, 200);
}
// ══════════════════════════════════════════════
//  AUDIO ENGINE
// ══════════════════════════════════════════════
let bgmReady = false;

async function preloadBGM() {
  if (bgmReady) return;
  await BGM.init();
  bgmReady = true;
}

const BGM = (() => {
  let audio;

  function init() {
    audio = new Audio("bgm.mp3");
    audio.loop = true;
    audio.preload = "auto";
  }

  function play() {
    if (!audio) init();
    audio.play();
  }

  function stop() {
    if (!audio) return;
    audio.pause();
    audio.currentTime = 0;
  }

  return { init, play, stop };
})();
const Audio$ = (() => {
  let ctx = null;
  function init() {
    if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
  }
  function resume() {
    init();
    if (ctx.state === "suspended") ctx.resume();
  }
  function tone(freq, dur, vol, type = "sine", delay = 0) {
    if (!ctx) return;
    const o = ctx.createOscillator(),
      g = ctx.createGain();
    o.type = type;
    o.frequency.value = freq;
    o.connect(g);
    g.connect(ctx.destination);
    const t = ctx.currentTime + delay;
    g.gain.setValueAtTime(0.001, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.start(t);
    o.stop(t + dur + 0.02);
  }
  const reveal = () => tone(660, 0.07, 0.2);
  const cue = () => tone(880, 0.06, 0.3); // input phase start cue
  const tick = () => tone(550, 0.05, 0.18); // per-slot cue during input
  const perfect = () => {
    tone(1047, 0.12, 0.35);
    tone(1319, 0.12, 0.25, "sine", 0.09);
  };
  const ok = () => tone(880, 0.1, 0.25);
  const miss = () => tone(160, 0.22, 0.3, "sawtooth");
  const restOk = () => tone(440, 0.08, 0.2);
  const frog = () => {
    const el = document.getElementById("frogSfx");
    el.currentTime = 0;
    el.play();
  };
  return { resume, reveal, cue, tick, perfect, ok, miss, restOk, frog };
})();

// ══════════════════════════════════════════════
//  COMMAND POOL
// ══════════════════════════════════════════════
const POOL_BY_ROUND = {
  1: {
    UP: [{ text: "뛰어!", action: "UP" }],
    DOWN: [{ text: "엎드려!", action: "DOWN" }],
    REST: [{ text: "가만히", action: "REST" }],
  },
  2: {
    UP: [
      { text: "뛰어!", action: "UP" },
      { text: "점프!", action: "UP" },
    ],
    DOWN: [
      { text: "엎드려!", action: "DOWN" },
      { text: "아래로!", action: "DOWN" },
    ],
    REST: [
      { text: "가만히", action: "REST" },
      { text: "그대로", action: "REST" },
    ],
  },
  3: {
    UP: [
      { text: "뛰어!", action: "UP" },
      { text: "점프!", action: "UP" },
      { text: "위로!", action: "UP" },
    ],
    DOWN: [
      { text: "엎드려!", action: "DOWN" },
      { text: "아래로!", action: "DOWN" },
      { text: "숙여!", action: "DOWN" },
    ],
    REST: [
      { text: "가만히", action: "REST" },
      { text: "그대로", action: "REST" },
      { text: "쉬어", action: "REST" },
    ],
  },
  // 4, 5라운드는 청개구리 모드라 REVERSE_POOL 사용
};
function getPoolLevel(round) {
  if (round <= 3) return 1;
  if (round <= 5) return 2;
  return 3;
}

const REVERSE_POOL = {
  UP: [{ text: "엎드려!", action: "UP" }],
  DOWN: [{ text: "뛰어!", action: "DOWN" }],
  REST: [{ text: "가만히", action: "REST" }],
};

function pickCmd(action, round) {
  //console.log("pickCmd", action);
  const level = getPoolLevel(round);
  const p = POOL_BY_ROUND[level][action];
  return { ...p[Math.floor(Math.random() * p.length)] };
}
function pickReverseCmd(action) {
  //console.log("pickReverseCmd", action);
  const p = REVERSE_POOL[action];
  return { ...p[Math.floor(Math.random() * p.length)] };
}

function genSequence(isReverse, round) {
  // Always include at least one of each, 4th slot random
  const base = ["UP", "DOWN", "REST"];

  const bag = [];

  // 1) 기본 3개는 무조건 포함
  bag.push(...base);

  // 2) 나머지 5개 랜덤 생성
  const all = ["UP", "DOWN", "REST"];

  for (let i = 0; i < 5; i++) {
    const r = all[Math.floor(Math.random() * all.length)];
    bag.push(r);
  }
  // Fisher-Yates shuffle
  for (let i = bag.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [bag[i], bag[j]] = [bag[j], bag[i]];
  }
  return bag.map((a) => (isReverse ? pickReverseCmd(a) : pickCmd(a, round)));
}

// ══════════════════════════════════════════════
//  INPUT HANDLER
// ══════════════════════════════════════════════
const InputHandler = (() => {
  let cb = null;
  function setCallback(fn) {
    cb = fn;
  }

  function press(dir) {
    Audio$.resume();
    if (cb) cb(dir, performance.now());
    // button visual
    const ids = { UP: "btnUp", DOWN: "btnDown", REST: "btnRest" };
    const el = document.getElementById(ids[dir]);
    if (el) {
      el.classList.add("pressed");
      setTimeout(() => el.classList.remove("pressed"), 0);
    }
  }

  document.addEventListener("keydown", (e) => {
    if (e.repeat) return;
    if (e.key === "ArrowUp" || e.key === "w") press("UP");
    else if (e.key === "ArrowDown" || e.key === "s") press("DOWN");
    else if (e.key === " " || e.key === "ArrowRight") {
      e.preventDefault();
      press("REST");
    }
  });

  return { setCallback, press };
})();

// ══════════════════════════════════════════════
//  UI
// ══════════════════════════════════════════════
const UI = (() => {
  const charEl = document.getElementById("char");
  const judgEl = document.getElementById("judgment");
  const scoreEl = document.getElementById("scoreEl");
  const lifeEl = document.getElementById("lifeEl");
  const comboEl = document.getElementById("comboEl");
  const roundEl = document.getElementById("roundEl");
  const phaseShowEl = document.getElementById("phaseShow");
  const phaseInpEl = document.getElementById("phaseInput");
  const pipRowEl = document.getElementById("pipRow");
  const slotsEl = document.getElementById("slotsEl");
  const loadingEl = document.getElementById("loadingScreen");
  //const timingHit = document.getElementById("timingHit");
  //const timingStatus = document.getElementById("timingStatus");

  const ICON = { UP: "▲", DOWN: "▼", REST: "―" };
  const COLOR = { UP: "var(--green)", DOWN: "var(--blue)", REST: "var(--dim)" };
  const CLS = { UP: "s-up", DOWN: "s-down", REST: "s-rest" };
  const HINT = { UP: "↑ 위", DOWN: "↓ 아래", REST: "안 누름" };

  // ── Slots
  function buildSlots() {
    slotsEl.innerHTML = "";
    for (let i = 0; i < 8; i++) {
      const d = document.createElement("div");
      d.className = "slot s-hidden";
      d.id = "slot" + i;
      d.innerHTML = `
        <span class="slot-num">${i + 1}</span>
        <span class="slot-text" id="st${i}"></span>
        <span class="slot-hint" id="sh${i}"></span>
        `;
      slotsEl.appendChild(d);
    }
  }
  function revealSlot(i, cmd) {
    const s = document.getElementById("slot" + i);
    s.className = "slot " + CLS[cmd.action];

    document.getElementById("st" + i).textContent = cmd.text;
    // document.getElementById("st" + i).style.color = COLOR[cmd.action];
    // document.getElementById("sh" + i).textContent = HINT[cmd.action];
  }

  function setSlotActive(i) {
    const s = document.getElementById("slot" + i);
    s.classList.add("s-active");
    // animate timing bar full → empty over BEAT_MS
  }

  function clearSlotActive(i) {
    const s = document.getElementById("slot" + i);
    s.classList.remove("s-active");
    const f = document.getElementById("sf" + i);
    f.style.transition = "none";
    f.style.transform = "scaleX(0)";
  }

  function setSlotResult(i, grade) {
    const s = document.getElementById("slot" + i);
    s.classList.remove("s-active");
    s.classList.add(grade === "miss" ? "s-miss" : "s-ok");
    const hint = document.getElementById("sh" + i);
    if (grade === "perfect") {
      hint.textContent = "✦ PERFECT";
      hint.style.color = "var(--green)";
    } else if (grade === "ok") {
      hint.textContent = "✓ OK";
      hint.style.color = "var(--blue)";
    } else {
      hint.textContent = "✗ MISS";
      hint.style.color = "var(--red)";
    }
  }

  // ── Phase bar
  function setPhase(p) {
    phaseShowEl.className = "phase-half" + (p === "show" ? " active-show" : "");
    phaseInpEl.className =
      "phase-half" + (p === "input" ? " active-input" : "");
  }

  // ── Character

  // ── Judgment popup
  let judgTimer;
  function showJudgment(grade, expected) {
    clearTimeout(judgTimer);
    const labels = { perfect: "✦ PERFECT!", ok: "✓ OK!", miss: "✗ MISS" };
    judgEl.textContent = labels[grade] || "?";
    judgEl.className = `judgment show ${grade === "miss" ? "miss" : "ok"}`;
    judgTimer = setTimeout(() => {
      judgEl.className = "judgment";
    }, 650);
  }

  // ── HUD
  function updateHUD(score, combo, life) {
    scoreEl.textContent = score;
    comboEl.textContent = combo;
    lifeEl.textContent =
      "❤".repeat(Math.max(0, life)) + "🖤".repeat(Math.max(0, 5 - life));
  }

  // ── Round / pips
  function setRound(r, total) {
    roundEl.textContent = `${r} / ${total}`;
  }
  function addPip(ok) {
    const p = document.createElement("div");
    p.className = "pip " + (ok ? "p-ok" : "p-miss");
    pipRowEl.appendChild(p);
  }
  function clearPips() {
    pipRowEl.innerHTML = "";
  }

  // ── Overlays
  function showStart() {
    document.getElementById("startScreen").classList.remove("hidden");
  }
  function hideStart() {
    document.getElementById("startScreen").classList.add("hidden");
  }
  function showResult(score, perfect, ok, miss, success) {
    document.getElementById("resultScreen").classList.remove("hidden");
    const t = document.getElementById("resTitle");
    t.textContent = success ? "클리어! 🎉" : "게임오버 💀";
    t.style.color = success ? "var(--green)" : "var(--red)";
    document.getElementById("resScore").textContent = score;
    document.getElementById("resDetail").innerHTML =
      `<span>PERFECT <b>${perfect}</b></span><span>OK <b>${ok}</b></span><span>MISS <b>${miss}</b></span>`;
  }
  function hideResult() {
    document.getElementById("resultScreen").classList.add("hidden");
  }
  function showLoading() {
    loadingEl.classList.remove("hidden");
  }
  function hideLoading() {
    loadingEl.classList.add("hidden");
  }

  function showAnnounce(text, color = "var(--green)") {
    const el = document.getElementById("roundAnnounce");
    // 이전 타이머 취소
    if (el._timer) clearTimeout(el._timer);

    el.textContent = text;
    el.style.color = color;
    el.classList.add("show");
    el._timer = setTimeout(() => {
      el.classList.remove("show");
      el._timer = null;
    }, 2500);
  }
  return {
    buildSlots,
    revealSlot,
    setSlotActive,
    clearSlotActive,
    setSlotResult,
    setPhase,
    charAct,
    showJudgment,
    showLoading,
    hideLoading,
    updateHUD,
    setRound,
    addPip,
    clearPips,
    showStart,
    hideStart,
    showResult,
    hideResult,
    showAnnounce,
  };
})();

// ══════════════════════════════════════════════
//  GAME CONTROLLER
// ══════════════════════════════════════════════
const Game = (() => {
  const TOTAL_ROUNDS = 10;
  // const BEAT_MS_FAST = 328; //작게하면 빨라짐
  // // 퍼펙트 판정이 되는 최대 얼리 타이밍 (ms)
  // const PERFECT_MS_FAST = 100;
  // const OK_MS_FAST = 220;
  // const DELAY_MS_FAST = 150;

  const BEAT_MS = 374.6; //작게하면 빨라짐
  // 퍼펙트 판정이 되는 최대 얼리 타이밍 (ms)
  const PERFECT_MS = 100;
  const OK_MS = 220;
  const MAX_LIFE = 5;
  const DELAY_MS = -0;

  window._BEAT_MS = BEAT_MS;

  let state = {};
  let timers = [];
  let roundSlotResults = [];

  function T(fn, ms) {
    const id = setTimeout(fn, ms);
    timers.push(id);
    return id;
  }

  function clearAll() {
    timers.forEach(clearTimeout);
    timers = [];
    InputHandler.setCallback(null);
  }

  // ─────────────────────────────
  // STAR
  // ─────────────────────────────

  async function start(isReverse) {
    BGM.stop();
    UI.hideStart();
    Audio$.resume();

    state = {
      round: 0,
      score: 0,
      combo: 0,
      life: MAX_LIFE,
      pCount: 0,
      oCount: 0,
      mCount: 0,
    };

    UI.clearPips();
    UI.updateHUD(0, 0, MAX_LIFE);
    //UI.setTimingStatus("대기중...");
    BGM.play(0);
    T(
      () => {
        nextRound(isReverse);
        // Metronome.start();
      },
      BEAT_MS * 8 + DELAY_MS,
    );
  }

  function restart(isReverse) {
    UI.hideResult();
    clearAll();
    BGM.stop();
    start(isReverse);
    submitBtn.disabled = false;
  }

  function goTitle() {
    //Metronome.stop();
    UI.hideResult();
    clearAll();
    UI.showStart();
  }
  async function handleStart(isReverse) {
    Audio$.resume();
    UI.showLoading(); // 있으면
    await preloadBGM(); // 있으면

    setTimeout(() => {
      UI.hideLoading();
      start(isReverse);
    }, 3000);
  }

  // ─────────────────────────────
  // ROUND
  // ─────────────────────────────
  function nextRound(isReverse) {
    if (state.round >= TOTAL_ROUNDS) return endGame(true);
    state.round++;
    if (state.round === 8) {
      isReverse = true;
      Audio$.frog();
      // 8라운드부터 청개구리 모드

      const el = document.getElementById("frogFlash");
      el.classList.remove("on");
      void el.offsetWidth; // reflow로 애니메이션 리셋
      el.classList.add("on");
    }
    if (state.round === 3 || state.round === 5) {
      UI.showAnnounce("⚡ LEVEL UP!");
    }
    if (state.round === 8) {
      UI.showAnnounce("지금부터 🐸 청개구리 모드!", "var(--yellow)");
    }
    clearAll();

    state.seq = genSequence(isReverse, state.round);
    roundSlotResults = Array(8).fill(false);

    UI.buildSlots();
    UI.setRound(state.round, TOTAL_ROUNDS);
    UI.setPhase("show");
    //UI.setTimingStatus("보기 페이즈...");

    InputHandler.setCallback(null);

    const now = performance.now();

    // ─────────────────────────
    // SHOW PHASE (절대시간 기반)
    // ─────────────────────────
    for (let i = 0; i < 8; i++) {
      const showTime = now + i * BEAT_MS;

      T(() => {
        Audio$.reveal();
        UI.revealSlot(i, state.seq[i]);
      }, showTime - now);
    }

    // ─────────────────────────
    // INPUT START
    // ─────────────────────────
    const inputStart = now + 8 * BEAT_MS;

    T(() => {
      UI.setPhase("input");
      Audio$.cue();
      //UI.setTimingStatus("입력 페이즈 — 타이밍!");
    }, inputStart - now);

    // ─────────────────────────
    // INPUT BEATS
    // ─────────────────────────
    for (let i = 0; i < 8; i++) {
      const beatTime = inputStart + i * BEAT_MS; // 입력 허용을 비트 시작보다 약간 앞당김 (음향 큐와 시각 효과를 고려)
      T(() => {
        Audio$.tick();
        UI.setSlotActive(i);

        const expected = state.seq[i].action;
        let judged = false;

        // ───── INPUT CALLBACK ─────
        InputHandler.setCallback((dir, pressTime) => {
          if (judged) return;
          judged = true;
          // 콜백을 즉시 null로 치우지 말고, 다음 비트 시작 직전에 null 처리
          // handleJudge 안에서 setCallback(null) 제거

          const diffMs = pressTime - beatTime;
          handleJudge(i, dir, expected, diffMs);

          // 다음 슬롯 비트 시작 100ms 전까지 입력 차단
          const lockUntil = beatTime + BEAT_MS - 80;
          const remaining = lockUntil - performance.now();
          if (remaining > 0) {
            setTimeout(() => InputHandler.setCallback(null), remaining);
          } else {
            InputHandler.setCallback(null);
          }
        });

        // ───── AUTO MISS ─────
        T(() => {
          if (judged) return;
          judged = true;
          InputHandler.setCallback(null);
          handleMiss(i, expected);
        }, BEAT_MS * 0.88);
      }, beatTime - now);
    }

    // ─────────────────────────
    // NEXT ROUND
    // ─────────────────────────
    T(() => endRound(isReverse), inputStart + 8 * BEAT_MS - now);
  }
  function endRound(isReverse) {
    InputHandler.setCallback(null);
    UI.setPhase("");

    roundSlotResults.forEach((ok) => UI.addPip(ok));

    T(() => {
      if (state.round >= TOTAL_ROUNDS) {
        endGame(true);
      } else {
        nextRound(isReverse);
      }
    }, 0);
  }

  // ─────────────────────────────
  // JUDGEMENT
  // ─────────────────────────────
  function handleJudge(i, dir, expected, diffMs) {
    const abs = Math.abs(diffMs);

    if (expected === "REST") {
      UI.setSlotResult(i, "miss");
      //UI.showTimingHit(diffMs, "miss");
      UI.showJudgment("miss", expected);
      charAct(expected);
      Audio$.miss();
      applyGrade(i, "miss");
      return;
    }

    if (dir !== expected) {
      UI.setSlotResult(i, "miss");
      //UI.showTimingHit(diffMs, "miss");
      UI.showJudgment("miss", expected);
      charAct(expected);
      Audio$.miss();
      applyGrade(i, "miss");
      return;
    }

    const grade =
      abs <= PERFECT_MS
        ? "perfect"
        : abs <= OK_MS
          ? "ok" // early perfect 범위 밖이어도 ok로 잡힘
          : "miss";

    UI.setSlotResult(i, grade);
    //UI.showTimingHit(diffMs, grade);
    UI.charAct(expected);
    UI.showJudgment(grade, expected);

    if (grade === "perfect") Audio$.perfect();
    else if (grade === "ok") Audio$.ok();
    else Audio$.miss();

    applyGrade(i, grade);
  }

  function handleMiss(i, expected) {
    if (expected === "REST") {
      UI.setSlotResult(i, "perfect");
      //UI.showTimingHit(0, "perfect");
      UI.showJudgment("perfect", "REST");
      Audio$.restOk();
      applyGrade(i, "perfect");
    } else {
      UI.setSlotResult(i, "miss");
      //UI.setTimingStatus("MISS — 입력 없음");
      UI.showJudgment("miss", expected);
      Audio$.miss();
      applyGrade(i, "miss");
    }
  }

  // ─────────────────────────────
  // SCORE
  // ─────────────────────────────
  function applyGrade(i, grade) {
    const ok = grade !== "miss";
    roundSlotResults[i] = ok;

    if (grade === "perfect") {
      state.score += 300 + state.combo * 20;
      state.combo++;
      state.pCount++;
    } else if (grade === "ok") {
      state.score += 150 + state.combo * 10;
      state.combo++;
      state.oCount++;
    } else {
      state.combo = 0;
      state.life--;
      if (state.life < 0) {
        state.life = 0;
        state.score -= 300;
      }
      state.mCount++;
    }

    UI.updateHUD(state.score, state.combo, state.life);

    // if (state.life <= 0) {
    //   clearAll();
    //   BGM.stop();
    //   T(() => endGame(false), 0);
    // }
  }

  function endGame(success) {
    //Metronome.stop();
    InputHandler.setCallback(null);
    if (state.score < 0) state.score = 0;
    T(() => {
      BGM.stop();
      submitBtn.disabled = false;
      UI.showResult(
        state.score,
        state.pCount,
        state.oCount,
        state.mCount,
        success,
      );
    }, 300);
  }

  return { start, restart, goTitle, handleStart };
})();
// ─────────────────────────────
// tutorial
// ─────────────────────────────
const Tutorial = (() => {
  const STEPS = [
    // ── 기본 동작
    { text: "▲ 위 키를 눌러보세요!", action: "UP", guide: "뛰어!" },
    { text: "▼ 아래 키를 눌러보세요!", action: "DOWN", guide: "엎드려!" },
    { text: "아무키도 누르지 마세요!", action: "REST", guide: "가만히" },
    // ── 같은 의미 다른 말
    { text: "같은 뜻이에요! ▲ 눌러보세요", action: "UP", guide: "점프!" },
    { text: "이것도 같아요! ▼ 눌러보세요", action: "DOWN", guide: "숙여!" },
    { text: "이것도 쉬는 거예요!", action: "REST", guide: "그대로" },
    // ── 청개구리 예고 (action: null = 자동진행)
    { text: "⚠ 청개구리 모드 체험!", action: null, guide: "반대로!" },
    // ── 청개구리 실습
    {
      text: "🐸 엎드려 → 실제론 ▲!",
      action: "UP",
      guide: "엎드려!",
      isRebel: true,
    },
    {
      text: "🐸 뛰어 → 실제론 ▼!",
      action: "DOWN",
      guide: "뛰어!",
      isRebel: true,
    },
    // ── 마무리
    { text: "완벽! 이제 시작해봐요 🎮", action: null, guide: "" },
  ];

  let stepIdx = 0;
  let timers = [];

  function T(fn, ms) {
    const id = setTimeout(fn, ms);
    timers.push(id);
    return id;
  }

  function clearAll() {
    timers.forEach(clearTimeout);
    timers = [];
    InputHandler.setCallback(null);
  }

  function start() {
    Audio$.resume();
    document.getElementById("startScreen").classList.add("hidden");
    stepIdx = 0;
    UI.buildSlots();
    UI.setPhase("");
    showStep();
  }

  function showStep() {
    if (stepIdx >= STEPS.length) {
      end();
      return;
    }

    const step = STEPS[stepIdx];

    // ── action: null → 자동 진행 스텝
    if (step.action === null) {
      if (step.guide === "반대로!") {
        // 청개구리 플래시 + 소리
        Audio$.frog();
        const el = document.getElementById("frogFlash");
        el.classList.remove("on");
        void el.offsetWidth;
        el.classList.add("on");
        UI.showAnnounce(
          "🐸 청개구리 모드! 반대로 눌러야 해요!",
          "var(--yellow)",
        );
      } else {
        // 마무리
        UI.showAnnounce(step.text, "var(--green)");
        UI.setPhase("");
      }
      stepIdx++;
      T(() => showStep(), 2200);
      return;
    }

    // ── 안내 텍스트
    UI.showAnnounce(step.text, step.isRebel ? "var(--yellow)" : "var(--blue)");

    // ── 슬롯 첫 번째 칸에 가이드 표시
    UI.buildSlots();
    const slot = document.getElementById("slot0");
    slot.className = "slot s-active";
    document.getElementById("st0").textContent = step.guide;
    if (step.isRebel) {
      slot.style.boxShadow = "inset 0 0 0 2px var(--yellow)";
    }

    UI.setPhase("input");
    Audio$.tick();

    // ── REST: 안 누르면 통과, 누르면 miss
    if (step.action === "REST") {
      InputHandler.setCallback(() => {
        UI.showJudgment("miss", "REST");
        Audio$.miss();
      });
      T(() => {
        InputHandler.setCallback(null);
        slot.className = "slot s-ok";
        UI.showJudgment("perfect", "REST");
        Audio$.restOk();
        charAct("REST");
        stepIdx++;
        T(() => showStep(), 800);
      }, 1800);
      return;
    }

    // ── UP / DOWN: 맞으면 통과, 틀리면 재시도
    InputHandler.setCallback((dir) => {
      if (dir !== step.action) {
        UI.showAnnounce(
          step.isRebel ? "🐸 반대로 누르세요!" : "다시 해보세요!",
          "var(--red)",
        );
        Audio$.miss();
        return;
      }
      InputHandler.setCallback(null);
      slot.className = "slot s-ok";
      UI.showJudgment("perfect", step.action);
      Audio$.perfect();
      charAct(step.action);
      stepIdx++;
      T(() => showStep(), 800);
    });
  }

  function end() {
    clearAll();
    UI.setPhase("");
    UI.buildSlots();
    T(() => {
      document.getElementById("startScreen").classList.remove("hidden");
    }, 2500);
  }

  return { start };
})();

// init
UI.showStart();

// leaderboard.js
const CONFIG = {
  API_BASE_URL: import.meta.env.VITE_API_BASE_URL,
  API_KEY: import.meta.env.VITE_API_KEY,
};
const submitBtn = document.getElementById("submitBtn");
const userIdInput = document.getElementById("userId");
const resDetail = document.getElementById("resDetail");
const resScore = document.getElementById("resScore");

submitBtn.addEventListener("click", async () => {
  const userId = userIdInput.value.trim();

  // 점수 가져오기
  const score = Number(resScore.textContent);
  if (!userId) {
    resDetail.textContent = "아이디를 입력해주세요.";
    return;
  }

  try {
    submitBtn.disabled = true;
    submitBtn.textContent = "전송 중...";

    const response = await fetch(CONFIG.API_BASE_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apiKey: CONFIG.API_KEY,
      },
      body: JSON.stringify({
        userId,
        gameName: "green-blue-white",
        score,
      }),
    });

    if (!response.ok) {
      throw new Error("POST 실패");
    }

    const data = await response.json();

    console.log(data);

    resDetail.textContent = data.message || "점수가 등록되었습니다.";
  } catch (error) {
    console.error(error);
    submitBtn.disabled = false;
    resDetail.textContent = "점수 등록 중 오류가 발생했습니다.";
  } finally {
    userIdInput.value = "";
    submitBtn.textContent = "확인";
  }
});
window.Game = Game;
window.Tutorial = Tutorial;
