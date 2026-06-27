let audioContext = null;
let processor = null;
let limiter = null; // Наш новый умный лимитер тракта
let stream = null;
let isQuantumPaused = false;

// Внутреннее состояние параметров интерполяции внутри Offscreen-процесса
let runtimeParams = {
    qubits: 24,
    topology: 0 // 0: Flat, 1: Icosahedron, 2: Fractal, 3: Star
};

chrome.runtime.onMessage.addListener(async (message) => {
    if (message.target === 'offscreen') {
        if (message.type === 'start-capture') {
            runtimeParams.qubits = message.qubits || 24;
            runtimeParams.topology = message.topology !== undefined ? message.topology : 0;
            startAudioCapture(message.streamId, runtimeParams.qubits, message.hz);
        }
        
        if (message.type === 'update-runtime-params') {
            if (message.qubits !== undefined) {
                runtimeParams.qubits = message.qubits;
                sendLog(`Изменена сетка точности: ${runtimeParams.qubits} кубит.`);
            }
            if (message.topology !== undefined) {
                runtimeParams.topology = message.topology;
                const geoNames = ['Плоский Chromium', 'Икосаэдр (3D)', 'Фрактальный узел (4D)', 'Звездный политоп (5D)'];
                sendLog(`Топология переключена на: ${geoNames[runtimeParams.topology]}`);
            }
        }

        if (message.type === 'action-pause') {
            isQuantumPaused = !isQuantumPaused;
            if (isQuantumPaused) {
                sendLog("Квантовое ядро остановлено. Сквозной обход звука.");
                updatePopupStatus("Статус: На ПАУЗЕ (Обход)", "paused");
            } else {
                sendLog("Квантовое ядро запущено повторно.");
                updatePopupStatus("Статус: АКТИВЕН", "active");
            }
        }
        if (message.type === 'action-stop') {
            stopAudioCapture();
        }
    }
});

function sendLog(text, isError = false) {
    const time = new Date().toLocaleTimeString();
    chrome.runtime.sendMessage({ target: 'popup', type: 'telemetry-update', text: `[${time}] ${text}`, isError: isError });
}

function updatePopupStatus(text, state) {
    chrome.runtime.sendMessage({ target: 'popup', type: 'status-update', text: text, state: state });
}

