(function (root, factory) {
  'use strict';
  var api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.MeadowAudio = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  'use strict';

  var LIMIT = 18;
  var RATE = { armorbreak:.15,gust:.3,blizzard:.5,royalcall:.5,icefire:.2, hit: 0.075, kill: 0.065, burst: 0.14, dash: 0.15, reward: 0.08,
    chest: 0.3, fusion: 0.5, level: 0.4, wave: 0.4, boss: 0.5, victory: 1, defeat: 1 };
  // Each short phrase is synthesized here; no recordings or downloaded music are used.
  var PHRASES = {
    armorbreak:[{noise:true,duration:.2,gain:.35,filter:3500},{frequency:650,end:180,duration:.18,gain:.15,type:'triangle'}],
    gust:[{noise:true,duration:.6,gain:.32,filter:1200,filterType:'bandpass'}],
    blizzard:[{noise:true,duration:.7,gain:.3,filter:4200},{frequency:900,end:300,duration:.5,gain:.12,type:'triangle'}],
    royalcall:[{frequency:440,duration:.25,gain:.2},{frequency:660,delay:.1,duration:.3,gain:.2},{noise:true,duration:.3,gain:.08,filter:1800}],
    icefire:[{noise:true,duration:.12,gain:.2,filter:4700},{frequency:1300,end:500,duration:.15,gain:.15,type:'triangle'}],
    hit: [{ noise: true, duration: 0.055, gain: 0.2, filter: 2100 }, { frequency: 180, end: 85, duration: 0.07, gain: 0.12 }],
    kill: [{ noise: true, duration: 0.095, gain: 0.27, filter: 1150 }, { frequency: 310, end: 95, duration: 0.09, gain: 0.12, type: 'triangle' }],
    burst: [{ noise: true, duration: 0.22, gain: 0.38, filter: 900 }, { frequency: 105, end: 38, duration: 0.24, gain: 0.27 }],
    dash: [{ noise: true, duration: 0.14, gain: 0.19, filter: 2800, filterType: 'bandpass' }, { frequency: 320, end: 920, duration: 0.12, gain: 0.1 }],
    chest: [{ frequency: 440, duration: 0.16, gain: 0.2, type: 'triangle' }, { frequency: 554.37, delay: 0.09, duration: 0.18, gain: 0.19 }, { frequency: 659.25, delay: 0.18, duration: 0.3, gain: 0.2 }],
    reward: [{ frequency: 659.25, duration: 0.1, gain: 0.17 }, { frequency: 880, delay: 0.07, duration: 0.2, gain: 0.18 }],
    fusion: [{ frequency: 220, duration: 0.6, gain: 0.16 }, { frequency: 440, delay: 0.05, duration: 0.25, gain: 0.2 }, { frequency: 554.37, delay: 0.16, duration: 0.3, gain: 0.2 }, { frequency: 659.25, delay: 0.27, duration: 0.4, gain: 0.2 }, { frequency: 880, delay: 0.39, duration: 0.55, gain: 0.2 }],
    level: [{ frequency: 523.25, duration: 0.18, gain: 0.18 }, { frequency: 659.25, delay: 0.12, duration: 0.2, gain: 0.18 }, { frequency: 783.99, delay: 0.24, duration: 0.35, gain: 0.18 }],
    wave: [{ frequency: 164.81, duration: 0.25, gain: 0.15, type: 'triangle' }, { frequency: 220, delay: 0.16, duration: 0.3, gain: 0.15, type: 'triangle' }],
    boss: [{ frequency: 146.83, duration: 0.3, gain: 0.19, type: 'triangle' }, { frequency: 130.81, delay: 0.21, duration: 0.3, gain: 0.18, type: 'triangle' }, { frequency: 110, delay: 0.42, duration: 0.5, gain: 0.2, type: 'triangle' }],
    victory: [{ frequency: 523.25, duration: 0.23, gain: 0.19 }, { frequency: 659.25, delay: 0.16, duration: 0.23, gain: 0.19 }, { frequency: 783.99, delay: 0.32, duration: 0.23, gain: 0.19 }, { frequency: 1046.5, delay: 0.49, duration: 0.7, gain: 0.2 }, { frequency: 523.25, delay: 0.49, duration: 0.7, gain: 0.13 }],
    defeat: [{ frequency: 329.63, duration: 0.28, gain: 0.15, type: 'triangle' }, { frequency: 293.66, delay: 0.2, duration: 0.3, gain: 0.15, type: 'triangle' }, { frequency: 220, delay: 0.42, duration: 0.6, gain: 0.16, type: 'triangle' }]
  };

  class Audio {
    constructor(options) {
      options = options || {};
      this.volume = .75;
      this.Context = options.AudioContext || null;
      this.document = options.document || root.document;
      this.context = null;
      this.master = null;
      this.compressor = null;
      this.noiseBuffer = null;
      this.buzz = null;
      this.voices = new Set();
      this.lastCue = Object.create(null);
      this.enabled = false;
      this.disposed = false;
      this.epoch = 0;
      this.suspendTimer = null;
      this.visibility = () => {
        if (this.document.hidden || this.document.visibilityState === 'hidden') {
          try { this.setBuzz(0, 175); } catch (_) { this.resetContext(); }
        }
      };
      if (this.document && this.document.addEventListener) {
        this.document.addEventListener('visibilitychange', this.visibility);
      }
    }

    async setEnabled(value) {
      if (this.disposed) return false;
      if (value && this.enabled && this.context && this.context.state === 'running') return true;
      var epoch = ++this.epoch;
      if (this.suspendTimer !== null) { clearTimeout(this.suspendTimer); this.suspendTimer = null; }
      if (!value) {
        this.enabled = false;
        this.lastCue = Object.create(null);
        this.stopVoices();
        this.stopBuzz();
        var mutedContext = this.context;
        if (mutedContext && this.master) {
          var now = mutedContext.currentTime;
          this.master.gain.cancelScheduledValues(now);
          this.master.gain.setValueAtTime(this.master.gain.value, now);
          this.master.gain.linearRampToValueAtTime(0, now + 0.025);
          this.suspendTimer = setTimeout(() => {
            this.suspendTimer = null;
            if (this.epoch === epoch && this.context === mutedContext && mutedContext.state !== 'closed') {
              try { Promise.resolve(mutedContext.suspend()).catch(() => {}); } catch (_) { /* Muted even if suspension is unavailable. */ }
            }
          }, 35);
        }
        return false;
      }

      try {
        if (this.context && this.context.state === 'closed') this.resetContext();
        if (!this.context || this.context.state === 'closed') {
          var Context = this.Context || root.AudioContext || root.webkitAudioContext;
          if (!Context) return false;
          this.context = new Context({ latencyHint: 'interactive' });
          this.master = this.context.createGain();
          this.master.gain.value = 0;
          this.compressor = this.context.createDynamicsCompressor();
          this.compressor.threshold.value = -18;
          this.compressor.knee.value = 18;
          this.compressor.ratio.value = 4;
          this.compressor.attack.value = 0.005;
          this.compressor.release.value = 0.18;
          this.master.connect(this.compressor);
          this.compressor.connect(this.context.destination);
        }
        var context = this.context;
        await context.resume();
        if (this.disposed || epoch !== this.epoch || this.context !== context) return false;
        this.enabled = true;
        this.lastCue = Object.create(null);
        this.master.gain.cancelScheduledValues(context.currentTime);
        this.master.gain.setValueAtTime(0, context.currentTime);
        this.master.gain.linearRampToValueAtTime(.24*this.volume, context.currentTime + 0.035);
        this.startBuzz();
        return true;
      } catch (_) {
        if (epoch === this.epoch) this.resetContext();
        return false;
      }
    }

    setVolume(value) {
      this.volume=Math.max(0,Math.min(1,Number(value)||0));
      if(this.master&&this.context&&this.enabled)this.master.gain.setTargetAtTime(.24*this.volume,this.context.currentTime,.03);
    }
    cue(name, intensity) {
      if (!this.enabled || !this.context || this.context.state !== 'running') return;
      if (this.document && (this.document.hidden || this.document.visibilityState === 'hidden')) return;
      var phrase = PHRASES[name];
      if (!phrase) return;
      var now = this.context.currentTime;
      if (this.lastCue[name] !== undefined && now - this.lastCue[name] < RATE[name]) return;
      var strength = intensity == null ? 1 : Number(intensity);
      if (!Number.isFinite(strength) || strength <= 0) return;
      strength = Math.min(1.6, strength);
      this.lastCue[name] = now;
      try {
        phrase.forEach((note) => this.voice(note, strength));
      } catch (_) {
        this.resetContext();
      }
    }

    voice(note, strength) {
      if (this.voices.size >= LIMIT) return;
      var context = this.context;
      var start = context.currentTime + (note.delay || 0);
      var duration = note.duration;
      var source;
      var filter = null;
      var gain = context.createGain();
      if (note.noise) {
        if (!this.noiseBuffer) {
          this.noiseBuffer = context.createBuffer(1, context.sampleRate, context.sampleRate);
          var samples = this.noiseBuffer.getChannelData(0);
          for (var i = 0; i < samples.length; i++) samples[i] = Math.random() * 2 - 1;
        }
        source = context.createBufferSource();
        source.buffer = this.noiseBuffer;
        filter = context.createBiquadFilter();
        filter.type = note.filterType || 'lowpass';
        filter.frequency.value = note.filter;
        filter.Q.value = 0.7;
        source.connect(filter);
        filter.connect(gain);
      } else {
        source = context.createOscillator();
        source.type = note.type || 'sine';
        source.frequency.setValueAtTime(note.frequency, start);
        if (note.end) source.frequency.exponentialRampToValueAtTime(note.end, start + duration);
        source.connect(gain);
      }
      gain.connect(this.master);
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.linearRampToValueAtTime(note.gain * strength, start + 0.006);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
      var voice = { source: source, gain: gain, filter: filter };
      source.onended = () => {
        this.voices.delete(voice);
        try { source.disconnect(); gain.disconnect(); if (filter) filter.disconnect(); } catch (_) { /* Already disconnected. */ }
      };
      this.voices.add(voice);
      if (note.noise) source.start(start, Math.random() * 0.4);
      else source.start(start);
      source.stop(start + duration + 0.015);
    }

    startBuzz() {
      if (this.buzz) return;
      var context = this.context;
      var filter = context.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 620;
      filter.Q.value = 0.4;
      var gain = context.createGain();
      gain.gain.value = 0;
      filter.connect(gain);
      gain.connect(this.master);
      var sources = [context.createOscillator(), context.createOscillator()];
      sources.forEach((source, index) => {
        source.type = 'triangle';
        source.frequency.value = 175;
        source.detune.value = index ? 8 : -8;
        source.connect(filter);
        source.start();
      });
      this.buzz = { sources: sources, filter: filter, gain: gain, targetGain: 0, targetFrequency: 175 };
    }

    setBuzz(gain, frequency) {
      if (!this.buzz || !this.context) return;
      var now = this.context.currentTime;
      if (gain !== this.buzz.targetGain) {
        this.buzz.gain.gain.setTargetAtTime(gain, now, 0.045);
        this.buzz.targetGain = gain;
      }
      if (Math.abs(frequency - this.buzz.targetFrequency) > 0.5) {
        this.buzz.sources.forEach((source) => source.frequency.setTargetAtTime(frequency, now, 0.06));
        this.buzz.targetFrequency = frequency;
      }
    }

    update(game) {
      if (!this.enabled || !this.context || this.context.state !== 'running') return;
      var visible = !this.document || !(this.document.hidden || this.document.visibilityState === 'hidden');
      var playing = visible && game && game.state === 'playing';
      var speed = playing && game.queen ? Math.hypot(game.queen.vx || 0, game.queen.vy || 0) : 0;
      try { this.setBuzz(playing ? 0.018 : 0, 175 + Math.min(22, speed * 0.08)); }
      catch (_) { this.resetContext(); }
    }

    stopVoices() {
      var now = this.context ? this.context.currentTime : 0;
      this.voices.forEach(function (voice) {
        try {
          voice.gain.gain.cancelScheduledValues(now);
          voice.gain.gain.setValueAtTime(Math.max(0.0001, voice.gain.gain.value), now);
          voice.gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.02);
          voice.source.stop(now + 0.025);
        } catch (_) { /* A voice can finish between updates. */ }
      });
    }

    stopBuzz() {
      if (!this.buzz) return;
      var buzz = this.buzz;
      this.buzz = null;
      var now = this.context.currentTime;
      buzz.gain.gain.cancelScheduledValues(now);
      buzz.gain.gain.setValueAtTime(buzz.gain.gain.value, now);
      buzz.gain.gain.linearRampToValueAtTime(0, now + 0.02);
      var remaining = buzz.sources.length;
      buzz.sources.forEach(function (source) {
        source.onended = function () {
          try { source.disconnect(); } catch (_) { /* Already disconnected. */ }
          remaining--;
          if (!remaining) { buzz.filter.disconnect(); buzz.gain.disconnect(); }
        };
        try { source.stop(now + 0.025); } catch (_) { /* Context may already be closed. */ }
      });
    }

    resetContext() {
      this.enabled = false;
      this.stopVoices();
      try { this.stopBuzz(); } catch (_) { this.buzz = null; }
      var context = this.context;
      this.context = null;
      this.master = null;
      this.compressor = null;
      this.noiseBuffer = null;
      this.lastCue = Object.create(null);
      this.voices.clear();
      if (context) {
        try { Promise.resolve(context.close()).catch(() => {}); } catch (_) { /* Failed contexts can already be closed. */ }
      }
    }

    dispose() {
      this.epoch++;
      this.disposed = true;
      if (this.suspendTimer !== null) clearTimeout(this.suspendTimer);
      this.suspendTimer = null;
      this.resetContext();
      if (this.document && this.document.removeEventListener) {
        this.document.removeEventListener('visibilitychange', this.visibility);
      }
    }
  }

  return { Audio: Audio };
});
