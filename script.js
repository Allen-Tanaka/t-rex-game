const gameEl = document.getElementById('game');
const trexEl = document.getElementById('trex');
const obstaclesEl = document.getElementById('obstacles');
const groundEl = document.getElementById('ground');
const cloudsEl = document.getElementById('clouds');
const overlayStartEl = document.getElementById('overlay-start');
const overlayGameoverEl = document.getElementById('overlay-gameover');
const scoreEl = document.getElementById('score');
const highScoreEl = document.getElementById('high-score');
const finalScoreEl = document.getElementById('final-score');
const SCORE_STORAGE_KEY = 'trex-high-score';

const rootStyles = getComputedStyle(document.documentElement);
const GROUND_Y = parseFloat(rootStyles.getPropertyValue('--ground-y'));
const TREX_H = parseFloat(rootStyles.getPropertyValue('--trex-h'));
const TREX_FLOOR = GROUND_Y - TREX_H;

const GRAVITY = 2000;
const JUMP_VELOCITY = 620;
const RUN_FRAME_INTERVAL = 110;

const GAME_SPEED = 320;
const OBSTACLE_SPAWN_MIN_MS = 900;
const OBSTACLE_SPAWN_MAX_MS = 1800;
const OBSTACLE_MIN_WIDTH = 14;
const OBSTACLE_MAX_WIDTH = 26;
const OBSTACLE_MIN_HEIGHT = 28;
const OBSTACLE_MAX_HEIGHT = 48;

const CLOUD_SPEED = GAME_SPEED * 0.35;
const CLOUD_COUNT = 3;
const CLOUD_MIN_WIDTH = 30;
const CLOUD_MAX_WIDTH = 60;
const CLOUD_MIN_Y = 15;
const CLOUD_MAX_Y = 70;

const TREX_HITBOX_INSET = 6;
const OBSTACLE_HITBOX_INSET = 2;

const state = {
  isRunning: false,
  score: 0,
  trex: {
    y: 0,
    velocityY: 0,
    isJumping: false,
  },
  runFrameElapsed: 0,
  runFrameToggle: false,
  obstacles: [],
  obstacleSpawnIn: 0,
  groundScrollX: 0,
  clouds: [],
};

let lastTimestamp = null;
let highScore = 0;

function randomBetween(min, max) {
  return min + Math.random() * (max - min);
}

function formatScore(value) {
  return String(Math.max(0, Math.floor(value))).padStart(5, '0');
}

function updateScoreDisplay() {
  scoreEl.textContent = formatScore(state.score);
  highScoreEl.textContent = formatScore(highScore);
}

function loadHighScore() {
  try {
    const storedValue = localStorage.getItem(SCORE_STORAGE_KEY);
    highScore = storedValue ? parseInt(storedValue, 10) : 0;
  } catch {
    highScore = 0;
  }

  if (!Number.isFinite(highScore) || highScore < 0) {
    highScore = 0;
  }

  updateScoreDisplay();
}

function maybeUpdateHighScore() {
  if (state.score <= highScore) return;

  highScore = state.score;
  updateScoreDisplay();

  try {
    localStorage.setItem(SCORE_STORAGE_KEY, String(highScore));
  } catch {
  }
}

function resetGameState() {
  state.isRunning = false;
  state.score = 0;
  state.trex.y = 0;
  state.trex.velocityY = 0;
  state.trex.isJumping = false;
  state.runFrameElapsed = 0;
  state.runFrameToggle = false;
  state.obstacles.forEach((obstacle) => obstacle.el.remove());
  state.obstacles = [];
  state.obstacleSpawnIn = 0;
  state.groundScrollX = 0;
  groundEl.style.backgroundPositionX = '0px';
  cloudsEl.innerHTML = '';
  state.clouds = [];
  initClouds();
  scheduleNextObstacle();
  trexEl.className = 'trex trex--run-a';
  renderTrex();
  updateScoreDisplay();
}

function showStartScreen() {
  resetGameState();
  overlayStartEl.style.display = 'flex';
  overlayGameoverEl.style.display = 'none';
}

function startGame() {
  resetGameState();
  lastTimestamp = null;
  state.isRunning = true;
  overlayStartEl.style.display = 'none';
  overlayGameoverEl.style.display = 'none';
}

