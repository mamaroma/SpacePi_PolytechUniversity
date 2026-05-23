/**
 * Timeline component for SDR recordings playback
 */
class TimelinePlayer {
    constructor(canvasId, controlsId) {
        this.canvas = document.getElementById(canvasId);
        this.ctx = this.canvas.getContext('2d');
        this.controlsContainer = document.getElementById(controlsId);
        
        this.serverTimeOffsetMs = 0;
        this.recordings = [];
        this.currentTime = this.getNow();
        this.startTime = new Date(this.currentTime.getTime() - 48 * 60 * 60 * 1000); // 48 hours ago
        this.endTime = this.currentTime;
        
        this.isPlaying = false;
        this.isLiveMode = true;
        this.isDragging = false;
        this.seekPlaybackTimer = null;
        this.seekPlaybackStartDelayMs = 400;
        
        this.setupCanvas();
        this.createControls();
        this.setupEventListeners();
        
        // Update timeline more frequently to catch new recordings
        setInterval(() => this.updateTimeline(), 5000); // Every 5 seconds instead of 30
        setInterval(() => this.syncServerTime(), 60000);
        this.syncServerTime();
        this.updateTimeline();
        
        // Start live time updates
        this.startLiveTimeUpdate();
    }

    getNow() {
        return new Date(Date.now() + this.serverTimeOffsetMs);
    }

