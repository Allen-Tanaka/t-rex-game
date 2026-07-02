/* ==========================================================================
   T-REX JUMP GAME
   Steps implemented here: 1) game state & config, 2) game loop,
   3) character movement (jumping + gravity).
   Obstacle generation, collisions and scoring come in later steps.

   Note: this file is loaded via a <script> tag at the very end of <body>,
   so the DOM is already fully parsed by the time this code runs — no
   need to wait for a DOMContentLoaded event.
   ========================================================================== */

/* ------------------------------------------------------------------ *
 * 1. GAME STATE & CONFIG
 * ------------------------------------------------------------------ */

// --- DOM references ----------------------------------------------------
const gameEl = document.getElementById('game');
const trexEl = document.getElementById('trex');

// --- Tunable physics/config constants -----------------------------------
// Read the T-Rex's resting height (distance from the top of #game down to
// where its feet touch the ground) from the CSS custom properties, so JS
// and CSS positions never drift out of sync with each other.
//
// Note: --trex-floor itself is a calc() expression (calc(var(--ground-y) -
// var(--trex-h))), and getPropertyValue() returns custom properties as
// their literal, unresolved token string rather than a computed number —
// so reading it directly would yield "calc(200px - 56px)" and parseFloat()
// on that returns NaN. --ground-y and --trex-h are plain lengths, so we
// read those instead and do the subtraction ourselves.
const rootStyles = getComputedStyle(document.documentElement);
const GROUND_Y = parseFloat(rootStyles.getPropertyValue('--ground-y'));
const TREX_H = parseFloat(rootStyles.getPropertyValue('--trex-h'));
const TREX_FLOOR = GROUND_Y - TREX_H; // px from top of .game

const GRAVITY = 2000;           // px/s^2 — how fast vertical speed changes (pulls the T-Rex down)
const JUMP_VELOCITY = 620;      // px/s   — upward speed applied the instant a jump starts
const RUN_FRAME_INTERVAL = 110; // ms     — time between leg-animation frame swaps

// --- Mutable game state --------------------------------------------------
// Everything that changes while the game plays lives in one object, so
// it's easy to see at a glance and easy to reset() later on restart.
const state = {
  isRunning: true,       // will be driven by the start/game-over screens in a later step
  trex: {
    y: 0,                 // height above the ground in px (0 = standing on the ground)
    velocityY: 0,          // current vertical speed in px/s (positive = moving up)
    isJumping: false,
  },
  runFrameElapsed: 0,     // ms accumulated since the last leg-frame swap
  runFrameToggle: false,  // false -> show "run-a" pose, true -> show "run-b" pose
};

let lastTimestamp = null; // previous frame's timestamp, used to compute delta-time

/* ------------------------------------------------------------------ *
 * 3. CHARACTER MOVEMENT (jumping + gravity)
 * ------------------------------------------------------------------ */

function jump() {
  // Ignore jump requests while already airborne, or while the game isn't
  // active — this is what stops double/triple mid-air jumps.
  if (state.trex.isJumping || !state.isRunning) return;

  state.trex.isJumping = true;
  state.trex.velocityY = JUMP_VELOCITY;

  // Swap the running-leg pose classes for the single "jump" pose defined
  // in styles.css.
  trexEl.classList.remove('trex--run-a', 'trex--run-b');
  trexEl.classList.add('trex--jump');
}

function updateTrexPhysics(dtSeconds) {
  const t = state.trex;
  if (!t.isJumping) return;

  // Simple projectile motion: gravity constantly reduces the upward
  // velocity, and position advances according to the current velocity.
  t.velocityY -= GRAVITY * dtSeconds;
  t.y += t.velocityY * dtSeconds;

  // Landed: clamp to the ground and end the jump.
  if (t.y <= 0) {
    t.y = 0;
    t.velocityY = 0;
    t.isJumping = false;
    trexEl.classList.remove('trex--jump');
  }
}

function updateRunAnimation(dtMs) {
  if (state.trex.isJumping) return; // legs don't cycle while airborne

  state.runFrameElapsed += dtMs;
  if (state.runFrameElapsed < RUN_FRAME_INTERVAL) return;

  state.runFrameElapsed = 0;
  state.runFrameToggle = !state.runFrameToggle;
  trexEl.classList.toggle('trex--run-a', !state.runFrameToggle);
  trexEl.classList.toggle('trex--run-b', state.runFrameToggle);
}

function renderTrex() {
  // Convert the abstract "height above ground" value into the actual CSS
  // `top` offset (top decreases as the T-Rex's height above ground grows).
  trexEl.style.top = `${TREX_FLOOR - state.trex.y}px`;
}

/* ------------------------------------------------------------------ *
 * 2. GAME LOOP
 * ------------------------------------------------------------------ */

function update(dtSeconds, dtMs) {
  updateTrexPhysics(dtSeconds);
  updateRunAnimation(dtMs);
}

function render() {
  renderTrex();
}

function loop(timestamp) {
  if (lastTimestamp === null) lastTimestamp = timestamp;

  const dtMs = timestamp - lastTimestamp;
  const dtSeconds = dtMs / 1000;
  lastTimestamp = timestamp;

  if (state.isRunning) {
    update(dtSeconds, dtMs);
    render();
  }

  requestAnimationFrame(loop);
}

/* ------------------------------------------------------------------ *
 * INPUT HANDLING
 * ------------------------------------------------------------------ */

function handleJumpInput(event) {
  // For keyboard events, only react to Space/Up-arrow; ignore other keys.
  if (event.type === 'keydown' && event.code !== 'Space' && event.code !== 'ArrowUp') {
    return;
  }
  event.preventDefault(); // stop Space from scrolling the page
  jump();
}

document.addEventListener('keydown', handleJumpInput);
gameEl.addEventListener('touchstart', handleJumpInput);
gameEl.addEventListener('mousedown', handleJumpInput);

/* ------------------------------------------------------------------ *
 * START THE LOOP
 * ------------------------------------------------------------------ */

requestAnimationFrame(loop);
