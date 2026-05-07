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
  let ctx;
  let buffer;
  let source;

  async function init() {
    if (!ctx) ctx = new AudioContext();

    const res = await fetch("bgm.mp3");
    const arrayBuffer = await res.arrayBuffer();
    buffer = await ctx.decodeAudioData(arrayBuffer);
  }
  let startTime = 0;
  function play(startAt = 0) {
    if (!ctx || !buffer) return;

    source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(ctx.destination);

    const now = ctx.currentTime;
    source.start(now, startAt); // ⭐ 정확한 싱크 시작
  }

  function stop() {
    if (source) source.stop();
  }

  return { init, play, stop, ctx };
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
  if (round <= 2) return 1;
  if (round <= 4) return 2;
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
      "❤".repeat(Math.max(0, life)) + "🖤".repeat(Math.max(0, 3 - life));
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
    el.textContent = text;
    el.style.color = color;
    el.classList.add("show");
    setTimeout(() => el.classList.remove("show"), 2500);
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

  const BEAT_MS = 375; //작게하면 빨라짐
  // 퍼펙트 판정이 되는 최대 얼리 타이밍 (ms)
  const PERFECT_MS = 100;
  const OK_MS = 220;
  const MAX_LIFE = 5;
  const DELAY_MS = 0;

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
  // START
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
      },
      BEAT_MS * 8 + DELAY_MS,
    );
  }

  function restart(isReverse) {
    UI.hideResult();
    clearAll();
    BGM.stop();
    start(isReverse);
  }

  function goTitle() {
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
    Audio$.frog();
    if (state.round >= TOTAL_ROUNDS) return endGame(true);
    if (state.round === 5) {
      isReverse = true;
      // 5라운드부터 청개구리 모드

      const el = document.getElementById("frogFlash");
      el.classList.remove("on");
      void el.offsetWidth; // reflow로 애니메이션 리셋
      el.classList.add("on");
    }
    if (state.round % 2 === 1 && state.round > 1) {
      UI.showAnnounce("⚡ LEVEL UP!");
    }
    if (isReverse) {
      UI.showAnnounce("🐸 청개구리 모드!", "var(--yellow)");
    }
    clearAll();

    state.round++;
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
      UI.setSlotResult(i, "ok");
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
      state.mCount++;
    }

    UI.updateHUD(state.score, state.combo, state.life);

    if (state.life <= 0) {
      clearAll();
      BGM.stop();
      T(() => endGame(false), 0);
    }
  }

  function endGame(success) {
    InputHandler.setCallback(null);

    T(() => {
      BGM.stop();
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

// init
UI.showStart();