    async syncServerTime() {
        try {
            const response = await fetch('/sdr/api/time', { cache: 'no-store' });
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }
            const data = await response.json();
            if (typeof data.server_timestamp_ms === 'number') {
                this.serverTimeOffsetMs = data.server_timestamp_ms - Date.now();
            } else if (data.server_time_utc) {
                this.serverTimeOffsetMs = new Date(data.server_time_utc).getTime() - Date.now();
            }
        } catch (error) {
            console.warn('Failed to sync server time, using browser clock:', error);
        }
    }
    
    setupCanvas() {
        // Set canvas size
        this.canvas.width = this.canvas.offsetWidth;
        this.canvas.height = 60;
        
        // Handle high DPI displays
        const dpr = window.devicePixelRatio || 1;
        const rect = this.canvas.getBoundingClientRect();
        this.canvas.width = rect.width * dpr;
        this.canvas.height = rect.height * dpr;
        this.ctx.scale(dpr, dpr);
        this.canvas.style.width = rect.width + 'px';
        this.canvas.style.height = rect.height + 'px';
    }
    
    createControls() {
        this.controlsContainer.innerHTML = `
            <div class="timeline-controls">
                <button id="play-pause-btn" class="btn">Пауза</button>
                <button id="live-mode-btn" class="btn btn-live">РЕАЛЬНОЕ ВРЕМЯ</button>
                <span id="current-time-display">--:--:--</span>
                <button id="download-latest-btn" class="btn">Скачать последнюю</button>
            </div>
        `;
    }
    
    setupEventListeners() {
        // Canvas events
        this.canvas.addEventListener('mousedown', (e) => this.onMouseDown(e));
        this.canvas.addEventListener('mousemove', (e) => this.onMouseMove(e));
        this.canvas.addEventListener('mouseup', (e) => this.onMouseUp(e));
        this.canvas.addEventListener('mouseleave', (e) => this.onMouseUp(e));
        
        // Control buttons
        document.getElementById('play-pause-btn').addEventListener('click', () => this.togglePlayPause());
        document.getElementById('live-mode-btn').addEventListener('click', () => this.returnToLive());
        document.getElementById('download-latest-btn').addEventListener('click', () => this.downloadLatestRecording());
        
        // Window resize
        window.addEventListener('resize', () => this.setupCanvas());
    }
    
    async updateTimeline() {
        try {
            if (this.isLiveMode) {
                this.updateLiveWindow();
            }
            const response = await fetch('/sdr/api/timeline?hours_back=48');
            const data = await response.json();
            const newRecordings = data.recordings || [];
            
            this.recordings = newRecordings;
            
            console.log('Timeline updated:', {
                recordingsCount: this.recordings.length,
                recordings: this.recordings.map(r => ({
                    filename: r.filename,
                    start: r.start_time,
                    end: r.end_time
                }))
            });
            
            this.draw();
            
        } catch (error) {
            console.error('Failed to update timeline:', error);
        }
    }
    
    draw() {
        if (this.isLiveMode) {
            this.updateLiveWindow();
        }
        const ctx = this.ctx;
        const width = this.canvas.offsetWidth;
        const height = this.canvas.offsetHeight;
        
        // Clear canvas
        ctx.clearRect(0, 0, width, height);
        
        // Draw darker background for better contrast
        ctx.fillStyle = '#0a0a0a';
        ctx.fillRect(0, 0, width, height);
        
        // Draw time scale
        this.drawTimeScale(ctx, width, height);
        
        // Draw recordings (green areas)
        this.drawRecordings(ctx, width, height);
        
        // Draw current time indicator
        this.drawCurrentTimeIndicator(ctx, width, height);
        
        // Update time display
        this.updateTimeDisplay();
    }
    
    drawTimeScale(ctx, width, height) {
        const timeRange = this.endTime - this.startTime;
        
        ctx.strokeStyle = '#333';
        ctx.lineWidth = 1;
        
        // Draw -24 hour divider line (middle of timeline)
        const midPoint = width / 2;
        ctx.strokeStyle = '#666';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(midPoint, 0);
        ctx.lineTo(midPoint, height);
        ctx.stroke();
        
        // Add small text label for -24h mark
        ctx.fillStyle = '#888';
        ctx.font = '10px monospace';
        ctx.fillText('-24ч', midPoint + 2, 12);
        
        // Reset line width
        ctx.lineWidth = 1;
        ctx.strokeStyle = '#333';
        
        // Draw subtle hour marks without labels
        const startHour = new Date(this.startTime);
        startHour.setMinutes(0, 0, 0);
        
        for (let time = new Date(startHour); time <= this.endTime; time.setHours(time.getHours() + 1)) {
            const x = (time - this.startTime) / timeRange * width;
            
            // Small hour tick marks
            ctx.beginPath();
            ctx.moveTo(x, height - 5);
            ctx.lineTo(x, height);
            ctx.stroke();
        }
    }
    
    drawRecordings(ctx, width, height) {
        const timeRange = this.endTime - this.startTime;
        const pixelsPerMs = width / timeRange;
        
        // Яркий неоновый зеленый с тенью для лучшей видимости
        ctx.shadowColor = '#00ff00';
        ctx.shadowBlur = 3;
        ctx.fillStyle = '#00ff00';
        
        this.recordings.forEach(recording => {
            const startTime = new Date(recording.start_time);
            const endTime = new Date(recording.end_time);
            
            const startX = Math.max(0, (startTime - this.startTime) * pixelsPerMs);
            const endX = Math.min(width, (endTime - this.startTime) * pixelsPerMs);
            const recordingWidth = endX - startX;
            
            if (recordingWidth > 0) {
                // Рисуем основную зеленую полосу
                ctx.fillRect(startX, 5, recordingWidth, height - 15);
                
                // Добавляем яркую границу сверху и снизу
                ctx.fillStyle = '#66ff66';
                ctx.fillRect(startX, 5, recordingWidth, 3);
                ctx.fillRect(startX, height - 13, recordingWidth, 3);
                
                // Возвращаем основной цвет
                ctx.fillStyle = '#00ff00';
            }
        });
        
        // Убираем тень для остальных элементов
        ctx.shadowBlur = 0;
    }
    
    drawCurrentTimeIndicator(ctx, width, height) {
        const timeRange = this.endTime - this.startTime;
        const pixelsPerMs = width / timeRange;
        const x = (this.currentTime - this.startTime) * pixelsPerMs;
        
        if (x >= 0 && x <= width) {
            ctx.strokeStyle = this.isLiveMode ? '#ff4444' : '#ffff44';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(x, 0);
            ctx.lineTo(x, height);
            ctx.stroke();
            ctx.lineWidth = 1;
        }
    }
    
    onMouseDown(e) {
        if (this.isLiveMode) {
            this.exitLiveMode();
        }
        
        this.isDragging = true;
        this.updateTimeFromMouse(e);
    }
    
    onMouseMove(e) {
        if (this.isDragging) {
            this.updateTimeFromMouse(e);
        }
    }
    
    onMouseUp(e) {
        this.isDragging = false;
    }
    
    updateTimeFromMouse(e) {
        const rect = this.canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const width = rect.width;
        
        const timeRange = this.endTime - this.startTime;
        const clickTime = new Date(this.startTime.getTime() + (x / width) * timeRange);
        
        this.seekToTime(clickTime);
    }
    
    async seekToTime(targetTime) {
        this.currentTime = targetTime;
        this.draw();
        
        try {
            if (this.isPlaying) {
                await fetch('/sdr/api/playback/stop', { method: 'POST' });
                this.isPlaying = false;
            }

            await fetch('/sdr/api/playback/seek', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ target_time: targetTime.toISOString() })
            });
            this.scheduleDelayedPlaybackStart();
        } catch (error) {
            console.error('Failed to seek:', error);
        }
    }

    scheduleDelayedPlaybackStart() {
        if (this.isLiveMode) {
            return;
        }

        if (this.seekPlaybackTimer) {
            clearTimeout(this.seekPlaybackTimer);
        }

        this.seekPlaybackTimer = setTimeout(async () => {
            this.seekPlaybackTimer = null;

            if (this.isLiveMode) {
                return;
            }

            try {
                await fetch('/sdr/api/playback/start', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ start_time: this.currentTime.toISOString() })
                });
                this.isPlaying = true;
                document.getElementById('play-pause-btn').textContent = 'Пауза';
                this.startPlaybackTimer();
            } catch (error) {
                console.error('Failed to start delayed playback:', error);
            }
        }, this.seekPlaybackStartDelayMs);
    }
    
    async togglePlayPause() {
        if (this.isLiveMode) {
            return; // Can't pause in live mode
        }
        
        try {
            if (this.isPlaying) {
                if (this.seekPlaybackTimer) {
                    clearTimeout(this.seekPlaybackTimer);
                    this.seekPlaybackTimer = null;
                }
                await fetch('/sdr/api/playback/stop', { method: 'POST' });
                this.isPlaying = false;
                document.getElementById('play-pause-btn').textContent = 'Воспроизвести';
            } else {
                if (this.seekPlaybackTimer) {
                    clearTimeout(this.seekPlaybackTimer);
                    this.seekPlaybackTimer = null;
                }
                await fetch('/sdr/api/playback/start', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ start_time: this.currentTime.toISOString() })
                });
                this.isPlaying = true;
                document.getElementById('play-pause-btn').textContent = 'Пауза';
                
                // Update current time while playing
                this.startPlaybackTimer();
            }
        } catch (error) {
            console.error('Failed to toggle playback:', error);
        }
    }
    
    startPlaybackTimer() {
        if (this.playbackTimer) {
            clearInterval(this.playbackTimer);
        }
        
        this.playbackTimer = setInterval(() => {
            if (this.isPlaying && !this.isLiveMode) {
                this.currentTime = new Date(this.currentTime.getTime() + 1000);
                this.draw();
            }
        }, 1000);
    }
    
    async returnToLive() {
        try {
            // Stop any playback
            if (this.isPlaying) {
                await fetch('/sdr/api/playback/stop', { method: 'POST' });
                this.isPlaying = false;
            }
            
            // Clear playback timer
            if (this.playbackTimer) {
                clearInterval(this.playbackTimer);
                this.playbackTimer = null;
            }

            if (this.seekPlaybackTimer) {
                clearTimeout(this.seekPlaybackTimer);
                this.seekPlaybackTimer = null;
            }
            
            // Return to live mode
            this.isLiveMode = true;
            await this.syncServerTime();
            this.currentTime = this.getNow();
            this.updateLiveWindow();
            
            // Start real-time clock update
            this.startLiveTimeUpdate();
            
            // Update UI
            document.getElementById('play-pause-btn').textContent = 'Пауза';
            document.getElementById('live-mode-btn').classList.add('btn-live');
            const downloadBtn = document.getElementById('download-btn');
            if (downloadBtn) {
                downloadBtn.style.display = 'none';
            }
            
            this.draw();
            
        } catch (error) {
            console.error('Failed to return to live mode:', error);
        }
    }
    
    startLiveTimeUpdate() {
        // Clear any existing timer
        if (this.liveTimeTimer) {
            clearInterval(this.liveTimeTimer);
        }
        
        // Update current time every second in live mode
        this.liveTimeTimer = setInterval(() => {
            if (this.isLiveMode) {
                this.currentTime = this.getNow();
                this.updateLiveWindow();
                this.draw();
            }
        }, 1000);
    }
    
    exitLiveMode() {
        this.isLiveMode = false;
        
        // Stop live time updates
        if (this.liveTimeTimer) {
            clearInterval(this.liveTimeTimer);
            this.liveTimeTimer = null;
        }
        
        document.getElementById('live-mode-btn').classList.remove('btn-live');
    }
    
    updateTimeDisplay() {
        const formattedMskTime = this.formatMoscowTime(this.currentTime);
        document.getElementById('current-time-display').textContent = `${formattedMskTime} МСК`;
        
        // Update pass status
        const isRecording = this.isTimeInRecording(this.currentTime);
        const passStatus = document.getElementById('pass-status');
        if (passStatus) {
            // Show "ИДЁТ ПРОЛЁТ!" when:
            // 1. In live mode and currently receiving data (auto-recording active)
            // 2. In playback mode and playing back a recorded pass
            if (this.isLiveMode) {
                // In live mode, check if auto-recording is active
                this.checkAutoRecordingStatus().then(isAutoRecording => {
                    if (isAutoRecording) {
                        passStatus.textContent = 'ИДЁТ ПРОЛЁТ!';
                        passStatus.style.display = 'block';
                    } else {
                        passStatus.style.display = 'none';
                    }
                });
            } else {
                // In playback mode, show if playing back a recording
                if (isRecording) {
                    passStatus.textContent = 'ИДЁТ ПРОЛЁТ!';
                    passStatus.style.display = 'block';
                } else {
                    passStatus.style.display = 'none';
                }
            }
        }
    }
    
    updateLiveWindow() {
        const now = this.getNow();
        this.endTime = now;
        this.startTime = new Date(now.getTime() - 48 * 60 * 60 * 1000);
    }

    formatMoscowTime(date) {
        return new Intl.DateTimeFormat('ru-RU', {
            timeZone: 'Europe/Moscow',
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hour12: false
        }).format(date).replace(',', '');
    }

    async checkAutoRecordingStatus() {
        try {
            const response = await fetch('/sdr/api/auto-record/state');
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }
            const state = await response.json();
            return state.is_recording || false;
        } catch (error) {
            // Don't spam console with errors, just return false
            return false;
        }
    }
    
    isTimeInRecording(time) {
        return this.recordings.some(recording => {
            const start = new Date(recording.start_time);
            const end = new Date(recording.end_time);
            return time >= start && time <= end;
        });
    }
    
    updateDownloadButton() {
        const downloadBtn = document.getElementById('download-btn');
        const currentRecording = this.getCurrentRecording();
        
        // In live mode, show download button for the latest recording if it exists
        let shouldShowDownload = false;
        let recordingToDownload = null;
        
        if (!this.isLiveMode && currentRecording) {
            // Playback mode - show download for current time recording
            shouldShowDownload = true;
            recordingToDownload = currentRecording;
        } else if (this.isLiveMode && this.recordings.length > 0) {
            // Live mode - show download for latest recording
            const sortedRecordings = [...this.recordings].sort((a, b) => 
                new Date(b.start_time) - new Date(a.start_time)
            );
            recordingToDownload = sortedRecordings[0];
            
            // Only show if the latest recording is recent (within last 10 minutes)
            const latestTime = new Date(recordingToDownload.end_time);
            const now = new Date();
            const timeDiff = (now - latestTime) / 1000 / 60; // minutes
            
            if (timeDiff <= 10) {
                shouldShowDownload = true;
            }
        }
        
        console.log('Update download button:', {
            currentRecording,
            isLiveMode: this.isLiveMode,
            currentTime: this.currentTime,
            shouldShowDownload,
            recordingToDownload: recordingToDownload?.filename
        });
        
        if (shouldShowDownload && recordingToDownload) {
            downloadBtn.style.display = 'inline-block';
            downloadBtn.title = `Скачать ${recordingToDownload.filename}`;
            
            // Update the download function to use the correct recording
            downloadBtn.onclick = () => {
                console.log(`Downloading: ${recordingToDownload.filename}`);
                const link = document.createElement('a');
                link.href = `/sdr/api/download/${recordingToDownload.filename}`;
                link.download = recordingToDownload.filename;
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
            };
        } else {
            downloadBtn.style.display = 'none';
        }
    }
    
    getCurrentRecording() {
        return this.recordings.find(recording => {
            const start = new Date(recording.start_time);
            const end = new Date(recording.end_time);
            return this.currentTime >= start && this.currentTime <= end;
        });
    }
    
    downloadLatestRecording() {
        // Sort recordings by start time and get the latest one
        const sortedRecordings = [...this.recordings].sort((a, b) => 
            new Date(b.start_time) - new Date(a.start_time)
        );
        
        const latestRecording = sortedRecordings[0];
        
        console.log('Download latest attempt:', {
            latestRecording,
            totalRecordings: this.recordings.length,
            sortedRecordings: sortedRecordings.map(r => r.filename)
        });
        
        if (latestRecording) {
            console.log(`Downloading latest: ${latestRecording.filename}`);
            const link = document.createElement('a');
            link.href = `/sdr/api/download/${latestRecording.filename}`;
            link.download = latestRecording.filename;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        } else {
            console.error('No recordings found');
            alert('Нет записей для скачивания');
        }
    }
    
    downloadRecording() {
        const currentRecording = this.getCurrentRecording();
        console.log('Download attempt:', {
            currentRecording,
            currentTime: this.currentTime,
            isLiveMode: this.isLiveMode,
            recordings: this.recordings
        });
        
        if (currentRecording) {
            console.log(`Downloading: ${currentRecording.filename}`);
            const link = document.createElement('a');
            link.href = `/sdr/api/download/${currentRecording.filename}`;
            link.download = currentRecording.filename;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        } else {
            console.error('No current recording found for download');
            alert('Нет записи для скачивания в текущем времени');
        }
    }
}

// Export for use in main script
window.TimelinePlayer = TimelinePlayer;
