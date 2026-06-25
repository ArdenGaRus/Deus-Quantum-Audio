let currentEngineState = {
    state: 'stopped', // stopped, active, paused
    qubits: 24,
    hz: 384000,
    topology: 0 // 0: Flat, 1: Icosahedron, 2: Fractal, 3: Star
};

chrome.runtime.onMessage.addListener(async (message) => {
    // Popup открылся и запрашивает не только статус, но и сохраненные параметры ползунков
    if (message.type === 'get-current-status') {
        chrome.runtime.sendMessage({
            target: 'popup',
            type: 'status-update',
            text: currentEngineState.state === 'active' ? "Статус: АКТИВЕН" : 
                  currentEngineState.state === 'paused' ? "Статус: На ПАУЗЕ (Обход)" : "Статус: Выключен",
            state: currentEngineState.state,
            qubits: currentEngineState.qubits,
            hz: currentEngineState.hz,
            topology: currentEngineState.topology
        });
        return;
    }

    // Динамическое обновление параметров "на лету" без перезапуска потока захвата
    if (message.type === 'control-quantum' && message.action === 'update-params') {
        if (message.qubits !== undefined) currentEngineState.qubits = message.qubits;
        if (message.topology !== undefined) currentEngineState.topology = message.topology;
        
        chrome.runtime.sendMessage({
            target: 'offscreen',
            type: 'update-runtime-params',
            qubits: currentEngineState.qubits,
            topology: currentEngineState.topology
        });
        return;
    }

    if (message.type === 'control-quantum' && message.action === 'start') {
        const contexts = await chrome.runtime.getContexts({ contextTypes: ['OFFSCREEN_DOCUMENT'] });
        
        if (contexts.length > 0 && currentEngineState.state !== 'stopped') {
            chrome.runtime.sendMessage({ 
                target: 'popup', 
                type: 'status-update', 
                text: "Статус: АКТИВЕН", 
                state: 'active', 
                qubits: currentEngineState.qubits, 
                hz: currentEngineState.hz,
                topology: currentEngineState.topology
            });
            return;
        }

        if (contexts.length === 0) {
            await chrome.offscreen.createDocument({
                url: 'offscreen.html',
                reasons: ['USER_MEDIA'],
                justification: 'Перехват аудиопотока для квантовой DSP обработки'
            });
        }

        chrome.tabCapture.getMediaStreamId({ targetTabId: message.tabId }, (streamId) => {
            if (!streamId) {
                chrome.runtime.sendMessage({ target: 'popup', type: 'status-update', text: 'Статус: Ошибка захвата вкладки', state: 'error' });
                return;
            }
            
            currentEngineState.state = 'active';
            currentEngineState.qubits = message.qubits;
            currentEngineState.hz = message.hz;
            currentEngineState.topology = message.topology !== undefined ? message.topology : 0;

            chrome.runtime.sendMessage({
                target: 'offscreen',
                type: 'start-capture',
                streamId: streamId,
                qubits: message.qubits,
                hz: message.hz,
                topology: currentEngineState.topology
            });
        });
    }

    if (message.type === 'control-quantum' && message.action === 'toggle-pause') {
        if (currentEngineState.state === 'active') {
            currentEngineState.state = 'paused';
        } else if (currentEngineState.state === 'paused') {
            currentEngineState.state = 'active';
        }
        chrome.runtime.sendMessage({ target: 'offscreen', type: 'action-pause' });
    }

    if (message.type === 'control-quantum' && message.action === 'stop') {
        currentEngineState.state = 'stopped';
        chrome.runtime.sendMessage({ target: 'offscreen', type: 'action-stop' });
        
        const contexts = await chrome.runtime.getContexts({ contextTypes: ['OFFSCREEN_DOCUMENT'] });
        if (contexts.length > 0) {
            await chrome.offscreen.closeDocument();
        }
    }

    if (message.target === 'popup') {
        chrome.runtime.sendMessage(message);
    }
});
