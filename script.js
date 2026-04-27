"use strict";

// ══════════════════════════════════════════════
//  AUDIO ENGINE
// ══════════════════════════════════════════════
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
  return { resume, reveal, cue, tick, perfect, ok, miss, restOk };
})();

// ══════════════════════════════════════════════
//  COMMAND POOL
// ══════════════════════════════════════════════
const POOL = {
  UP: [
    { text: "뛰어!", action: "UP" },
    { text: "점프!", action: "UP" },
    //{ text: "위로!", action: "UP" },
    //{ text: "올라!", action: "UP" },
    //{ text: "도약!", action: "UP" },
  ],
  DOWN: [
    { text: "엎드려!", action: "DOWN" },
    { text: "아래로!", action: "DOWN" },
    //{ text: "숙여!", action: "DOWN" },
    //{ text: "낮춰!", action: "DOWN" },
    //{ text: "내려!", action: "DOWN" },
  ],
  REST: [
    { text: "가만히", action: "REST" },
    //{ text: "그대로", action: "REST" },
    //{ text: "쉬어", action: "REST" },
    //{ text: "멈춰", action: "REST" },
  ],
};

function pickCmd(action) {
  const p = POOL[action];
  return { ...p[Math.floor(Math.random() * p.length)] };
}

function genSequence() {
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
  return bag.map((a) => pickCmd(a));
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
    if (e.key === "ArrowUp") press("UP");
    else if (e.key === "ArrowDown") press("DOWN");
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
  const timingHit = document.getElementById("timingHit");
  const timingStatus = document.getElementById("timingStatus");

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
        <span class="slot-icon" id="si${i}">?</span>
        <span class="slot-hint" id="sh${i}"></span>
        <div class="slot-tbar"><div class="slot-tfill" id="sf${i}"></div></div>`;
      slotsEl.appendChild(d);
    }
  }

  function revealSlot(i, cmd) {
    const s = document.getElementById("slot" + i);
    s.className = "slot " + CLS[cmd.action];
    document.getElementById("si" + i).textContent = ICON[cmd.action];
    document.getElementById("si" + i).style.color = COLOR[cmd.action];
    document.getElementById("st" + i).textContent = cmd.text;
    document.getElementById("st" + i).style.color = COLOR[cmd.action];
    document.getElementById("sh" + i).textContent = HINT[cmd.action];
  }

  function setSlotActive(i) {
    const s = document.getElementById("slot" + i);
    s.classList.add("s-active");
    // animate timing bar full → empty over BEAT_MS
    const f = document.getElementById("sf" + i);
    f.style.transition = "none";
    f.style.transform = "scaleX(1)";
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        f.style.transition = `transform ${window._BEAT_MS}ms linear`;
        f.style.transform = "scaleX(0)";
      }),
    );
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

  // ── Timing visualizer
  function showTimingHit(diffMs, grade) {
    // diffMs: signed, negative = early, positive = late
    // map to 0–100% where 50% = perfect center, ±800ms = full range
    const range = 800;
    const pct = 50 + (diffMs / range) * 100;
    const clamped = Math.max(2, Math.min(98, pct));
    timingHit.style.left = clamped + "%";
    timingHit.className = `timing-hit show h-${grade}`;
    timingStatus.textContent =
      grade === "miss"
        ? `MISS  (${diffMs > 0 ? "+" : ""}${Math.round(diffMs)}ms)`
        : `${grade.toUpperCase()}  (${diffMs > 0 ? "+" : ""}${Math.round(diffMs)}ms)`;
    setTimeout(() => {
      timingHit.classList.remove("show");
    }, 700);
  }

  function setTimingStatus(txt) {
    timingStatus.textContent = txt;
  }

  // ── Character
  let charTimer;
  function charAct(action, ok) {
    clearTimeout(charTimer);
    charEl.className = "char";
    if (!ok) {
      charEl.textContent = "😵";
      charEl.classList.add("s-miss");
      charTimer = setTimeout(() => {
        charEl.className = "char";
        charEl.textContent = "🧍";
      }, 450);
      return;
    }
    if (action === "UP") {
      charEl.textContent = "🤸";
      charEl.classList.add("s-up");
    } else if (action === "DOWN") {
      charEl.textContent = "🙇";
      charEl.classList.add("s-down");
    } else {
      charEl.textContent = "🧍";
    }
    charTimer = setTimeout(() => {
      charEl.className = "char";
      charEl.textContent = "🧍";
    }, 500);
  }

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

  return {
    buildSlots,
    revealSlot,
    setSlotActive,
    clearSlotActive,
    setSlotResult,
    setPhase,
    charAct,
    showJudgment,
    showTimingHit,
    setTimingStatus,
    updateHUD,
    setRound,
    addPip,
    clearPips,
    showStart,
    hideStart,
    showResult,
    hideResult,
  };
})();

// ══════════════════════════════════════════════
//  GAME CONTROLLER
// ══════════════════════════════════════════════
const Game = (() => {
  const TOTAL_ROUNDS = 8;
  const BEAT_MS = 350;
  const PERFECT_MS = 150;
  const OK_MS = 300;
  const MAX_LIFE = 3;

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
  function start() {
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
    UI.setTimingStatus("대기중...");
    nextRound();
  }

  function restart() {
    UI.hideResult();
    clearAll();
    start();
  }

  function goTitle() {
    UI.hideResult();
    clearAll();
    UI.showStart();
  }

  // ─────────────────────────────
  // ROUND
  // ─────────────────────────────
  function nextRound() {
    if (state.round >= TOTAL_ROUNDS) return endGame(true);
    clearAll();

    state.round++;
    state.seq = genSequence();
    roundSlotResults = Array(8).fill(false);

    UI.buildSlots();
    UI.setRound(state.round, TOTAL_ROUNDS);
    UI.setPhase("show");
    UI.setTimingStatus("보기 페이즈...");

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
      UI.setTimingStatus("입력 페이즈 — 타이밍!");
    }, inputStart - now);

    // ─────────────────────────
    // INPUT BEATS
    // ─────────────────────────
    for (let i = 0; i < 8; i++) {
      const beatTime = inputStart + i * BEAT_MS;

      T(() => {
        Audio$.tick();
        UI.setSlotActive(i);

        const expected = state.seq[i].action;
        let judged = false;

        // ───── INPUT CALLBACK ─────
        InputHandler.setCallback((dir, pressTime) => {
          if (judged) return;
          judged = true;
          InputHandler.setCallback(null);

          const diffMs = pressTime - beatTime; // ⭐ 핵심 수정

          handleJudge(i, dir, expected, diffMs);
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
    T(() => endRound(), inputStart + 8 * BEAT_MS - now);
  }
  function endRound() {
    InputHandler.setCallback(null);
    UI.setPhase("");

    roundSlotResults.forEach((ok) => UI.addPip(ok));

    T(() => {
      if (state.round >= TOTAL_ROUNDS) {
        endGame(true);
      } else {
        nextRound();
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
      UI.showTimingHit(diffMs, "miss");
      UI.showJudgment("miss", expected);
      Audio$.miss();
      applyGrade(i, "miss");
      return;
    }

    if (dir !== expected) {
      UI.setSlotResult(i, "miss");
      UI.showTimingHit(diffMs, "miss");
      UI.showJudgment("miss", expected);
      Audio$.miss();
      applyGrade(i, "miss");
      return;
    }

    const grade = abs <= PERFECT_MS ? "perfect" : abs <= OK_MS ? "ok" : "miss";

    UI.setSlotResult(i, grade);
    UI.showTimingHit(diffMs, grade);
    UI.showJudgment(grade, expected);

    if (grade === "perfect") Audio$.perfect();
    else if (grade === "ok") Audio$.ok();
    else Audio$.miss();

    applyGrade(i, grade);
  }

  function handleMiss(i, expected) {
    if (expected === "REST") {
      UI.setSlotResult(i, "ok");
      UI.showTimingHit(0, "perfect");
      UI.showJudgment("perfect", "REST");
      Audio$.restOk();
      applyGrade(i, "perfect");
    } else {
      UI.setSlotResult(i, "miss");
      UI.setTimingStatus("MISS — 입력 없음");
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
      T(() => endGame(false), 0);
    }
  }

  function endGame(success) {
    InputHandler.setCallback(null);
    T(() => {
      UI.showResult(
        state.score,
        state.pCount,
        state.oCount,
        state.mCount,
        success,
      );
    }, 300);
  }

  return { start, restart, goTitle };
})();

// init
UI.showStart();
