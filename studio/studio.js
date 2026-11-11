(() => {
  const $ = (id) => document.getElementById(id);
  const year = $('year');
  if (year) year.textContent = String(new Date().getFullYear());

  const PRESETS = {
    radio: {
      label: 'Radio Voice',
      note: 'Radio Voice: a high-pass at 80 Hz, warmth and presence EQ, compression, a limiter and a little reverb.',
      highpass: 80,
      warmthFreq: 220,
      warmthGain: 3.5,
      presenceFreq: 3200,
      presenceGain: 4,
      presenceQ: 0.85,
      airFreq: 8000,
      airGain: 1.5,
      compThreshold: -24,
      compKnee: 10,
      compRatio: 4,
      compAttack: 0.012,
      compRelease: 0.18,
      reverb: 0.12
    },
    warm: {
      label: 'Warm',
      note: 'Warm: a gentle high-pass, fuller low mids, softer presence and a little more room reverb.',
      highpass: 70,
      warmthFreq: 180,
      warmthGain: 5,
      presenceFreq: 2500,
      presenceGain: 1.8,
      presenceQ: 0.7,
      airFreq: 7000,
      airGain: 0.5,
      compThreshold: -22,
      compKnee: 14,
      compRatio: 3,
      compAttack: 0.02,
      compRelease: 0.22,
      reverb: 0.18
    },
    clear: {
      label: 'Clear Interview',
      note: 'Clear Interview: a higher high-pass, tighter low end, brighter presence and very little reverb.',
      highpass: 100,
      warmthFreq: 250,
      warmthGain: 0.5,
      presenceFreq: 4000,
      presenceGain: 5,
      presenceQ: 1,
      airFreq: 9000,
      airGain: 2.2,
      compThreshold: -20,
      compKnee: 6,
      compRatio: 5,
      compAttack: 0.008,
      compRelease: 0.12,
      reverb: 0.04
    }
  };

  const PRESET_NOTES = {
    radio: PRESETS.radio.note,
    warm: PRESETS.warm.note,
    clear: PRESETS.clear.note
  };

  const statusEl = $('studio-status');
  const meterFill = $('meter-fill');
  const meterPeak = $('meter-peak');
  const meterEl = $('meter');
  const meterReadout = $('meter-readout');
  const onAirNote = $('on-air-note');
  const onAirLabel = $('on-air-label');
  const micBtn = $('mic-btn');
  const recordBtn = $('record-btn');
  const stopBtn = $('stop-btn');
  const consent = $('consent');
  const monitorToggle = $('monitor-toggle');
  const monitorWarning = $('monitor-warning');
  const recordTimer = $('record-timer');
  const takeList = $('take-list');
  const takeEmpty = $('take-empty');
  const bedBtn = $('bed-btn');
  const bedVolume = $('bed-volume');
  const duckToggle = $('duck-toggle');

  let audioCtx = null;
  let micStream = null;
  let nodes = null;
  let pads = null;
  let recorder = null;
  let chunks = [];
  let objectUrls = [];
  let raf = 0;
  let recordStarted = 0;
  let recordTick = 0;
  let peakHold = 0;
  let peakAt = 0;
  let currentPreset = 'radio';
  let bedSource = null;
  let bedPlaying = false;
  let duckGainValue = 1;
  let wakeLock = null;
  let chainRunning = false;

  const AudioCtx = window.AudioContext || window.webkitAudioContext;

  function setStatus(message, state) {
    statusEl.textContent = message;
    if (state) statusEl.dataset.state = state;
  }

  function formatTime(ms) {
    const total = Math.max(0, Math.floor(ms / 1000));
    const m = String(Math.floor(total / 60)).padStart(2, '0');
    const s = String(total % 60).padStart(2, '0');
    return m + ':' + s;
  }

  async function ensureRunning() {
    if (!audioCtx) return;
    if (audioCtx.state === 'suspended' || audioCtx.state === 'interrupted') {
      await audioCtx.resume();
    }
  }

  function makeImpulse(ctx, seconds, decay) {
    const length = Math.floor(ctx.sampleRate * seconds);
    const impulse = ctx.createBuffer(2, length, ctx.sampleRate);
    for (let channel = 0; channel < 2; channel += 1) {
      const data = impulse.getChannelData(channel);
      for (let i = 0; i < length; i += 1) {
        data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, decay);
      }
    }
    return impulse;
  }

  function renderTone(ctx, opts) {
    const sampleRate = ctx.sampleRate;
    const length = Math.floor(sampleRate * opts.duration);
    const buffer = ctx.createBuffer(2, length, sampleRate);
    const left = buffer.getChannelData(0);
    const right = buffer.getChannelData(1);
    const partials = opts.partials || [1, 0.35, 0.14];
    opts.notes.forEach((note) => {
      const freq = note.freq;
      const start = Math.floor(note.start * sampleRate);
      const end = Math.min(length, Math.floor((note.start + note.dur) * sampleRate));
      const gain = note.gain == null ? 0.22 : note.gain;
      for (let i = start; i < end; i += 1) {
        const t = (i - start) / sampleRate;
        const dur = note.dur;
        const attack = Math.min(0.02, dur * 0.2);
        const release = Math.min(0.18, dur * 0.45);
        let env = 1;
        if (t < attack) env = t / attack;
        else if (t > dur - release) env = Math.max(0, (dur - t) / release);
        let sample = 0;
        for (let p = 0; p < partials.length; p += 1) {
          sample += Math.sin(2 * Math.PI * freq * (p + 1) * t) * partials[p];
        }
        const pan = note.pan || 0;
        const value = sample * env * gain;
        left[i] += value * (1 - pan) * 0.85;
        right[i] += value * (1 + pan) * 0.85;
      }
    });
    if (opts.noise) {
      const start = Math.floor((opts.noise.start || 0) * sampleRate);
      const end = Math.min(length, Math.floor(((opts.noise.start || 0) + opts.noise.dur) * sampleRate));
      for (let i = start; i < end; i += 1) {
        const t = (i - start) / sampleRate;
        const dur = opts.noise.dur;
        const env = Math.sin(Math.PI * Math.min(1, t / dur)) * (opts.noise.gain || 0.08);
        const n = (Math.random() * 2 - 1) * env;
        left[i] += n;
        right[i] += n * 0.9;
      }
    }
    return buffer;
  }

  function renderApplause(ctx) {
    const sampleRate = ctx.sampleRate;
    const duration = 3.2;
    const length = Math.floor(sampleRate * duration);
    const buffer = ctx.createBuffer(2, length, sampleRate);
    const left = buffer.getChannelData(0);
    const right = buffer.getChannelData(1);
    let prev = 0;
    for (let i = 0; i < length; i += 1) {
      const t = i / sampleRate;
      const bedEnv = Math.min(1, t / 0.15) * Math.min(1, (duration - t) / 0.55);
      const white = Math.random() * 2 - 1;
      const band = white - prev;
      prev = white * 0.6;
      const flutter = 0.7 + 0.3 * Math.sin(t * 28 + Math.sin(t * 7));
      const value = band * bedEnv * flutter * 0.18;
      left[i] += value;
      right[i] += value * 0.92;
    }
    for (let g = 0; g < 240; g += 1) {
      const startT = Math.random() * 2.6;
      const grainDur = 0.015 + Math.random() * 0.05;
      const start = Math.floor(startT * sampleRate);
      const end = Math.min(length, Math.floor((startT + grainDur) * sampleRate));
      const pan = Math.random() * 2 - 1;
      const gGain = 0.04 + Math.random() * 0.08;
      for (let i = start; i < end; i += 1) {
        const t = (i - start) / sampleRate;
        const env = Math.sin(Math.PI * (t / grainDur));
        const n = (Math.random() * 2 - 1) * env * gGain;
        left[i] += n * (1 - pan * 0.5);
        right[i] += n * (1 + pan * 0.5);
      }
    }
    return buffer;
  }

  function renderMusicBed(ctx) {
    const sampleRate = ctx.sampleRate;
    const duration = 12;
    const length = Math.floor(sampleRate * duration);
    const buffer = ctx.createBuffer(2, length, sampleRate);
    const left = buffer.getChannelData(0);
    const right = buffer.getChannelData(1);
    const chords = [
      [196.0, 246.94, 293.66, 392.0],
      [174.61, 220.0, 261.63, 349.23],
      [130.81, 196.0, 261.63, 329.63],
      [146.83, 196.0, 246.94, 293.66]
    ];
    const slice = duration / chords.length;
    chords.forEach((chord, index) => {
      const start = Math.floor(index * slice * sampleRate);
      const end = index === chords.length - 1 ? length : Math.floor((index + 1) * slice * sampleRate);
      for (let i = start; i < end; i += 1) {
        const t = i / sampleRate;
        const local = (i - start) / sampleRate;
        const fade = Math.min(1, local / 0.4) * Math.min(1, (slice - local) / 0.4);
        const trem = 0.85 + 0.15 * Math.sin(2 * Math.PI * 0.22 * t);
        let l = 0;
        let r = 0;
        chord.forEach((freq, n) => {
          const pan = n % 2 === 0 ? -0.25 : 0.25;
          const amp = 0.045 / (n + 1);
          const s = Math.sin(2 * Math.PI * freq * t) + 0.2 * Math.sin(2 * Math.PI * freq * 2 * t);
          l += s * amp * (1 - pan);
          r += s * amp * (1 + pan);
        });
        left[i] += l * fade * trem;
        right[i] += r * fade * trem;
      }
    });
    return buffer;
  }

  function buildPads(ctx) {
    const note = (freq, start, dur, gain, pan) => ({ freq, start, dur, gain, pan });
    return {
      id: renderTone(ctx, {
        duration: 2.1,
        notes: [
          note(196.0, 0.02, 0.7, 0.2, -0.2),
          note(261.63, 0.18, 0.55, 0.2, 0),
          note(329.63, 0.4, 0.55, 0.18, 0.15),
          note(523.25, 0.62, 1.1, 0.16, 0.05),
          note(392.0, 0.62, 1.1, 0.12, -0.15)
        ],
        noise: { start: 0, dur: 0.18, gain: 0.05 },
        partials: [1, 0.4, 0.16, 0.08]
      }),
      intro: renderTone(ctx, {
        duration: 2.6,
        notes: [
          note(261.63, 0.05, 0.7, 0.16, -0.2),
          note(329.63, 0.28, 0.7, 0.16, 0),
          note(392.0, 0.52, 0.8, 0.17, 0.15),
          note(523.25, 0.9, 1.4, 0.2, 0),
          note(659.25, 1.15, 1.2, 0.1, 0.2)
        ],
        partials: [1, 0.3, 0.12]
      }),
      sting: renderTone(ctx, {
        duration: 1.15,
        notes: [
          note(392.0, 0.0, 0.28, 0.24, -0.1),
          note(523.25, 0.16, 0.3, 0.22, 0.1),
          note(783.99, 0.32, 0.7, 0.2, 0)
        ],
        noise: { start: 0, dur: 0.08, gain: 0.06 },
        partials: [1, 0.5, 0.2, 0.08]
      }),
      outro: renderTone(ctx, {
        duration: 3.1,
        notes: [
          note(523.25, 0.05, 0.7, 0.16, 0.15),
          note(392.0, 0.4, 0.75, 0.16, 0),
          note(329.63, 0.85, 0.9, 0.16, -0.1),
          note(261.63, 1.35, 1.5, 0.18, 0),
          note(130.81, 1.35, 1.6, 0.12, -0.2)
        ],
        partials: [1, 0.28, 0.1]
      }),
      applause: renderApplause(ctx),
      bed: renderMusicBed(ctx)
    };
  }

  function applyPreset(name, instant) {
    const preset = PRESETS[name] || PRESETS.radio;
    currentPreset = name;
    $('preset-note').textContent = PRESET_NOTES[name] || preset.note;
    document.querySelectorAll('.preset-btn').forEach((btn) => {
      const on = btn.dataset.preset === name;
      btn.classList.toggle('active', on);
      btn.setAttribute('aria-pressed', String(on));
    });
    if (!nodes) return;
    const time = audioCtx.currentTime;
    const set = (param, value) => {
      param.cancelScheduledValues(time);
      if (instant) param.setValueAtTime(value, time);
      else param.linearRampToValueAtTime(value, time + 0.05);
    };
    set(nodes.highpass.frequency, preset.highpass);
    set(nodes.warmth.frequency, preset.warmthFreq);
    set(nodes.warmth.gain, preset.warmthGain);
    set(nodes.presence.frequency, preset.presenceFreq);
    set(nodes.presence.gain, preset.presenceGain);
    set(nodes.presence.Q, preset.presenceQ);
    set(nodes.air.frequency, preset.airFreq);
    set(nodes.air.gain, preset.airGain);
    set(nodes.comp.threshold, preset.compThreshold);
    set(nodes.comp.knee, preset.compKnee);
    set(nodes.comp.ratio, preset.compRatio);
    set(nodes.comp.attack, preset.compAttack);
    set(nodes.comp.release, preset.compRelease);
    set(nodes.wet.gain, preset.reverb);
    set(nodes.dry.gain, 1 - preset.reverb * 0.4);
  }

  function connectChain(stream) {
    const ctx = audioCtx;
    const source = ctx.createMediaStreamSource(stream);
    const highpass = ctx.createBiquadFilter();
    highpass.type = 'highpass';
    highpass.Q.value = 0.7;
    const warmth = ctx.createBiquadFilter();
    warmth.type = 'lowshelf';
    const presence = ctx.createBiquadFilter();
    presence.type = 'peaking';
    const air = ctx.createBiquadFilter();
    air.type = 'highshelf';
    const comp = ctx.createDynamicsCompressor();
    const dry = ctx.createGain();
    const wet = ctx.createGain();
    const convolver = ctx.createConvolver();
    convolver.buffer = makeImpulse(ctx, 1.4, 3.2);
    const voiceGain = ctx.createGain();
    voiceGain.gain.value = 1;
    const padGain = ctx.createGain();
    padGain.gain.value = 0.9;
    const musicGain = ctx.createGain();
    musicGain.gain.value = Number(bedVolume.value) / 100;
    const master = ctx.createGain();
    master.gain.value = 0.95;
    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -2.5;
    limiter.knee.value = 0.2;
    limiter.ratio.value = 20;
    limiter.attack.value = 0.003;
    limiter.release.value = 0.05;
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 2048;
    analyser.smoothingTimeConstant = 0.4;
    const monitor = ctx.createGain();
    monitor.gain.value = 0;
    const destination = ctx.createMediaStreamDestination();
    const duckAnalyser = ctx.createAnalyser();
    duckAnalyser.fftSize = 1024;

    source.connect(highpass);
    highpass.connect(warmth);
    warmth.connect(presence);
    presence.connect(air);
    air.connect(comp);
    comp.connect(dry);
    comp.connect(convolver);
    convolver.connect(wet);
    dry.connect(voiceGain);
    wet.connect(voiceGain);
    voiceGain.connect(master);
    voiceGain.connect(duckAnalyser);
    padGain.connect(master);
    musicGain.connect(master);
    master.connect(limiter);
    limiter.connect(analyser);
    analyser.connect(monitor);
    monitor.connect(ctx.destination);
    analyser.connect(destination);

    nodes = {
      source, highpass, warmth, presence, air, comp, dry, wet, convolver,
      voiceGain, padGain, musicGain, master, limiter, analyser, monitor,
      destination, duckAnalyser
    };
    applyPreset(currentPreset, true);
    setMonitor(monitorToggle.checked);
  }

  function setMonitor(on) {
    monitorWarning.hidden = !on;
    if (!nodes) return;
    nodes.monitor.gain.setTargetAtTime(on ? 0.85 : 0, audioCtx.currentTime, 0.03);
  }

  function stopBed() {
    if (bedSource) {
      try { bedSource.stop(); } catch (e) { /* already stopped */ }
      try { bedSource.disconnect(); } catch (e) { /* already disconnected */ }
      bedSource = null;
    }
    bedPlaying = false;
    bedBtn.textContent = 'Start music bed';
  }

  function startBed() {
    if (!audioCtx || !nodes || !pads) return;
    stopBed();
    const source = audioCtx.createBufferSource();
    source.buffer = pads.bed;
    source.loop = true;
    source.connect(nodes.musicGain);
    source.start();
    bedSource = source;
    bedPlaying = true;
    bedBtn.textContent = 'Stop music bed';
    source.onended = () => {
      if (bedSource === source) {
        bedSource = null;
        bedPlaying = false;
        bedBtn.textContent = 'Start music bed';
      }
    };
  }

  function playPad(name) {
    if (!audioCtx || !nodes || !pads || !pads[name]) return;
    ensureRunning();
    const source = audioCtx.createBufferSource();
    source.buffer = pads[name];
    const gain = audioCtx.createGain();
    gain.gain.value = name === 'applause' ? 0.9 : 0.85;
    source.connect(gain);
    gain.connect(nodes.padGain);
    source.start();
    const btn = document.querySelector('.pad-btn[data-pad="' + name + '"]');
    if (btn) {
      btn.classList.add('is-playing');
      setTimeout(() => btn.classList.remove('is-playing'), Math.min(1200, source.buffer.duration * 1000));
    }
  }

  function updateMeter() {
    if (!nodes) return;
    const analyser = nodes.analyser;
    const values = new Uint8Array(analyser.fftSize);
    analyser.getByteTimeDomainData(values);
    let sum = 0;
    let peak = 0;
    for (let i = 0; i < values.length; i += 1) {
      const v = (values[i] - 128) / 128;
      sum += v * v;
      const a = Math.abs(v);
      if (a > peak) peak = a;
    }
    const rms = Math.sqrt(sum / values.length);
    const level = Math.min(100, rms * 220);
    const peakLevel = Math.min(100, peak * 100);
    meterFill.style.width = level + '%';
    if (peakLevel > peakHold || performance.now() - peakAt > 800) {
      peakHold = peakLevel;
      peakAt = performance.now();
    }
    meterPeak.style.left = peakHold + '%';
    meterPeak.style.opacity = peakHold > 1 ? '1' : '0';
    meterEl.setAttribute('aria-valuenow', String(Math.round(level)));
    meterReadout.textContent = Math.round(level) + '%';

    if (bedPlaying && nodes && duckToggle.checked) {
      const duckData = new Uint8Array(nodes.duckAnalyser.fftSize);
      nodes.duckAnalyser.getByteTimeDomainData(duckData);
      let dSum = 0;
      for (let i = 0; i < duckData.length; i += 1) {
        const v = (duckData[i] - 128) / 128;
        dSum += v * v;
      }
      const voice = Math.sqrt(dSum / duckData.length);
      const speaking = voice > 0.045;
      const target = speaking ? 0.22 : 1;
      duckGainValue += (target - duckGainValue) * (speaking ? 0.25 : 0.06);
      const userVol = Number(bedVolume.value) / 100;
      nodes.musicGain.gain.setTargetAtTime(userVol * duckGainValue, audioCtx.currentTime, 0.05);
    }

    raf = requestAnimationFrame(updateMeter);
  }

  function setControlsOpen(open) {
    recordBtn.disabled = !open;
    document.querySelectorAll('.pad-btn, #bed-btn, #bed-volume, #duck-toggle').forEach((el) => {
      el.disabled = !open;
    });
    micBtn.textContent = open ? 'Microphone is on' : 'Open microphone';
  }

  async function requestWakeLock() {
    try {
      if (navigator.wakeLock && document.visibilityState === 'visible') {
        wakeLock = await navigator.wakeLock.request('screen');
        wakeLock.addEventListener('release', () => { wakeLock = null; });
      }
    } catch (e) {
      wakeLock = null;
    }
  }

  function releaseWakeLock() {
    if (wakeLock) {
      wakeLock.release().catch(() => {});
      wakeLock = null;
    }
  }

  async function openMic() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      throw new Error('This browser cannot open the microphone. Try current Safari or Chrome over HTTPS.');
    }
    if (!AudioCtx) {
      throw new Error('Web Audio is not available in this browser.');
    }
    if (micStream) {
      await ensureRunning();
      setStatus('Voice chain is running. Speak to see the meter move, then record when you are ready.', 'ready');
      return;
    }
    audioCtx = new AudioCtx();
    await ensureRunning();
    micStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true
      },
      video: false
    });
    pads = buildPads(audioCtx);
    connectChain(micStream);
    chainRunning = true;
    setControlsOpen(true);
    cancelAnimationFrame(raf);
    updateMeter();
    setStatus('Voice chain is running. Speak to see the meter move, then record when you are ready.', 'ready');
  }

  function pickMimeType() {
    if (typeof MediaRecorder === 'undefined') return '';
    const types = [
      'audio/mp4',
      'audio/mp4;codecs=mp4a.40.2',
      'audio/webm;codecs=opus',
      'audio/webm',
      'audio/ogg;codecs=opus'
    ];
    return types.find((type) => {
      try { return MediaRecorder.isTypeSupported(type); } catch (e) { return false; }
    }) || '';
  }

  function extensionFor(type) {
    if (type.includes('mp4') || type.includes('mpeg') || type.includes('m4a') || type.includes('aac')) return '.m4a';
    if (type.includes('ogg')) return '.ogg';
    return '.webm';
  }

  function stampName(ext) {
    const d = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    return 'mrs-fam-studio-' + d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate()) + '-' + pad(d.getHours()) + pad(d.getMinutes()) + pad(d.getSeconds()) + ext;
  }

  function setRecordingUi(on) {
    document.body.classList.toggle('is-recording', on);
    onAirLabel.textContent = on ? 'ON AIR' : 'STANDBY';
    onAirNote.textContent = on
      ? 'ON AIR. Recording the processed mix on this device.'
      : 'The ON AIR light turns on when you are recording.';
    recordBtn.disabled = on || !chainRunning;
    stopBtn.disabled = !on;
    recordTimer.hidden = !on;
    if (!on) recordTimer.textContent = '00:00';
  }

  function addTake(blob, type) {
    const ext = extensionFor(type || blob.type || '');
    const url = URL.createObjectURL(blob);
    objectUrls.push(url);
    const item = document.createElement('div');
    item.className = 'take-item';
    const audio = document.createElement('audio');
    audio.controls = true;
    audio.src = url;
    audio.preload = 'metadata';
    const link = document.createElement('a');
    link.href = url;
    link.download = stampName(ext);
    const mb = blob.size / (1024 * 1024);
    const sizeLabel = mb >= 0.1 ? mb.toFixed(1) + ' MB' : Math.max(1, Math.round(blob.size / 1024)) + ' KB';
    link.textContent = 'Download recording (' + sizeLabel + ')';
    item.append(audio, link);
    takeList.prepend(item);
    takeEmpty.hidden = true;
  }

  async function startRecording() {
    if (!consent.checked) {
      setStatus('Please confirm recording permission first.', 'error');
      return;
    }
    if (!chainRunning || !nodes) {
      setStatus('Open the microphone before recording.', 'error');
      return;
    }
    if (typeof MediaRecorder === 'undefined') {
      setStatus('This browser cannot record audio. Try current Safari or Chrome.', 'error');
      return;
    }
    await ensureRunning();
    chunks = [];
    const mimeType = pickMimeType();
    const options = mimeType ? { mimeType } : undefined;
    recorder = new MediaRecorder(nodes.destination.stream, options);
    recorder.ondataavailable = (event) => {
      if (event.data && event.data.size) chunks.push(event.data);
    };
    recorder.onerror = () => {
      setStatus('Recording encountered an error. Stop and download any captured audio.', 'error');
    };
    recorder.onstop = () => {
      clearInterval(recordTick);
      const type = recorder.mimeType || mimeType || 'audio/webm';
      const blob = new Blob(chunks, { type });
      setRecordingUi(false);
      releaseWakeLock();
      if (!blob.size) {
        setStatus('The recording was empty. Check the microphone and try again.', 'error');
        return;
      }
      addTake(blob, type);
      setStatus('Recording complete. Download your file before closing this page.', 'ready');
    };
    recorder.start(1000);
    recordStarted = Date.now();
    setRecordingUi(true);
    requestWakeLock();
    const tick = () => {
      recordTimer.textContent = formatTime(Date.now() - recordStarted);
      setStatus('ON AIR · recording ' + recordTimer.textContent + ' · processed mix, this device only.', 'recording');
    };
    tick();
    recordTick = setInterval(tick, 250);
  }

  function stopRecording() {
    if (recorder && recorder.state === 'recording') {
      recorder.stop();
      stopBtn.disabled = true;
    }
  }

  micBtn.addEventListener('click', async () => {
    try {
      micBtn.disabled = true;
      await openMic();
    } catch (error) {
      chainRunning = false;
      setControlsOpen(false);
      const message = error && error.message ? error.message : 'Could not open the microphone.';
      if (error && (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError')) {
        setStatus('Microphone access was blocked. Allow the microphone in your browser settings, then try again.', 'error');
      } else if (error && error.name === 'NotFoundError') {
        setStatus('No microphone was found on this device.', 'error');
      } else {
        setStatus(message, 'error');
      }
    } finally {
      micBtn.disabled = false;
    }
  });

  recordBtn.addEventListener('click', () => {
    startRecording().catch((error) => {
      setRecordingUi(false);
      setStatus('Could not record: ' + (error && error.message ? error.message : 'unknown error'), 'error');
    });
  });
  stopBtn.addEventListener('click', stopRecording);

  document.querySelectorAll('.preset-btn').forEach((btn) => {
    btn.addEventListener('click', () => applyPreset(btn.dataset.preset, false));
  });

  document.querySelectorAll('.pad-btn').forEach((btn) => {
    btn.addEventListener('click', () => playPad(btn.dataset.pad));
  });

  monitorToggle.addEventListener('change', () => setMonitor(monitorToggle.checked));

  bedBtn.addEventListener('click', async () => {
    await ensureRunning();
    if (bedPlaying) stopBed();
    else startBed();
  });

  bedVolume.addEventListener('input', () => {
    if (!nodes) return;
    const userVol = Number(bedVolume.value) / 100;
    const factor = duckToggle.checked ? duckGainValue : 1;
    nodes.musicGain.gain.setTargetAtTime(userVol * factor, audioCtx.currentTime, 0.03);
  });

  window.addEventListener('beforeunload', (event) => {
    if (recorder && recorder.state === 'recording') {
      event.preventDefault();
      event.returnValue = '';
    }
  });

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      ensureRunning();
      if (recorder && recorder.state === 'recording') requestWakeLock();
    }
  });

  window.MrsFamStudio = {
    isReady: () => chainRunning,
    startMic: () => openMic(),
    startRecording,
    stopRecording,
    playPad,
    getMeter: () => Number(meterEl.getAttribute('aria-valuenow') || 0),
    takeCount: () => takeList.children.length
  };
})();
