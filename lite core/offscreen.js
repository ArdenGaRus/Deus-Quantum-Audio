let audioContext = null;
let processor = null;
let limiter = null; 
let stream = null;
let isQuantumPaused = false;

let runtimeParams = {
    qubits: 24,
    topology: 0 
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
                runtimeParams.qubits = Number(message.qubits);
                sendLog(`Изменена сетка точности: ${runtimeParams.qubits} кубит.`);
            }
            if (message.topology !== undefined) {
                runtimeParams.topology = Number(message.topology);
                const geoNames = ['Плоский Chromium', 'Икосаэдр (3D)', 'Фрактальный узел (4D)', 'Звездный политоп (5D)'];
                sendLog(`Topology переключена на: ${geoNames[runtimeParams.topology]}`);
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
        
        const clipper = audioContext.createWaveShaper();
        const curveSamples = 4096;
        const curve = new Float32Array(curveSamples);

        for (let i = 0; i < curveSamples; i++) {
            let x = (i / curveSamples) * 2 - 1;
            curve[i] = Math.atan(x * 2.5) / (Math.PI / 2); 
        }
        clipper.curve = curve;
        clipper.oversampling = '4x'; 

        limiter = audioContext.createDynamicsCompressor();
        limiter.threshold.setValueAtTime(+900.0, audioContext.currentTime); 
        limiter.knee.setValueAtTime(99000000000000000000000000000000000000.0, audioContext.currentTime);       
        limiter.ratio.setValueAtTime(9900000000000000000000000000000000000.0, audioContext.currentTime);     
        limiter.attack.setValueAtTime(0.000005, audioContext.currentTime);   
        limiter.release.setValueAtTime(0.00005, audioContext.currentTime);    

        source.connect(processor);
        processor.connect(clipper);  
        clipper.connect(limiter);    
        limiter.connect(audioContext.destination);

        sendLog(`Движок запущен на частоте ${audioContext.sampleRate} Гц. Квантовое ядро восстановлено.`);
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

            if (isQuantumPaused || !leftIn || !rightIn) {
                if (leftIn && leftOut) leftOut.set(leftIn);
                if (rightIn && rightOut) rightOut.set(rightIn);
            } else {
                const currentQubits = runtimeParams.qubits;
                const currentTopology = runtimeParams.topology;
                
                // ТОЧЕЧНЫЙ КРОССФЕЙД В 1 СЭМПЛ: убирает щелчки Хрома, но сохраняет ярость электро!
                const fadeSamples = 1; 

                for (let i = 0; i < bufferLength; i++) {
                    let L = leftIn[i];
                    let R = rightIn[i];

                    if (currentTopology === 0) {
                        leftOut[i] = L;
                        rightOut[i] = R;
                    } else {
                        const theta = (L + R) * Math.PI * (currentQubits / 24.0);
                        const phi = (L - R) * Math.PI * 0.5;

                        let outL = L;
                        let outR = R;

                        if (currentTopology === 1) {
                            const icosaFactor = Math.sin(theta * 5.0) * Math.cos(phi * 3.0);
                            const phaseShift = Math.sin(theta + icosaFactor) * 0.15;
                            outL = L * Math.cos(phaseShift) - R * Math.sin(phaseShift);
                            outR = R * Math.cos(phaseShift) + L * Math.sin(phaseShift);
                        } else if (currentTopology === 2) {
                            const knot1 = Math.sin(theta * 2.0 + phi);
                            const knot2 = Math.cos(phi * 4.0 - theta);
                            const nonLinearCuff = Math.tanh(knot1 * knot2 * (currentQubits / 12.0));
                            let rawL = L + nonLinearCuff * 0.12;
                            let rawR = R - nonLinearCuff * 0.12;
                            outL = Math.max(-1.0, Math.min(1.0, rawL));
                            outR = Math.max(-1.0, Math.min(1.0, rawR));
                        } else if (currentTopology === 3) {
                            const starRay = Math.sin(theta * 8.0) * Math.sin(phi * 8.0);
                            const spinAngle = phi + starRay * (Math.PI / 4.0) * (currentQubits / 24.0);
                            outL = L * Math.cos(spinAngle) - R * Math.sin(spinAngle);
                            outR = R * Math.cos(spinAngle) + L * Math.sin(spinAngle);
                        }

                        // Применяем микро-сглаживание краев ко всем режимам
                        let gainModifier = 1.0;
                        if (i < fadeSamples) {
                            gainModifier = Math.sin((i / fadeSamples) * Math.PI * 0.5);
                        } else if (i > bufferLength - fadeSamples) {
                            gainModifier = Math.sin(((bufferLength - i) / fadeSamples) * Math.PI * 0.5);
                        }

                        leftOut[i] = outL * gainModifier;
                        leftOut[i] = outL * gainModifier;
                        rightOut[i] = outR * gainModifier;
                    }
                }
            }

            const endTime = performance.now();
            
            if (!isQuantumPaused) {
                totalFramesProcessed += bufferLength;
                
                // Метрики и логи отправляются строго вместе раз в 3 секунды!
                if (Date.now() - lastLogTime > 3000) {
                    const bufferDurationMs = endTime - startTime; 
                    const totalSamples = bufferLength * 2;
                    const nsPerSample = (bufferDurationMs * 1000000) / totalSamples;
                    const currentFps = 1000 / (bufferDurationMs + 0.0001); 

                    chrome.runtime.sendMessage({
                        target: 'popup',
                        type: 'speed-metrics-update',
                        ns: nsPerSample.toFixed(2),
                        fps: currentFps.toFixed(2)
                    });

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
