/**
 * Waterfall display renderer for SDR spectrum visualization
 */
class WaterfallRenderer {
    constructor(canvasId) {
        this.canvas = document.getElementById(canvasId);
        this.ctx = this.canvas.getContext('2d');
        
        // Display parameters
        this.width = this.canvas.width;
        this.height = this.canvas.height;
        this.fftSize = 1024;
        
        // Waterfall data buffer
        this.waterfallData = [];
        this.maxRows = this.height;
        
        // Color mapping parameters
        this.intensity = 0.5;
        this.contrast = 0.5;
        this.minDb = -80;
        this.maxDb = -20;
        
        // Frequency display
        this.centerFreq = 145800000; // Default
        this.sampleRate = 2048000;   // Default
        
        // Initialize canvas
        this.initCanvas();
        this.createFrequencyScale();
        
        // Start animation loop
        this.animate();
    }
    
    initCanvas() {
        // Set up canvas for smooth rendering
        this.ctx.imageSmoothingEnabled = false;
        this.clearCanvas();
    }
    
    clearCanvas() {
        this.ctx.fillStyle = '#000000';
        this.ctx.fillRect(0, 0, this.width, this.height);
    }
    
    addFFTFrame(fftData, centerFreq, sampleRate) {
        // Update frequency parameters
        this.centerFreq = centerFreq;
        this.sampleRate = sampleRate;
        
        // Ensure FFT data is the right size
        if (fftData.length !== this.fftSize) {
            // Interpolate or truncate to match display width
            fftData = this.resampleFFTData(fftData, this.width);
        } else {
            // Resample to canvas width
            fftData = this.resampleFFTData(fftData, this.width);
        }
        
        // Add new row to waterfall data
        this.waterfallData.unshift(fftData);
        
        // Keep only the rows we can display
        if (this.waterfallData.length > this.maxRows) {
            this.waterfallData = this.waterfallData.slice(0, this.maxRows);
        }
        
        // Update frequency scale
        this.updateFrequencyScale();
    }
    
    resampleFFTData(data, targetLength) {
        if (data.length === targetLength) {
            return data;
        }
        
        const result = new Array(targetLength);
        const ratio = data.length / targetLength;
        
        for (let i = 0; i < targetLength; i++) {
            const sourceIndex = i * ratio;
            const lowerIndex = Math.floor(sourceIndex);
            const upperIndex = Math.min(lowerIndex + 1, data.length - 1);
            const fraction = sourceIndex - lowerIndex;
            
            // Linear interpolation
            result[i] = data[lowerIndex] * (1 - fraction) + data[upperIndex] * fraction;
        }
        
        return result;
    }
    
    render() {
        if (this.waterfallData.length === 0) {
            return;
        }
        
        // Create image data for efficient pixel manipulation
        const imageData = this.ctx.createImageData(this.width, this.waterfallData.length);
        const data = imageData.data;
        
        // Render each row
        for (let row = 0; row < this.waterfallData.length; row++) {
            const fftRow = this.waterfallData[row];
            
            for (let col = 0; col < this.width; col++) {
                const dbValue = fftRow[col] || this.minDb;
                const color = this.dbToColor(dbValue);
                
                const pixelIndex = (row * this.width + col) * 4;
                data[pixelIndex] = color.r;     // Red
                data[pixelIndex + 1] = color.g; // Green
                data[pixelIndex + 2] = color.b; // Blue
                data[pixelIndex + 3] = 255;     // Alpha
            }
        }
        
        // Clear canvas and draw the waterfall
        this.clearCanvas();
        this.ctx.putImageData(imageData, 0, 0);
    }
    
    dbToColor(dbValue) {
        // Normalize dB value to 0-1 range
        let normalized = (dbValue - this.minDb) / (this.maxDb - this.minDb);
        
        // Apply intensity and contrast adjustments
        normalized = Math.pow(normalized, 1 / (this.intensity + 0.1));
        normalized = (normalized - 0.5) * (this.contrast + 0.5) + 0.5;
        
        // Clamp to valid range
        normalized = Math.max(0, Math.min(1, normalized));
        
        // Convert to color using a simple grayscale to heatmap
        return this.valueToHeatmapColor(normalized);
    }
    
    valueToHeatmapColor(value) {
        // Simple heatmap: black -> blue -> cyan -> green -> yellow -> red -> white
        const r = Math.floor(255 * Math.max(0, Math.min(1, 
            value < 0.5 ? 0 : (value - 0.5) * 2
        )));
        
        const g = Math.floor(255 * Math.max(0, Math.min(1,
            value < 0.25 ? 0 : 
            value < 0.75 ? (value - 0.25) * 2 : 1
        )));
        
        const b = Math.floor(255 * Math.max(0, Math.min(1,
            value < 0.25 ? value * 4 :
            value < 0.5 ? 1 : 1 - (value - 0.5) * 2
        )));
        
        return { r, g, b };
    }
    
    createFrequencyScale() {
        const scaleContainer = document.getElementById('frequency-scale');
        if (!scaleContainer) return;
        
        scaleContainer.innerHTML = '';
        scaleContainer.style.position = 'relative';
        scaleContainer.style.height = '20px';
        scaleContainer.style.fontSize = '12px';
        scaleContainer.style.color = '#ccc';
    }
    
    updateFrequencyScale() {
        const scaleContainer = document.getElementById('frequency-scale');
        if (!scaleContainer) return;
        
        const startFreq = this.centerFreq - this.sampleRate / 2;
        const endFreq = this.centerFreq + this.sampleRate / 2;
        const freqRange = endFreq - startFreq;
        
        // Clear existing scale
        scaleContainer.innerHTML = '';
        
        // Add frequency markers
        const numMarkers = 5;
        for (let i = 0; i <= numMarkers; i++) {
            const freq = startFreq + (freqRange * i / numMarkers);
            const position = (i / numMarkers) * 100;
            
            const marker = document.createElement('div');
            marker.style.position = 'absolute';
            marker.style.left = position + '%';
            marker.style.transform = 'translateX(-50%)';
            marker.textContent = (freq / 1e6).toFixed(2) + ' MHz';
            
            scaleContainer.appendChild(marker);
        }
    }
    
    setIntensity(value) {
        this.intensity = Math.max(0, Math.min(1, value));
    }
    
    setContrast(value) {
        this.contrast = Math.max(0, Math.min(1, value));
    }
    
    setDbRange(minDb, maxDb) {
        this.minDb = minDb;
        this.maxDb = maxDb;
    }
    
    animate() {
        this.render();
        requestAnimationFrame(() => this.animate());
    }
}

// Export for use in main application
window.WaterfallRenderer = WaterfallRenderer;