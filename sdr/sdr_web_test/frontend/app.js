(() => {
  const api = '/sdr/api';
  const $ = id => document.getElementById(id);
  const waterfall = new window.WaterfallRenderer('waterfall-canvas', 'spectrum-line-canvas');
  const clockFormat = new Intl.DateTimeFormat('ru-RU', { timeZone: 'Europe/Moscow', hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const timeFormat = new Intl.DateTimeFormat('ru-RU', { timeZone: 'Europe/Moscow', hour: '2-digit', minute: '2-digit' });
  const dateFormat = new Intl.DateTimeFormat('ru-RU', { timeZone: 'Europe/Moscow', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
  let stream = null;
  let manual = null;
  let recordingId = sessionStorage.getItem('polyspace-sdr-recording');
  let nextPass = null;
  let reconnectDelay = 1000;
  let pollBusy = false;
  let recordBusy = false;

  const text = (id, value) => { $(id).textContent = value; };
  const timeOf = date => timeFormat.format(new Date(date));
  const sizeOf = bytes => bytes >= 1e9 ? (bytes / 1e9).toFixed(2) + ' ГБ' : bytes >= 1e6 ? (bytes / 1e6).toFixed(1) + ' МБ' : (bytes / 1e3).toFixed(0) + ' КБ';
  const element = (tag, className, value) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (value != null) node.textContent = value;
    return node;
  };

  async function request(path, options = {}) {
    const response = await fetch(api + path, { cache: 'no-store', ...options });
    if (!response.ok) {
      let detail = 'Ошибка ' + response.status;
      try { detail = (await response.json()).detail || detail; } catch (_) {}
      throw new Error(detail);
    }
    return response.json();
  }

  function renderStream() {
    if (!stream) return;
    const live = !!stream.streaming;
    document.querySelector('.orbit-state').dataset.state = live ? 'live' : 'waiting';
    text('stream-title', live ? 'Пролёт' : 'Ожидание пролёта');
    if (live) {
      text('stream-detail', stream.satellite_name ? 'Принимаем сигнал · ' + stream.satellite_name : 'Идёт приём спутникового сигнала.');
    } else if (nextPass) {
      text('stream-detail', 'Следующее окно связи · ' + nextPass.satellite_name + ', ' + dateFormat.format(new Date(nextPass.aos_time)) + ' МСК');
    } else {
      text('stream-detail', 'Следующее окно связи появится в расписании.');
    }
    renderRecording();
  }

  function renderRecording() {
    const manualActive = !!manual?.is_recording;
    text('manual-record-detail', manualActive
      ? 'Идёт запись · ' + sizeOf(manual.file_size_bytes || 0)
      : manual?.download_url ? 'Запись завершена. Подготовлен файл для скачивания.'
      : 'После остановки IQ-файл скачается на ваш компьютер.');
    const button = $('record-button');
    button.disabled = recordBusy || (!!recordingId && !manual);
    button.classList.toggle('stop', manualActive);
    text('record-button-icon', manualActive ? '■' : '●');
    text('record-button-label', manualActive ? 'Остановить и скачать' : manual?.download_url ? 'Скачать IQ' : 'Начать запись');
  }

  async function pollStatus() {
    if (pollBusy) return;
    pollBusy = true;
    try {
      const results = await Promise.allSettled([
        request('/stream/status'), recordingId ? request('/record/state/' + encodeURIComponent(recordingId)) : Promise.resolve(null)
      ]);
      if (results[0].status === 'fulfilled') stream = results[0].value;
      if (results[1].status === 'fulfilled') manual = results[1].value;
      if (results[1].status === 'rejected') {
        manual = null;
        recordingId = null;
        sessionStorage.removeItem('polyspace-sdr-recording');
      }
      $('connection-alert').hidden = results[0].status === 'fulfilled';
      if (stream) renderStream();
    } finally {
      pollBusy = false;
    }
  }

  function renderNextPass(pass, active) {
    const container = $('next-pass');
    container.replaceChildren();
    if (!pass) {
      container.append(element('p', 'empty-state', 'Расписание пролётов пока не загружено.'));
      return;
    }
    const head = element('div', 'next-pass-name', pass.satellite_name);
    const tag = element('span', 'pass-badge' + (active ? '' : ' upcoming'), active ? 'СЕЙЧАС' : 'СЛЕДУЮЩИЙ');
    const time = element('div', 'next-pass-time', timeOf(pass.aos_time) + ' — ' + timeOf(pass.los_time) + ' МСК');
    const meta = element('div', 'next-pass-meta');
    meta.append(element('span', '', dateFormat.format(new Date(pass.aos_time)).split(',')[0]));
    if (Number.isFinite(pass.max_elevation)) meta.append(element('span', '', 'Высота до ' + Math.round(pass.max_elevation) + '°'));
    if (pass.frequency) meta.append(element('span', '', (pass.frequency / 1e6).toFixed(3) + ' МГц'));
    container.append(head, tag, time, meta);
  }

  function renderPasses(passes) {
    const now = Date.now();
    const upcoming = passes
      .filter(pass => new Date(pass.los_time).getTime() > now)
      .sort((a, b) => new Date(a.aos_time) - new Date(b.aos_time));
    nextPass = upcoming.find(pass => new Date(pass.aos_time).getTime() <= now) || upcoming[0] || null;
    const active = !!nextPass && new Date(nextPass.aos_time).getTime() <= now;
    renderNextPass(nextPass, active);
    text('pass-count', String(upcoming.length));
    const list = $('pass-list');
    list.replaceChildren();
    if (!upcoming.length) {
      list.append(element('p', 'empty-state', 'Пока нет запланированных пролётов.'));
    }
    for (const pass of upcoming.slice(0, 6)) {
      const current = new Date(pass.aos_time).getTime() <= now;
      const row = element('div', 'pass-row');
      const main = element('div', 'pass-main');
      main.append(element('span', 'pass-title', pass.satellite_name));
      main.append(element('span', 'pass-meta', dateFormat.format(new Date(pass.aos_time)) + ' — ' + timeOf(pass.los_time) + ' МСК' + (Number.isFinite(pass.max_elevation) ? ' · ' + Math.round(pass.max_elevation) + '°' : '')));
      row.append(main, element('span', 'pass-badge' + (current ? '' : ' upcoming'), current ? 'СЕЙЧАС' : 'СКОРО'));
      list.append(row);
    }
    if (stream) renderStream();
  }

  async function refreshPasses() {
    try { renderPasses(await request('/passes')); }
    catch (_) {
      $('pass-list').replaceChildren(element('p', 'empty-state', 'Расписание временно недоступно.'));
      $('next-pass').replaceChildren(element('p', 'empty-state', 'Расписание временно недоступно.'));
    }
  }

  function renderArchive(recordings) {
    const list = $('archive-list');
    list.replaceChildren();
    text('archive-count', String(recordings.length));
    if (!recordings.length) {
      list.append(element('p', 'empty-state', 'Записи появятся после первого принятого пролёта.'));
      return;
    }
    for (const recording of recordings.slice().reverse().slice(0, 8)) {
      const row = element('div', 'pass-row');
      const main = element('div', 'pass-main');
      main.append(element('span', 'pass-title', 'Пролёт · ' + dateFormat.format(new Date(recording.start_time)) + ' МСК'));
      const details = [sizeOf(recording.file_size_bytes), Math.round(recording.duration_seconds) + ' с'];
      if (recording.center_frequency) details.push((recording.center_frequency / 1e6).toFixed(3) + ' МГц');
      main.append(element('span', 'pass-meta', details.join(' · ')));
      const download = element('a', 'archive-download', 'Скачать IQ ↓');
      download.href = '/sdr/api/recordings/' + encodeURIComponent(recording.filename);
      download.download = recording.filename;
      row.append(main, download);
      list.append(row);
    }
  }

  async function refreshArchive() {
    try { renderArchive((await request('/recordings')).recordings); }
    catch (_) {
      $('archive-list').replaceChildren(element('p', 'empty-state', 'Архив временно недоступен.'));
    }
  }

  function connectSpectrum() {
    const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
    const socket = new WebSocket(protocol + '//' + location.host + '/sdr/ws/sdr');
    socket.onopen = () => {
      reconnectDelay = 1000;
      $('connection-alert').hidden = true;
    };
    socket.onmessage = event => {
      let message;
      try { message = JSON.parse(event.data); } catch (_) { return; }
      if (message.type === 'fft_frame') {
        waterfall.addFFTFrame(message.fft_data, message.center_frequency, message.sample_rate);
        text('center-frequency', (message.center_frequency / 1e6).toFixed(3) + ' МГц');
        text('sample-rate', (message.sample_rate / 1e3).toFixed(0) + ' кГц');
      }
    };
    socket.onclose = () => {
      $('connection-alert').hidden = false;
      window.setTimeout(connectSpectrum, reconnectDelay);
      reconnectDelay = Math.min(reconnectDelay * 1.6, 10000);
    };
    socket.onerror = () => socket.close();
  }

  function downloadRecording(url) {
    const link = document.createElement('a');
    link.href = url;
    link.download = '';
    document.body.append(link);
    link.click();
    link.remove();
    recordingId = null;
    manual = null;
    sessionStorage.removeItem('polyspace-sdr-recording');
  }

  $('record-button').addEventListener('click', async () => {
    if (recordBusy) return;
    recordBusy = true;
    $('record-error').hidden = true;
    renderRecording();
    try {
      if (manual?.download_url) {
        downloadRecording(manual.download_url);
      } else if (manual?.is_recording) {
        manual = await request('/record/stop', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ recording_id: recordingId })
        });
        downloadRecording(manual.download_url);
      } else {
        manual = await request('/record/start', { method: 'POST' });
        recordingId = manual.recording_id;
        sessionStorage.setItem('polyspace-sdr-recording', recordingId);
      }
    } catch (error) {
      text('record-error', error.message);
      $('record-error').hidden = false;
    } finally {
      recordBusy = false;
      renderRecording();
    }
  });
  $('intensity').addEventListener('input', event => waterfall.setIntensity(Number(event.target.value) / 100));
  $('contrast').addEventListener('input', event => waterfall.setContrast(Number(event.target.value) / 100));

  const updateClock = () => text('local-clock', clockFormat.format(Date.now()) + ' МСК');
  updateClock();
  window.setInterval(updateClock, 1000);
  connectSpectrum();
  pollStatus();
  refreshPasses();
  refreshArchive();
  window.setInterval(pollStatus, 2000);
  window.setInterval(refreshPasses, 60000);
  window.setInterval(refreshArchive, 30000);
})();
