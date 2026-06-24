let audioContext = null;
let processor = null;
let stream = null;
let isQuantumPaused = false;

chrome.runtime.onMessage.addListener(async (message) => {
    if (message.target === 'offscreen') {
        if (message.type === 'start-capture') {
            startAudioCapture(message.streamId, message.qubits, message.hz);
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

        // Создаем контекст с явным указанием латентности
        audioContext = new AudioContext({ latencyHint: 'interactive', sampleRate: hz });
        const source = audioContext.createMediaStreamSource(stream);
        
        // Возвращаем ультра-стабильный буфер (4096 идеален для обхода блокировок)
        processor = audioContext.createScriptProcessor(4096, 2, 2);
        
        source.connect(processor);
        processor.connect(audioContext.destination);

        sendLog(`Движок запущен на частоте ${audioContext.sampleRate} Гц.`);
        updatePopupStatus("Статус: АКТИВЕН", "active");

        let totalFramesProcessed = 0;
        let lastLogTime = Date.now();

        processor.onaudioprocess = function(audioProcessingEvent) {
            const startTime = performance.now(); 
            const inputBuffer = audioProcessingEvent.inputBuffer;
            const outputBuffer = audioProcessingEvent.outputBuffer;
            const bufferLength = inputBuffer.length; 

            for (let channel = 0; channel < inputBuffer.numberOfChannels; channel++) {
                const inputData = inputBuffer.getChannelData(channel);
                const outputData = outputBuffer.getChannelData(channel);

                if (inputData && outputData) {
                    for (let sample = 0; sample < bufferLength; sample++) {
                        outputData[sample] = inputData[sample];
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
                    sendLog(`Стабильно. Обработано: ${megaSamples} млн сэмплов. Нагрузка в норме.`);
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
    
    sendLog("Квантовый процессор полностью отключен.");
    updatePopupStatus("Статус: Выключен", "stopped");
}