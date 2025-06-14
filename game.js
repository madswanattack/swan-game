// Firebase Firestore 연동
import {
  collection,
  addDoc,
  serverTimestamp,
  query,
  orderBy,
  limit,
  getDocs
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");
canvas.width = 800;
canvas.height = 200;

// ===== 사운드 =====
const bgm = new Audio("assets/bgm.mp3");
const jumpSound = new Audio("assets/jump.mp3");
const hitSound = new Audio("assets/hit.mp3");
const duckSound = new Audio("assets/duck.mp3");
bgm.loop = true; bgm.volume = 0.5; jumpSound.volume = 0.7; hitSound.volume = 0.9; duckSound.volume = 0.7;
let bgmOn = true;

// ===== 게임 상태 =====
let gameStarted = false;
let gameOver = false;
let showHitbox = false;

// ===== 이미지 로딩 =====
const swanFrames = ["assets/swan1.png", "assets/swan2.png"];
const duckFrames = ["assets/swan_duck1.png", "assets/swan_duck2.png"];
const birdFrames = ["assets/bird1.png", "assets/bird2.png"];
const plantImages = [
  "assets/plant_small_1.png",
  "assets/plant_small_2.png",
  "assets/plant_small_3.png",
  "assets/plant_large_1.png",
  "assets/plant_large_2.png",
  "assets/plant_large_3.png"
];
const plantSizes = {
  "assets/plant_small_1.png": [34 * 0.8, 70 * 0.8],
  "assets/plant_small_2.png": [68 * 0.8, 70 * 0.8],
  "assets/plant_small_3.png": [102 * 0.8, 70 * 0.8],
  "assets/plant_large_1.png": [50 * 0.8, 100 * 0.8],
  "assets/plant_large_2.png": [100 * 0.8, 100 * 0.8],
  "assets/plant_large_3.png": [150 * 0.8, 100 * 0.8]
};
const bgImg = new Image(); bgImg.src = "assets/bg.png";
const groundImg = new Image(); groundImg.src = "assets/ground.png";
let swanImg = new Image();

// ===== 백조 객체 =====
let swan = {
  x: 50,
  y: 120,
  vy: 0,
  width: 64,
  height: 64,
  jumping: false,
  ducking: false,
  frame: 0,
  jumpCount: 0
};

// ===== 게임 변수 =====
let obstacles = [];
let score = 0;
let speed = 5;
let maxSpeed = 15;
let bgX = 0;
let groundX = 0;
let invertBackground = false;
let obstacleFrequency = 90;
let lastTime = null;
let obstacleCooldown = 0;
let timeSinceStart = 0;

// ===== 점수 저장 및 명예의 전당 =====
async function saveScore(nickname, score) {
  try {
    await addDoc(collection(window.db, "scores"), {
      name: nickname,
      score: score,
      createdAt: serverTimestamp()
    });
  } catch (e) {
    console.error("점수 저장 실패:", e);
  }
}

async function showRanking() {
  const q = query(
    collection(window.db, "scores"),
    orderBy("score", "desc"),
    limit(10)
  );
  const snapshot = await getDocs(q);
  const list = document.getElementById("rankingList");
  list.innerHTML = "";
  snapshot.forEach((doc, i) => {
    const d = doc.data();
    const li = document.createElement("li");
    li.textContent = `${(i + 1).toString()}. ${d.name || "익명"} - ${d.score}`;
    list.appendChild(li);
  });
}

function onGameOver(finalScore) {
  const name = prompt("게임 오버! 닉네임을 입력하세요:");
  if (name) {
    saveScore(name, finalScore).then(() => showRanking());
  }
}

function loadImage(src) {
  const img = new Image();
  img.src = src;
  return img;
}

function getSwanHitbox() {
  const width = swan.width - 28;
  return {
    x: swan.x + 18 - width / 2,
    y: swan.ducking ? swan.y + 30 : swan.y + 10,
    width: width,
    height: swan.ducking ? swan.height - 36 : swan.height - 20
  };
}

function getObstacleHitbox(ob) {
  return {
    x: ob.x + ob.width * 0.1,
    y: ob.y + ob.height * 0.1,
    width: ob.width * 0.8,
    height: ob.height * 0.8
  };
}

function isColliding(a, b) {
  return (
    a.x < b.x + b.width &&
    a.x + a.width > b.x &&
    a.y < b.y + b.height &&
    a.y + a.height > b.y
  );
}

function resetGame() {
  swan.y = 120; swan.vy = 0; swan.jumping = false; swan.ducking = false; swan.jumpCount = 0;
  obstacles = []; score = 0; speed = 5; obstacleFrequency = 90; timeSinceStart = 0;
  gameStarted = true; gameOver = false; invertBackground = false;
  document.body.style.filter = "none";
  if (bgmOn) { bgm.currentTime = 0; bgm.play(); }
}

function drawStartText() {
  ctx.fillStyle = "black";
  ctx.font = "20px Arial";
  ctx.textAlign = "center";
  ctx.fillText("스페이스바 또는 ↑키를 눌러 시작하세요", canvas.width / 2, canvas.height / 2 - 10);
  ctx.fillText("제작: madswanattack", canvas.width / 2, canvas.height / 2 + 20);
}

function drawCreditTag() {
  ctx.fillStyle = "black";
  ctx.font = "10px 'Segoe UI', sans-serif";
  ctx.textAlign = "right";
  ctx.fillText("madswanattack", canvas.width - 5, canvas.height - 5);
}

function drawBGMStatus() {
  ctx.fillStyle = "black";
  ctx.font = "9px Arial";
  ctx.textAlign = "left";
  ctx.fillText(`BGM: ${bgmOn ? "ON" : "OFF"} (M 키)`, 5, 12);
}

function gameLoop(timestamp) {
  if (!lastTime) lastTime = timestamp;
  const delta = (timestamp - lastTime) / 1000;
  lastTime = timestamp;
  timeSinceStart += delta;

  if (gameStarted && speed < maxSpeed) {
    speed += delta * 0.2;
    if (speed > maxSpeed) speed = maxSpeed;
  }

  const movement = speed * delta * 60;
  obstacleCooldown -= delta;

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  bgX -= gameStarted ? movement * 0.3 : 0;
  if (bgX <= -canvas.width) bgX = 0;
  ctx.drawImage(bgImg, bgX, 0, canvas.width, 150);
  ctx.drawImage(bgImg, bgX + canvas.width, 0, canvas.width, 150);

  groundX -= gameStarted ? movement : 0;
  if (groundX <= -canvas.width) groundX = 0;
  ctx.drawImage(groundImg, groundX, 150, canvas.width, 30);
  ctx.drawImage(groundImg, groundX + canvas.width, 150, canvas.width, 30);

  if (gameStarted && Math.floor(timestamp / 100) % 10 === 0) swan.frame = (swan.frame + 1) % 2;
  let currentFrame = swan.ducking ? duckFrames[swan.frame] : swanFrames[swan.frame];
  swanImg.src = currentFrame;
  ctx.drawImage(swanImg, swan.x, swan.y, swan.width, swan.height);

  if (gameStarted) {
    swan.vy += 1400 * delta;
    swan.y += swan.vy * delta;
    if (swan.y >= 120) {
      swan.y = 120; swan.vy = 0; swan.jumping = false; swan.jumpCount = 0;
    }

    if (obstacleCooldown <= 0) {
      const isBird = Math.random() < 0.3;
      if (isBird) {
        const bird = { type: "bird", x: canvas.width, y: Math.random() < 0.5 ? 90 : 50, width: 75, height: 50, frame: 0 };
        obstacles.push(bird);
      } else {
        const src = plantImages[Math.floor(Math.random() * plantImages.length)];
        const [w, h] = plantSizes[src];
        const plant = { type: "plant", x: canvas.width, y: 120 + (swan.height - h), width: w, height: h, img: loadImage(src) };
        obstacles.push(plant);
      }
      obstacleCooldown = 1.2;
    }

    for (let ob of obstacles) {
      ob.x -= movement;
      if (ob.type === "bird") {
        ob.frame = Math.floor(timestamp / 100) % 2;
        const img = loadImage(birdFrames[ob.frame]);
        ctx.drawImage(img, ob.x, ob.y, ob.width, ob.height);
      } else {
        ctx.drawImage(ob.img, ob.x, ob.y, ob.width, ob.height);
      }
    }

    obstacles = obstacles.filter(ob => ob.x + ob.width > 0);

    const swanBox = getSwanHitbox();
    for (let ob of obstacles) {
      const obBox = getObstacleHitbox(ob);
      if (isColliding(swanBox, obBox)) {
        gameOver = true; gameStarted = false;
        hitSound.play(); bgm.pause();
        onGameOver(Math.floor(score));
        break;
      }
    }

    score += delta * 6;

    if (Math.floor(score) % 750 === 0 && Math.floor(score) !== 0) {
      invertBackground = !invertBackground;
      document.body.style.transition = "filter 1s ease";
      document.body.style.filter = invertBackground ? "invert(100%)" : "none";
      obstacleFrequency = Math.max(40, obstacleFrequency - 5); // 장애물 빈도 증가
    }
  }

  ctx.fillStyle = "black";
  ctx.font = "9px Arial";
  ctx.textAlign = "right";
  ctx.fillText("Score: " + Math.floor(score), canvas.width - 5, 12);

  if (showHitbox) {
    const hb = getSwanHitbox();
    ctx.strokeStyle = "red"; ctx.strokeRect(hb.x, hb.y, hb.width, hb.height);
    ctx.strokeStyle = "green";
    for (let ob of obstacles) {
      const obBox = getObstacleHitbox(ob);
      ctx.strokeRect(obBox.x, obBox.y, obBox.width, obBox.height);
    }
  }

  drawBGMStatus();
  drawCreditTag();
  if (!gameStarted) drawStartText();

  requestAnimationFrame(gameLoop);
}

document.addEventListener("keyup", e => {
  if ((e.code === "Space" || e.code === "ArrowUp") && !gameStarted) {
    resetGame();
  } else if (e.code === "ArrowDown") {
    swan.ducking = false;
  } else if (e.code === "KeyH") {
    showHitbox = !showHitbox;
  } else if (e.code === "KeyM") {
    bgmOn = !bgmOn;
    if (bgmOn && gameStarted) bgm.play();
    else bgm.pause();
  }
});

document.addEventListener("keydown", e => {
  if ((e.code === "Space" || e.code === "ArrowUp") && swan.jumpCount < 2 && !swan.ducking) {
    swan.vy = -480;
    swan.jumping = true;
    swan.jumpCount++;
    jumpSound.play();
  } else if (e.code === "ArrowDown" && !swan.jumping && gameStarted) {
    swan.ducking = true;
    duckSound.play();
  }
});

window.onload = () => {
  showRanking();
  requestAnimationFrame(gameLoop);
};
