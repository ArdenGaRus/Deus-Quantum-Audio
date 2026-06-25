const qubitSlider = document.getElementById('qubitSlider');
const qubitVal = document.getElementById('qubitVal');
const hzSlider = document.getElementById('hzSlider');
const hzVal = document.getElementById('hzVal');
const geoSlider = document.getElementById('geoSlider');
const geoVal = document.getElementById('geoVal');

const hzModes = ['44.1 кГц', '192 кГц', '384 кГц'];
const hzValues = [44100.0, 192000.0, 384000.0];
const geoModes = ['Плоский Chromium', 'Икосаэдр (3D)', 'Фрактальный узел (4D)', 'Звездный политоп (5D)'];

const canvas = document.getElementById('quantumCanvas');
const ctx = canvas.getContext('2d');
const statusText = document.getElementById('statusText');
let currentNs = 0;
let animationFrameId = null;
let isRunning = false;

// 1. МГНОВЕННОЕ ВОССТАНОВЛЕНИЕ ПОЛЗУНКОВ ИЗ ПАМЯТИ ПК ПРИ ОТКРЫТИИ ОКНА
chrome.storage.local.get(['qubits', 'hzIndex', 'geoTopology'], (result) => {
    if (result.qubits) {
        qubitSlider.value = result.qubits;
        qubitVal.textContent = `${result.qubits} Кубита`;
    }
    if (result.hzIndex !== undefined) {
        hzSlider.value = result.hzIndex;
        hzVal.textContent = hzModes[result.hzIndex];
    }
    if (result.geoTopology !== undefined) {
        geoSlider.value = result.geoTopology;
        geoVal.textContent = geoModes[result.geoTopology];
    }
});

// 2. СОХРАНЯЕМ ИЗМЕНЕНИЯ И ОТПРАВЛЯЕМ В ДВИЖОК ПРИ КАЖДОМ ДВИЖЕНИИ ПОЛЗУНКОВ
qubitSlider.addEventListener('input', (e) => {
    qubitVal.textContent = `${e.target.value} Кубита`;
    const val = parseInt(e.target.value);
    chrome.storage.local.set({ qubits: val });
    chrome.runtime.sendMessage({ type: 'control-quantum', action: 'update-params', qubits: val });
});

hzSlider.addEventListener('input', (e) => {
    hzVal.textContent = hzModes[e.target.value];
    chrome.storage.local.set({ hzIndex: parseInt(e.target.value) });
});

geoSlider.addEventListener('input', (e) => {
    geoVal.textContent = geoModes[e.target.value];
    const val = parseInt(e.target.value);
    chrome.storage.local.set({ geoTopology: val });
    chrome.runtime.sendMessage({ type: 'control-quantum', action: 'update-params', topology: val });
});

function resizeCanvas() {
    canvas.width = canvas.clientWidth;
    canvas.height = canvas.clientHeight;
}
resizeCanvas();

function drawQuantumWave() {
    ctx.fillStyle = 'rgba(7, 8, 12, 0.2)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.beginPath();
    ctx.lineWidth = 2;
    
    const gradient = ctx.createLinearGradient(0, 0, canvas.width, 0);
    gradient.addColorStop(0, '#00f2fe');
    gradient.addColorStop(1, '#a855f7');
    ctx.strokeStyle = gradient;

    if (isRunning) {
        ctx.shadowBlur = 8;
        ctx.shadowColor = '#00f2fe';
    }

    const sliceWidth = canvas.width / 100;
    let x = 0;

    for (let i = 0; i <= 100; i++) {
        const timeFactor = isRunning ? Date.now() * 0.005 : 0;
        let amplitudeModifier = 20;
        
        // Визуально модулируем волну на холсте в зависимости от выбранной геометрии реверберации
        const currentGeo = parseInt(geoSlider.value);
        if (currentGeo === 1) amplitudeModifier = 25 * Math.sin(i * 0.05); // Икосаэдр
        if (currentGeo === 2) amplitudeModifier = 15 * Math.sin(i * 0.3);   // Фрактал
        if (currentGeo === 3) amplitudeModifier = 30 * Math.cos(i * 0.1);   // Звезда

        const y = (canvas.height / 2) + 
                  (isRunning ? Math.sin(i * 0.15 + timeFactor) * amplitudeModifier * Math.cos(i * 0.05 - timeFactor * 0.3) : 0);

        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        x += sliceWidth;
    }

    ctx.stroke();
    ctx.shadowBlur = 0;
    animationFrameId = requestAnimationFrame(drawQuantumWave);
}

document.getElementById('startBtn').addEventListener('click', async () => {
    statusText.textContent = "Инициализация...";
    statusText.style.color = "#00f2fe";

    const selectedQubits = parseInt(qubitSlider.value);
    const hzModeIndex = parseInt(hzSlider.value);
    const selectedHz = hzValues[hzModeIndex];
    const selectedTopology = parseInt(geoSlider.value);

    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab) return;

    chrome.runtime.sendMessage({
        type: 'control-quantum',
        action: 'start',
        tabId: tab.id,
        qubits: selectedQubits,
        hz: selectedHz,
        topology: selectedTopology
    });
});

document.getElementById('pauseBtn').addEventListener('click', () => {
    chrome.runtime.sendMessage({ type: 'control-quantum', action: 'toggle-pause' });
});

document.getElementById('stopBtn').addEventListener('click', () => {
    chrome.runtime.sendMessage({ type: 'control-quantum', action: 'stop' });
    isRunning = false;
    currentNs = 0;
    document.getElementById('nsValue').textContent = "0.00 нс";
    document.getElementById('fpsValue').textContent = "0.00 Гц";
});

chrome.runtime.onMessage.addListener((message) => {
    if (message.target === 'popup') {
        if (message.type === 'status-update') {
            statusText.textContent = message.text;
            if (message.state === 'active') {
                statusText.style.color = "#22c55e";
                isRunning = true;
            } else if (message.state === 'paused') {
                statusText.style.color = "#eab308";
                isRunning = false;
            } else {
                statusText.style.color = "#64748b";
                isRunning = false;
                currentNs = 0;
                document.getElementById('nsValue').textContent = "0.00 нс";
                document.getElementById('fpsValue').textContent = "0.00 Гц";
            }
        }

        if (message.type === 'telemetry-update') {
            const consoleLogDiv = document.getElementById('consoleLog');
            const newLogItem = document.createElement('div');
            newLogItem.textContent = message.text;
            if (message.isError) { newLogItem.style.color = '#ef4444'; }
            consoleLogDiv.appendChild(newLogItem);
            consoleLogDiv.scrollTop = consoleLogDiv.scrollHeight;
        }

        if (message.type === 'speed-metrics-update' && isRunning) {
            currentNs = parseFloat(message.ns);
            document.getElementById('nsValue').textContent = `${message.ns} нс`;
            document.getElementById('fpsValue').textContent = `${message.fps} Гц`;
        }
    }
});

drawQuantumWave();
chrome.runtime.sendMessage({ type: 'get-current-status' });
