/* ==========================================================================
   T-REX JUMP GAME
   Steps implemented here: 1) game state & config, 2) game loop,
   3) character movement (jumping + gravity), 4) obstacle generation,
   5) ground & background (cloud) scroll, 6) collision detection.
   Scoring comes in a later step.

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
const obstaclesEl = document.getElementById('obstacles');
const groundEl = document.getElementById('ground');
const cloudsEl = document.getElementById('clouds');
const overlayGameoverEl = document.getElementById('overlay-gameover');

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

const GAME_SPEED = 320;              // px/s — how fast the ground/obstacles scroll toward the T-Rex
const OBSTACLE_SPAWN_MIN_MS = 900;   // shortest gap before the next obstacle
const OBSTACLE_SPAWN_MAX_MS = 1800;  // longest gap before the next obstacle
const OBSTACLE_MIN_WIDTH = 14;       // px
const OBSTACLE_MAX_WIDTH = 26;       // px
const OBSTACLE_MIN_HEIGHT = 28;      // px
const OBSTACLE_MAX_HEIGHT = 48;      // px

const CLOUD_SPEED = GAME_SPEED * 0.35; // px/s — slower than the ground, for a parallax feel
const CLOUD_COUNT = 3;                 // clouds on screen at once
const CLOUD_MIN_WIDTH = 30;            // px
const CLOUD_MAX_WIDTH = 60;            // px
const CLOUD_MIN_Y = 15;                // px from the top of .game
const CLOUD_MAX_Y = 70;                // px from the top of .game

// Shrinking each hitbox inward a bit makes near-miss grazes feel fair
// instead of like a cheap hit.
const TREX_HITBOX_INSET = 6;      // px
const OBSTACLE_HITBOX_INSET = 2;  // px

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
  obstacles: [],          // { el, x } for every obstacle currently on screen
  obstacleSpawnIn: 0,     // ms remaining until the next obstacle spawns
  groundScrollX: 0,       // px, how far the ground texture has scrolled (grows negative)
  clouds: [],             // { el, x, width } for every cloud currently on screen
};

let lastTimestamp = null; // previous frame's timestamp, used to compute delta-time

function randomBetween(min, max) {
  return min + Math.random() * (max - min);
}

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
 * 4. OBSTACLE GENERATION
 * ------------------------------------------------------------------ */

// Picks a random delay and resets the countdown to the next spawn.
function scheduleNextObstacle() {
  state.obstacleSpawnIn = randomBetween(OBSTACLE_SPAWN_MIN_MS, OBSTACLE_SPAWN_MAX_MS);
}

// Creates one obstacle element just off the right edge of the game and
// starts tracking it in state.obstacles.
function spawnObstacle() {
  const width = randomBetween(OBSTACLE_MIN_WIDTH, OBSTACLE_MAX_WIDTH);
  const height = randomBetween(OBSTACLE_MIN_HEIGHT, OBSTACLE_MAX_HEIGHT);
  const startX = gameEl.clientWidth; // left edge starts right at the game's right edge

  const el = document.createElement('div');
  el.className = 'obstacle';
  el.style.width = `${width}px`;
  el.style.height = `${height}px`;
  obstaclesEl.appendChild(el);

  state.obstacles.push({ el, x: startX });
}

function updateObstacles(dtSeconds, dtMs) {
  // Move every obstacle left, then drop the ones that have fully
  // scrolled off-screen so the DOM and our tracking array don't grow
  // without bound.
  state.obstacles = state.obstacles.filter((obstacle) => {
    obstacle.x -= GAME_SPEED * dtSeconds;
    obstacle.el.style.left = `${obstacle.x}px`;

    const isOffScreen = obstacle.x + obstacle.el.offsetWidth < 0;
    if (isOffScreen) obstacle.el.remove();
    return !isOffScreen;
  });

  // Count down to the next spawn; spawn and reschedule once it elapses.
  state.obstacleSpawnIn -= dtMs;
  if (state.obstacleSpawnIn <= 0) {
    spawnObstacle();
    scheduleNextObstacle();
  }
}

