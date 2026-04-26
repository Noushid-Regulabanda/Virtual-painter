const COLORS = ['#e24b4a', '#ef9f27', '#63C917', '#378add', '#8b5cf6', '#ec4899', '#ffffff'];
let activeColor = COLORS[3];
let brushSize = 8;

let drawLastX = null, drawLastY = null;
let eraseLastX = null, eraseLastY = null;

let colorPickIndex = 3;
let colorPickCooldown = 0;
let prevFingers = -1;

const video = document.getElementById('video');
const dc = document.getElementById('draw-canvas');
const ctx = dc.getContext('2d');
const cursor = document.getElementById('cursor');
const statusEl = document.getElementById('status');
const modeBadge = document.getElementById('mode-badge');
const colorRing = document.getElementById('color-ring');
const ringInner = document.getElementById('color-ring-inner');

const SX = [0.8, 0.5, 0.3];
let smX = null, smY = null;
function smooth(x, y, alpha) {
    if (smX === null) { smX = x; smY = y; return { x, y }; }
    smX = smX + alpha * (x - smX);
    smY = smY + alpha * (y - smY);
    return { x: smX, y: smY };
}
function resetSmooth() { smX = null; smY = null; }

let smEX = null, smEY = null;
function smoothErase(x, y, alpha) {
    if (smEX === null) { smEX = x; smEY = y; return { x, y }; }
    smEX = smEX + alpha * (x - smEX);
    smEY = smEY + alpha * (y - smEY);
    return { x: smEX, y: smEY };
}
function resetSmoothErase() { smEX = null; smEY = null; }

function buildColors() {
    const wrap = document.getElementById('colors');
    COLORS.forEach((c, i) => {
        const b = document.createElement('button');
        b.className = 'color-dot' + (i === colorPickIndex ? ' active' : '');
        b.style.cssText = `background:${c};width:26px;height:26px;border-radius:50%;border:2px solid transparent;cursor:pointer;flex-shrink:0;${c === '#ffffff' ? 'box-shadow:0 0 0 0.5px #aaa' : ''}`;
        b.onclick = () => setColor(i);
        wrap.appendChild(b);
    });
    buildRing();
}

function buildRing() {
    ringInner.innerHTML = '';
    COLORS.forEach((c, i) => {
        const s = document.createElement('div');
        s.className = 'ring-swatch' + (i === colorPickIndex ? ' sel' : '');
        s.style.cssText = `background:${c};width:30px;height:30px;border-radius:50%;border:3px solid ${i === colorPickIndex ? '#fff' : 'transparent'};transition:transform .15s;${i === colorPickIndex ? 'transform:scale(1.3)' : ''}`;
        ringInner.appendChild(s);
    });
}

function setColor(i) {
    colorPickIndex = i;
    activeColor = COLORS[i];
    document.querySelectorAll('.color-dot').forEach((b, idx) => {
        b.classList.toggle('active', idx === i);
        b.style.borderColor = idx === i ? 'var(--color-text-primary)' : 'transparent';
        b.style.transform = idx === i ? 'scale(1.2)' : 'scale(1)';
    });
    buildRing();
}

buildColors();

function setMode(mode, label) {
    modeBadge.className = mode;
    modeBadge.textContent = label;
}

function clearCanvas() { ctx.clearRect(0, 0, dc.width, dc.height); }

function saveDrawing() {
    const tmp = document.createElement('canvas');
    tmp.width = dc.width; tmp.height = dc.height;
    const tc = tmp.getContext('2d');
    tc.fillStyle = '#1a1a1a'; tc.fillRect(0, 0, tmp.width, tmp.height);
    tc.drawImage(dc, 0, 0);
    const a = document.createElement('a');
    a.href = tmp.toDataURL('image/png');
    a.download = 'air-drawing.png'; a.click();
}

function resizeCanvas() {
    const wrap = document.getElementById('canvas-wrap');
    const old = ctx.getImageData(0, 0, dc.width, dc.height);
    dc.width = wrap.clientWidth; dc.height = wrap.clientHeight;
    ctx.putImageData(old, 0, 0);
}
resizeCanvas();
window.addEventListener('resize', resizeCanvas);

function setStatus(msg) { statusEl.textContent = msg; }

function countUpFingers(lm) {
    const tips = [8, 12, 16, 20];
    const pips = [6, 10, 14, 18];
    let count = 0;
    tips.forEach((tip, i) => { if (lm[tip].y < lm[pips[i]].y) count++; });
    return count;
}

function lmToCanvas(lm, tipIdx) {
    return {
        x: dc.width - lm[tipIdx].x * dc.width,
        y: lm[tipIdx].y * dc.height
    };
}

function showCursor(x, y, size, bg) {
    cursor.style.left = x + 'px'; cursor.style.top = y + 'px';
    cursor.style.width = size + 'px'; cursor.style.height = size + 'px';
    cursor.style.background = bg || 'transparent';
    cursor.style.display = 'block';
}

function hideCursor() { cursor.style.display = 'none'; }