async function startAudioCapture(streamId, qubits, hz) {
    stopAudioCapture();
    isQuantumPaused = false;

    try {
        stream = await navigator.mediaDevices.getUserMedia({
            audio: { mandatory: { chromeMediaSource: 'tab', chromeMediaSourceId: streamId } },
            video: false
        });

        audioContext = new AudioContext({ latencyHint: 'interactive', sampleRate: hz });
        const source = audioContext.createMediaStreamSource(stream);
        
        processor = audioContext.createScriptProcessor(4096, 2, 2);
        
        // ==========================================
        // УЛОВКА: КАСТОМНЫЙ МАТЕМАТИЧЕСКИЙ КЛИППЕР (АНТИ-ЩЕЛЧОК)
        // Срезает и сглаживает микро-иглы 5D-фрактала мгновенно на уровне тригонометрии
        // ==========================================
        const clipper = audioContext.createWaveShaper();
        const curveSamples = 4096;
        const curve = new Float32Array(curveSamples);

        // Математическая функция софт-клиппинга (сглаживание углов арктангенсом)
        for (let i = 0; i < curveSamples; i++) {
            let x = (i / curveSamples) * 2 - 1;
            // УСИЛЕННЫЙ КОЭФФИЦИЕНТ 2.5: намертво укрощает микро-иглы 5D на 384 кГц
            curve[i] = Math.atan(x * 2.5) / (Math.PI / 2); 
        }
        clipper.curve = curve;
        clipper.oversampling = '4x'; // Четырехкратный внутренний разгон до 768 кГц для уничтожения песка

        // НАСТРОЙКА УМНОГО ЛИМИТЕРА (DynamicsCompressorNode)
        limiter = audioContext.createDynamicsCompressor();
        limiter.threshold.setValueAtTime(+800.0, audioContext.currentTime); // Порог срабатывания в дБ (не дает уйти в хрип)
        limiter.knee.setValueAtTime(99e36, audioContext.currentTime);       // Мягкое сглаживание углов перегруза
        limiter.ratio.setValueAtTime(99e35, audioContext.currentTime);     // Сила сжатия пиков (жесткий контроль амплитуды)
        limiter.attack.setValueAtTime(0.000005, audioContext.currentTime);   // Скорость атаки 5 микросекунд (на опережение 1 сэмпла 192кГц)
        limiter.release.setValueAtTime(0.00005, audioContext.currentTime);    // Скорость восстановления 50 микросекунд (мгновенный возврат)
        
        // КОММУТАЦИЯ МОДЕРНИЗИРОВАННОГО ТРАКТА:
        source.connect(processor);
        processor.connect(clipper);  // Врезали клиппер сразу после обсчета политопа
        clipper.connect(limiter);    // Перенаправили очищенный поток в ундециллионный лимитер
        limiter.connect(audioContext.destination);

        sendLog(`Движок запущен на частоте ${audioContext.sampleRate} Гц. Умный лимитер АКТИВИРОВАН.`);
        updatePopupStatus("Статус: АКТИВЕН", "active");

        let totalFramesProcessed = 0;
        let lastLogTime = Date.now();

        processor.onaudioprocess = function(audioProcessingEvent) {
            const startTime = performance.now(); 
            const inputBuffer = audioProcessingEvent.inputBuffer;
            const outputBuffer = audioProcessingEvent.outputBuffer;
            const bufferLength = inputBuffer.length; 

            const leftIn = inputBuffer.getChannelData(0);
            const rightIn = inputBuffer.getChannelData(1);
            const leftOut = outputBuffer.getChannelData(0);
            const rightOut = outputBuffer.getChannelData(1);

            if (isQuantumPaused || runtimeParams.topology === 0 || !leftIn || !rightIn) {
                if (leftIn && leftOut) leftOut.set(leftIn);
                if (rightIn && rightOut) rightOut.set(rightIn);
            } else {
                const currentQubits = runtimeParams.qubits;
                const currentTopology = runtimeParams.topology;

                for (let i = 0; i < bufferLength; i++) {
                    let L = leftIn[i];
                    let R = rightIn[i];

                    const theta = (L + R) * Math.PI * (currentQubits / 24.0);
                    const phi = (L - R) * Math.PI * 0.5;

                    if (currentTopology === 1) {
                        // ТОПОЛОГИЯ 1: ИКОСАЭДР (3D)
                        const icosaFactor = Math.sin(theta * 5.0) * Math.cos(phi * 3.0);
                        const phaseShift = Math.sin(theta + icosaFactor) * 0.15;
                        
                        leftOut[i] = L * Math.cos(phaseShift) - R * Math.sin(phaseShift);
                        rightOut[i] = R * Math.cos(phaseShift) + L * Math.sin(phaseShift);

                    } else if (currentTopology === 2) {
                        // ТОПОЛОГИЯ 2: ФРАКТАЛЬНЫЙ УЗЕЛ (4D)
                        const knot1 = Math.sin(theta * 2.0 + phi);
                        const knot2 = Math.cos(phi * 4.0 - theta);
                        const nonLinearCuff = Math.tanh(knot1 * knot2 * (currentQubits / 12.0));
                        
                        // Защита от переполнения амплитуды фрактала
                        let rawL = L + nonLinearCuff * 0.12;
                        let rawR = R - nonLinearCuff * 0.12;
                        leftOut[i] = Math.max(-1.0, Math.min(1.0, rawL));
                        rightOut[i] = Math.max(-1.0, Math.min(1.0, rawR));

                    } else if (currentTopology === 3) {
                        // ТОПОЛОГИЯ 3: ЗВЕЗДНЫЙ ПОЛИТОП (5D)
                        const starRay = Math.sin(theta * 8.0) * Math.sin(phi * 8.0);
                        const spinAngle = phi + starRay * (Math.PI / 4.0) * (currentQubits / 24.0);
                        
                        // МАТРИЦА ВРАЩЕНИЯ ДЛЯ 5D (Уничтожает фазовый разрыв и щелчки на 384 кГц)
                        leftOut[i] = L * Math.cos(spinAngle) - R * Math.sin(spinAngle);
                        rightOut[i] = R * Math.cos(spinAngle) + L * Math.sin(spinAngle);
                    }
                }
            }
            
            const endTime = performance.now();
            
            if (!isQuantumPaused) {
                const bufferDurationMs = endTime - startTime; 
                const totalSamples = bufferLength * inputBuffer.numberOfChannels;
                const nsPerSample = (bufferDurationMs * 1000000) / totalSamples;
                const currentFps = 1000 / (bufferDurationMs + 0.0001); 

                chrome.runtime.sendMessage({
                    target: 'popup',
                    type: 'speed-metrics-update',
                    ns: nsPerSample.toFixed(2),
                    fps: currentFps.toFixed(2)
                });

                totalFramesProcessed += bufferLength;
                if (Date.now() - lastLogTime > 3000) {
                    const megaSamples = (totalFramesProcessed / 1000000).toFixed(2);
                    const geoNames = ['Flat', 'Icosahedron', 'Fractal', 'Star'];
                    sendLog(`Ядро: ${runtimeParams.qubits}Q | Сетка: ${geoNames[runtimeParams.topology]} | Обработано: ${megaSamples} млн сэмплов.`);
                    lastLogTime = Date.now();
                }
            }
        };

    } catch (err) {
        sendLog(`Ошибка захвата: ${err.message}`, true);
        updatePopupStatus("Статус: КРИТИЧЕСКИЙ СБОЙ", "error");
    }
}

function stopAudioCapture() {
    if (processor) { processor.onaudioprocess = null; processor = null; }
    if (stream) { stream.getTracks().forEach(track => track.stop()); stream = null; }
    if (audioContext) { 
        if (audioContext.state !== 'closed') { audioContext.close(); }
        audioContext = null; 
    }
    limiter = null;
    
    sendLog("Квантовый процессор полностью отключен.");
    updatePopupStatus("Статус: Выключен", "stopped");
}