function jump() {
  if (state.trex.isJumping || !state.isRunning) return;

  state.trex.isJumping = true;
  state.trex.velocityY = JUMP_VELOCITY;

  trexEl.classList.remove('trex--run-a', 'trex--run-b');
  trexEl.classList.add('trex--jump');
}

function updateTrexPhysics(dtSeconds) {
  const t = state.trex;
  if (!t.isJumping) return;

  t.velocityY -= GRAVITY * dtSeconds;
  t.y += t.velocityY * dtSeconds;

  if (t.y <= 0) {
    t.y = 0;
    t.velocityY = 0;
    t.isJumping = false;
    trexEl.classList.remove('trex--jump');
  }
}

function updateRunAnimation(dtMs) {
  if (state.trex.isJumping) return;

  state.runFrameElapsed += dtMs;
  if (state.runFrameElapsed < RUN_FRAME_INTERVAL) return;

  state.runFrameElapsed = 0;
  state.runFrameToggle = !state.runFrameToggle;
  trexEl.classList.toggle('trex--run-a', !state.runFrameToggle);
  trexEl.classList.toggle('trex--run-b', state.runFrameToggle);
}

function renderTrex() {
  trexEl.style.top = `${TREX_FLOOR - state.trex.y}px`;
}

function scheduleNextObstacle() {
  state.obstacleSpawnIn = randomBetween(OBSTACLE_SPAWN_MIN_MS, OBSTACLE_SPAWN_MAX_MS);
}

function spawnObstacle() {
  const width = randomBetween(OBSTACLE_MIN_WIDTH, OBSTACLE_MAX_WIDTH);
  const height = randomBetween(OBSTACLE_MIN_HEIGHT, OBSTACLE_MAX_HEIGHT);
  const startX = gameEl.clientWidth;

  const el = document.createElement('div');
  el.className = 'obstacle';
  el.style.width = `${width}px`;
  el.style.height = `${height}px`;
  obstaclesEl.appendChild(el);

  state.obstacles.push({ el, x: startX, scored: false });
}

function updateObstacles(dtSeconds, dtMs) {
  const trexRect = trexEl.getBoundingClientRect();

  state.obstacles = state.obstacles.filter((obstacle) => {
    obstacle.x -= GAME_SPEED * dtSeconds;
    obstacle.el.style.left = `${obstacle.x}px`;

    const obstacleRect = obstacle.el.getBoundingClientRect();
    if (!obstacle.scored && obstacleRect.right < trexRect.left) {
      obstacle.scored = true;
      state.score += 1;
      updateScoreDisplay();
      maybeUpdateHighScore();
    }

    const isOffScreen = obstacle.x + obstacle.el.offsetWidth < 0;
    if (isOffScreen) obstacle.el.remove();
    return !isOffScreen;
  });

  state.obstacleSpawnIn -= dtMs;
  if (state.obstacleSpawnIn <= 0) {
    spawnObstacle();
    scheduleNextObstacle();
  }
}

function updateGroundScroll(dtSeconds) {
  state.groundScrollX -= GAME_SPEED * dtSeconds;
  groundEl.style.backgroundPositionX = `${state.groundScrollX}px`;
}

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

    if (cloud.x + cloud.width < 0) {
      randomizeCloud(cloud, gameWidth + randomBetween(0, 60));
    }

    cloud.el.style.left = `${cloud.x}px`;
  }
}

function getHitbox(el, inset) {
  const rect = el.getBoundingClientRect();
  return {
    left: rect.left + inset,
    right: rect.right - inset,
    top: rect.top + inset,
    bottom: rect.bottom - inset,
  };
}

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
  if (!state.isRunning) return;

  state.isRunning = false;
  trexEl.classList.add('trex--dead');
  maybeUpdateHighScore();
  finalScoreEl.textContent = formatScore(state.score);
  overlayGameoverEl.style.display = 'flex';
  overlayStartEl.style.display = 'none';
}

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

function handleJumpInput(event) {
  if (event.type === 'keydown' && event.code !== 'Space' && event.code !== 'ArrowUp') {
    return;
  }
  event.preventDefault();

  if (!state.isRunning) {
    startGame();
    return;
  }

  jump();
}

document.addEventListener('keydown', handleJumpInput);
gameEl.addEventListener('touchstart', handleJumpInput);
gameEl.addEventListener('mousedown', handleJumpInput);

loadHighScore();
showStartScreen();
requestAnimationFrame(loop);