function onResults(results) {
    if (!results.multiHandLandmarks || results.multiHandLandmarks.length === 0) {
        drawLastX = null; drawLastY = null;
        eraseLastX = null; eraseLastY = null;
        resetSmooth(); resetSmoothErase();
        hideCursor();
        colorRing.style.display = 'none';
        setMode('', 'Idle');
        setStatus('Show your hand to the camera');
        prevFingers = -1;
        return;
    }

    const lm = results.multiHandLandmarks[0];
    const fingers = countUpFingers(lm);

    if (fingers !== prevFingers) {
        drawLastX = null; drawLastY = null;
        eraseLastX = null; eraseLastY = null;
        resetSmooth(); resetSmoothErase();
    }
    prevFingers = fingers;

    if (colorPickCooldown > 0) colorPickCooldown--;

    if (fingers === 1) {
        colorRing.style.display = 'none';
        resetSmoothErase();
        setMode('draw', 'Drawing');
        setStatus('1 finger — drawing');

        const raw = lmToCanvas(lm, 8);
        const p = smooth(raw.x, raw.y, 0.45);

        ctx.globalCompositeOperation = 'source-over';
        ctx.strokeStyle = activeColor;
        ctx.lineWidth = brushSize;
        ctx.lineCap = 'round'; ctx.lineJoin = 'round';
        if (drawLastX !== null) {
            ctx.beginPath(); ctx.moveTo(drawLastX, drawLastY); ctx.lineTo(p.x, p.y); ctx.stroke();
        }
        drawLastX = p.x; drawLastY = p.y;
        showCursor(p.x, p.y, brushSize + 4, activeColor + '99');

    } else if (fingers === 2) {
        colorRing.style.display = 'none';
        resetSmooth();
        setMode('erase', 'Erasing');
        setStatus('2 fingers — erasing');

        const t1 = lmToCanvas(lm, 8);
        const t2 = lmToCanvas(lm, 12);
        const rawX = (t1.x + t2.x) / 2;
        const rawY = (t1.y + t2.y) / 2;

        const p = smoothErase(rawX, rawY, 0.4);
        const eraseSize = Math.max(brushSize * 5, 40);

        ctx.globalCompositeOperation = 'destination-out';
        ctx.lineWidth = eraseSize;
        ctx.lineCap = 'round'; ctx.lineJoin = 'round';
        if (eraseLastX !== null) {
            ctx.beginPath(); ctx.moveTo(eraseLastX, eraseLastY); ctx.lineTo(p.x, p.y); ctx.stroke();
        } else {
            ctx.beginPath(); ctx.arc(p.x, p.y, eraseSize / 2, 0, Math.PI * 2); ctx.fill();
        }
        eraseLastX = p.x; eraseLastY = p.y;
        ctx.globalCompositeOperation = 'source-over';
        showCursor(p.x, p.y, eraseSize, 'rgba(255,255,255,0.12)');

    } else if (fingers === 3) {
        drawLastX = null; drawLastY = null;
        eraseLastX = null; eraseLastY = null;
        colorRing.style.display = 'flex';
        setMode('color', 'Pick color');
        setStatus('3 fingers — move left/right');

        const t1 = lmToCanvas(lm, 8);
        const t2 = lmToCanvas(lm, 12);
        const t3 = lmToCanvas(lm, 16);
        const avgX = (t1.x + t2.x + t3.x) / 3;
        const newIdx = Math.min(COLORS.length - 1, Math.max(0, Math.floor((avgX / dc.width) * COLORS.length)));

        if (newIdx !== colorPickIndex && colorPickCooldown === 0) {
            setColor(newIdx);
            colorPickCooldown = 8;
        }
        showCursor(t1.x, t1.y, 14, 'rgba(255,255,255,0.2)');

    } else {
        drawLastX = null; drawLastY = null;
        eraseLastX = null; eraseLastY = null;
        resetSmooth(); resetSmoothErase();
        colorRing.style.display = 'none';
        hideCursor();
        setMode('', 'Idle');
        setStatus('Hand detected — raise fingers to act');
    }
}

async function startCamera() {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' }, audio: false });
        video.srcObject = stream;
        setStatus('Camera on — loading hand tracking...');
        return true;
    } catch (e) {
        setStatus('Camera access denied. Please allow camera and reload.');
        return false;
    }
}

function initHands() {
    if (typeof Hands === 'undefined') { setStatus('Hand tracking failed to load.'); return; }
    const hands = new Hands({ locateFile: f => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${f}` });
    hands.setOptions({ maxNumHands: 1, modelComplexity: 1, minDetectionConfidence: 0.75, minTrackingConfidence: 0.75 });
    hands.onResults(onResults);
    if (typeof Camera !== 'undefined') {
        const cam = new Camera(video, { onFrame: async () => { await hands.send({ image: video }); }, width: 640, height: 480 });
        cam.start();
        setStatus('Hand tracking ready — show your hand!');
    }
}

(async () => {
    const ok = await startCamera();
    if (!ok) return;
    video.onloadedmetadata = () => { resizeCanvas(); setTimeout(initHands, 800); };
})();