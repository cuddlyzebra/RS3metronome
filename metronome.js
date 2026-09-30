// Core tick engine for the RS3 Tick Metronome.
//
// RuneScape's server runs on a fixed 600ms game tick -- almost everything
// timed in the game (movement, combat, the 1.8s/3-tick global ability
// cooldown, etc) happens in whole multiples of it. This engine keeps a
// steady 600ms beat and fires a callback on every tick, with audio/visual
// output layered on top by app.js.
//
// SCHEDULING: a naive setInterval(fn, 600) drifts over time, because each
// call is scheduled 600ms after the *previous callback actually ran*, not
// after the previous scheduled time -- timer slop accumulates tick after
// tick. Instead this anchors a single startTime (via performance.now(),
// a monotonic clock) and, on every tick, computes the delay to the next
// *absolute* scheduled instant (startTime + n*600ms) fresh from
// performance.now(). Any single timer's slop is corrected on the very
// next tick rather than compounding.

const TICK_MS = 600;

class TickEngine {
  constructor() {
    this.running = false;
    this.startTime = null; // performance.now() at tick index 0
    this.tickIndex = 0;
    this.timerId = null;
    this.onTick = null; // (tickIndex) => void
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.startTime = performance.now();
    this.tickIndex = -1;
    this._scheduleNext(0);
  }

  stop() {
    this.running = false;
    if (this.timerId !== null) {
      clearTimeout(this.timerId);
      this.timerId = null;
    }
  }

  // Re-anchors tick 0 to a given instant (performance.now()-style
  // timestamp), without losing the running state. Called by the
  // RuneMetrics auto-sync source in app.js.
  //
  // anchorTime defaults to right now. It can also be nudged forward or
  // back (app.js's "sync offset" setting does this) to correct for a
  // detector that consistently fires a bit early or late relative to the
  // real event -- e.g. RuneMetrics confirming a change a tick or so
  // after the fact. Scheduling through the normal _scheduleNext(0) path
  // (rather than always firing immediately) handles both directions
  // correctly: a future anchor fires tick 0 when it's actually reached,
  // a past-or-present anchor fires it right away.
  syncNow(anchorTime) {
    if (this.timerId !== null) {
      clearTimeout(this.timerId);
      this.timerId = null;
    }
    this.running = true;
    this.startTime = typeof anchorTime === "number" ? anchorTime : performance.now();
    this._scheduleNext(0);
  }

  _scheduleNext(nextIndex) {
    const target = this.startTime + nextIndex * TICK_MS;
    const delay = Math.max(0, target - performance.now());
    this.timerId = setTimeout(() => {
      if (!this.running) return;
      this.tickIndex = nextIndex;
      this._fireTick();
      this._scheduleNext(nextIndex + 1);
    }, delay);
  }

  _fireTick() {
    if (this.onTick) this.onTick(this.tickIndex);
  }
}

// Synthesized audio -- no external sound files to fetch/bundle. A short
// clicky envelope on an oscillator, the same trick real metronome apps
// use. Two pitches: a higher "tick" for the accented (first-of-count)
// beat and a lower "tock" for the rest, so you can hear the count
// boundary without looking at the screen, same as the OSRS-style tools
// this is modeled on.
class ClickPlayer {
  constructor() {
    this.ctx = null;
    this.volume = 0.7;
  }

  _ensureContext() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AC();
    }
    if (this.ctx.state === "suspended") {
      this.ctx.resume();
    }
    return this.ctx;
  }

  setVolume(v01) {
    this.volume = Math.max(0, Math.min(1, v01));
  }

  play(accent) {
    const ctx = this._ensureContext();
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "square";
    osc.frequency.value = accent ? 1400 : 900;

    const peak = this.volume * (accent ? 0.5 : 0.32);
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(peak, now + 0.002);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.05);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.06);
  }
}