/* ------------------------------------------------------------------ *
 * 5. GROUND & BACKGROUND SCROLL
 * ------------------------------------------------------------------ */

function updateGroundScroll(dtSeconds) {
  // .ground has a repeating striped background-image; sliding its
  // position left creates the scrolling-ground illusion. The pattern
  // tiles automatically, so this can just keep decreasing forever with
  // no wrap-around math needed.
  state.groundScrollX -= GAME_SPEED * dtSeconds;
  groundEl.style.backgroundPositionX = `${state.groundScrollX}px`;
}

// Gives one cloud element a new random size/height and horizontal
// position. Used both to create a cloud and to recycle one that has
// scrolled off-screen.
function randomizeCloud(cloud, x) {
  const width = randomBetween(CLOUD_MIN_WIDTH, CLOUD_MAX_WIDTH);
  cloud.x = x;
  cloud.width = width;
  cloud.el.style.width = `${width}px`;
  cloud.el.style.height = `${width * 0.5}px`;
  cloud.el.style.top = `${randomBetween(CLOUD_MIN_Y, CLOUD_MAX_Y)}px`;
}

function createCloud(x) {
  const el = document.createElement('div');
  el.className = 'cloud';
  cloudsEl.appendChild(el);

  const cloud = { el, x: 0, width: 0 };
  randomizeCloud(cloud, x);
  return cloud;
}

// Spreads a fixed pool of clouds across the game once at startup. They
// scroll and recycle themselves afterward, so there's no ongoing
// spawn/despawn bookkeeping like obstacles need.
function initClouds() {
  const gameWidth = gameEl.clientWidth;
  for (let i = 0; i < CLOUD_COUNT; i++) {
    state.clouds.push(createCloud(randomBetween(0, gameWidth)));
  }
}

function updateClouds(dtSeconds) {
  const gameWidth = gameEl.clientWidth;
  for (const cloud of state.clouds) {
    cloud.x -= CLOUD_SPEED * dtSeconds;

    // Once a cloud drifts fully past the left edge, send it back off
    // past the right edge with a fresh random size/height for variety.
    if (cloud.x + cloud.width < 0) {
      randomizeCloud(cloud, gameWidth + randomBetween(0, 60));
    }

    cloud.el.style.left = `${cloud.x}px`;
  }
}

/* ------------------------------------------------------------------ *
 * 6. COLLISION DETECTION
 * ------------------------------------------------------------------ */

// Returns an element's on-screen box, shrunk inward by `inset` px on
// every side.
function getHitbox(el, inset) {
  const rect = el.getBoundingClientRect();
  return {
    left: rect.left + inset,
    right: rect.right - inset,
    top: rect.top + inset,
    bottom: rect.bottom - inset,
  };
}

// Standard axis-aligned bounding box (AABB) overlap test: two boxes
// overlap unless one is entirely to a side of the other.
function boxesOverlap(a, b) {
  return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
}

function isTrexHittingAnObstacle() {
  const trexBox = getHitbox(trexEl, TREX_HITBOX_INSET);
  return state.obstacles.some((obstacle) =>
    boxesOverlap(trexBox, getHitbox(obstacle.el, OBSTACLE_HITBOX_INSET))
  );
}

function gameOver() {
  state.isRunning = false; // the loop stops calling update()/render() from the next frame on
  trexEl.classList.add('trex--dead');
  overlayGameoverEl.style.display = 'flex';
  // Populating #final-score is added once the scoring step exists.
}

/* ------------------------------------------------------------------ *
 * 2. GAME LOOP
 * ------------------------------------------------------------------ */

function update(dtSeconds, dtMs) {
  updateTrexPhysics(dtSeconds);
  updateRunAnimation(dtMs);
  updateObstacles(dtSeconds, dtMs);
  updateGroundScroll(dtSeconds);
  updateClouds(dtSeconds);

  if (isTrexHittingAnObstacle()) {
    gameOver();
  }
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

scheduleNextObstacle();
initClouds();
requestAnimationFrame(loop);
