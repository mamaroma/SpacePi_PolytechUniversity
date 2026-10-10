/**
 * Draws one FFT row per received frame. The colour scale follows the
 * university's violet/green palette; the graph is normalised in dBFS.
 */
class WaterfallRenderer {
  constructor(waterfallId, spectrumId) {
    this.canvas = document.getElementById(waterfallId);
    this.ctx = this.canvas.getContext('2d', { alpha: false });
    this.spectrumCanvas = document.getElementById(spectrumId);
    this.spectrumCtx = this.spectrumCanvas.getContext('2d', { alpha: false });
    // Keep a linear dB scale, focused on the range occupied by this IQ feed.
    // The old 85 dB span compressed the persistent side carriers into noise.
    this.minDb = -100;
    this.maxDb = -30;
    this.noiseFloor = null;
    this.intensity = .5;
    this.contrast = .5;
    this.centerFreq = 436610000;
    this.sampleRate = 625000;
    this.spectrum = null;
    this.spectrumPower = null;
    this.palette = [
      [9, 16, 34], [23, 35, 62], [65, 49, 101],
      [71, 113, 126], [106, 184, 116], [228, 235, 167]
    ];
    this.ctx.fillStyle = '#0f111f';
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    this.drawSpectrum();
    this.updateFrequencyScale();
    this.updateAmplitudeScale();
  }

  setIntensity(value) { this.intensity = Math.max(0, Math.min(1, value)); }
  setContrast(value) { this.contrast = Math.max(0, Math.min(1, value)); }

  addFFTFrame(data, centerFrequency, sampleRate) {
    if (!Array.isArray(data) || data.length < 2) return;
    if (centerFrequency !== this.centerFreq || sampleRate !== this.sampleRate) {
      this.centerFreq = centerFrequency;
      this.sampleRate = sampleRate;
      this.updateFrequencyScale();
    }
    const values = this.resample(data, this.canvas.width);
    const noiseSample = [];
    for (let i = 0; i < values.length; i += 8) {
      if (Number.isFinite(values[i])) noiseSample.push(values[i]);
    }
    if (!noiseSample.length) return;
    noiseSample.sort((a, b) => a - b);
    const frameFloor = noiseSample[Math.floor(noiseSample.length / 2)];
    this.noiseFloor = this.noiseFloor === null ? frameFloor : this.noiseFloor * .92 + frameFloor * .08;
    // Average power, then convert back to dB. Averaging dB values hides the
    // two weak but persistent carriers in the recorded background IQ.
    // Waterfall rows still use each unmodified FFT frame below.
    if (!this.spectrumPower || this.spectrumPower.length !== values.length) {
      this.spectrumPower = values.map(db => 10 ** (db / 10));
      this.spectrum = values.slice();
    } else {
      for (let i = 0; i < values.length; i++) {
        const power = 10 ** (values[i] / 10);
        this.spectrumPower[i] = this.spectrumPower[i] * .9 + power * .1;
        this.spectrum[i] = 10 * Math.log10(Math.max(this.spectrumPower[i], 1e-24));
      }
    }
    this.ctx.drawImage(this.canvas, 0, 1);
    const row = this.ctx.createImageData(this.canvas.width, 1);
    for (let x = 0; x < values.length; x++) {
      const color = this.colorFor(values[x]);
      const offset = x * 4;
      row.data[offset] = color[0];
      row.data[offset + 1] = color[1];
      row.data[offset + 2] = color[2];
      row.data[offset + 3] = 255;
    }
    this.ctx.putImageData(row, 0, 0);
    this.drawSpectrum();
  }

  resample(data, length) {
    if (data.length === length) return data;
    const result = new Array(length);
    for (let i = 0; i < length; i++) {
      const p = i * (data.length - 1) / (length - 1);
      const lo = Math.floor(p);
      result[i] = data[lo] * (1 - (p - lo)) + data[Math.min(lo + 1, data.length - 1)] * (p - lo);
    }
    return result;
  }

  colorFor(db) {
    // Keep the ordinary noise floor dark; reserve violet and green for energy
    // clearly above the surrounding spectrum.
    let level = (db - this.noiseFloor + 12) / 42;
    level = (level - .38) * (.7 + this.contrast * .8) + .38 + (this.intensity - .5) * .25;
    level = Math.max(0, Math.min(1, level));
    const scaled = level * (this.palette.length - 1);
    const low = Math.min(this.palette.length - 2, Math.floor(scaled));
    const part = scaled - low;
    return this.palette[low].map((v, k) => Math.round(v * (1 - part) + this.palette[low + 1][k] * part));
  }

  drawSpectrum() {
    const ctx = this.spectrumCtx;
    const width = this.spectrumCanvas.width;
    const height = this.spectrumCanvas.height;
    ctx.fillStyle = '#0f111f';
    ctx.fillRect(0, 0, width, height);
    ctx.strokeStyle = 'rgba(150, 129, 181, .13)';
    ctx.lineWidth = 1;
    for (const db of this.amplitudeTicks()) {
      const y = Math.round(height * (this.maxDb - db) / (this.maxDb - this.minDb)) + .5;
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(width, y); ctx.stroke();
    }
    for (let i = 1; i < 10; i++) {
      const x = width * i / 10;
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, height); ctx.stroke();
    }
    if (!this.spectrum) return;
    const yOf = db => height - Math.max(0, Math.min(1, (db - this.minDb) / (this.maxDb - this.minDb))) * height;
    const drawLine = (points, stroke, lineWidth) => {
      ctx.beginPath();
      for (let i = 0; i < points.length; i++) {
        const x = i * width / (points.length - 1);
        const y = yOf(points[i]);
        if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y);
      }
      ctx.strokeStyle = stroke;
      ctx.lineWidth = lineWidth;
      ctx.stroke();
    };
    const fill = ctx.createLinearGradient(0, 0, 0, height);
    fill.addColorStop(0, 'rgba(111, 194, 103, .26)');
    fill.addColorStop(1, 'rgba(111, 194, 103, .01)');
    ctx.beginPath();
    ctx.moveTo(0, height);
    for (let i = 0; i < this.spectrum.length; i++) ctx.lineTo(i * width / (this.spectrum.length - 1), yOf(this.spectrum[i]));
    ctx.lineTo(width, height);
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.fill();
    drawLine(this.spectrum, '#7bd276', 1.5);
  }

  amplitudeTicks() {
    const ticks = [];
    for (let db = Math.ceil(this.minDb / 10) * 10 + 10; db < this.maxDb; db += 10) ticks.push(db);
    return ticks;
  }

  updateAmplitudeScale() {
    const container = document.getElementById('amplitude-scale');
    if (!container) return;
    container.replaceChildren();
    const span = this.maxDb - this.minDb;
    for (const db of this.amplitudeTicks()) {
      const label = document.createElement('div');
      label.style.top = ((this.maxDb - db) / span) * 100 + '%';
      label.textContent = db + ' дБ';
      container.append(label);
    }
  }

  updateFrequencyScale() {
    const container = document.getElementById('frequency-scale');
    container.replaceChildren();
    for (let i = 0; i <= 4; i++) {
      const label = document.createElement('div');
      label.style.left = i * 25 + '%';
      label.textContent = ((this.centerFreq + (i / 4 - .5) * this.sampleRate) / 1e6).toFixed(3) + ' МГц';
      container.append(label);
    }
  }
}
window.WaterfallRenderer = WaterfallRenderer;
