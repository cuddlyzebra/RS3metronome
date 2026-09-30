// Sync sources for the tick metronome.
//
// The sole sync source is auto-sync from the RuneMetrics tab: watch a
// calibrated screen region for a sudden pixel change, and treat that
// instant as the new tick 0. It doesn't need to read or understand
// what's actually there (no OCR) -- just "did enough of this region
// suddenly look different", which is cheap to poll many times a second
// by counting changed samples rather than comparing whole images.
//
// Any value updating in the RuneMetrics tab -- an XP total, an XP/h
// rate, anything -- only ever happens on a game tick, which is what
// makes it useful as a sync source: it doesn't matter which number
// moves, only that *something* in the panel did. That's also why it can
// be calibrated loosely -- watching the *whole panel* rather than one
// exact row works fine, and a changed-sample count (rather than an
// average over the region) stays sensitive to a small patch of updated
// digits even inside a much bigger watched box.
//
// Since RuneMetrics' position and UI scale are up to each player,
// there's no fixed landmark to hard-code -- this asks the player to
// calibrate once, by hovering their mouse over the RuneMetrics tab
// in-game (app.js reads alt1.mousePosition for that, live, with a short
// in-game preview rect so they can see the watched box before it locks
// in).
//
// This is used one-shot rather than continuously (app.js arms it, waits
// for the next detected change, then disarms itself): watching a whole
// RuneMetrics panel continuously turned out to false-trigger on
// anything that changed in it for reasons unrelated to the moment you
// actually want to sync to, and made the count look like it kept
// resetting rather than counting properly. One-shot avoids that by only
// ever catching exactly one change per click -- and since practically
// any change in the panel is itself a valid tick signal, the watcher is
// tuned (see app.js) to fire on the very first detected change at all,
// however small.

function loadCalibration(storageKey) {
  try {
    const raw = localStorage.getItem(storageKey);
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    return null;
  }
}

function saveCalibration(storageKey, region) {
  try {
    localStorage.setItem(storageKey, JSON.stringify(region));
  } catch (e) {
    // storage unavailable -- calibration just won't persist across reloads
  }
}

function clearCalibration(storageKey) {
  try {
    localStorage.removeItem(storageKey);
  } catch (e) {
    // ignore
  }
}

function isAlt1Available() {
  return typeof window.alt1 !== "undefined" && window.alt1.permissionPixel;
}

// Watches a calibrated screen region for a sudden pixel change and calls
// onTrigger() at that instant. `label` is just for status text (e.g. "XP
// drop", "GCD") so the same class serves either source.
//
// State machine per poll:
//   armed=true, waiting for a big frame-to-frame change ("baseline").
//   On a big change: fire onTrigger(), disarm, note the time.
//   While disarmed: once the region has looked quiet (small
//   frame-to-frame change) for a couple of consecutive polls AND at least
//   one tick's worth of time has passed since the trigger, re-arm.
// This stops a change that keeps animating for a bit (a cooldown sweep
// filling in, drop text fading/scrolling out) from re-triggering many
// times over for what's really one event.
class AutoSyncWatcher {
  constructor(region, onTrigger, onStatus, label) {
    this.region = region;
    this.onTrigger = onTrigger;
    this.onStatus = onStatus || (() => {});
    this.label = label || "change";
    this.pollMs = 45;
    // Detection is based on a *count* of samples that changed a lot
    // between polls, not an average change across the whole region --
    // a region can be a small, tightly calibrated box or an entire
    // RuneMetrics panel where a tick's worth of updated digits changes
    // only a small fraction of a much bigger box. Averaging would
    // dilute a small update to nothing in a big box, but a count of
    // changed samples stays meaningful regardless of how much unchanged
    // UI surrounds it.
    this.perSampleThreshold = 45; // summed abs R+G+B delta to count one sample as "changed"
    this.triggerCount = 14; // changed samples needed to fire while armed (callers may override, e.g. to fire on any change at all)
    this.quietCount = 4; // changed samples below which the region counts as "quiet" again
    this.quietStreakNeeded = 3;
    this._timer = null;
    this._lastPixels = null;
    this._armed = true;
    this._quietStreak = 0;
    this._lastTriggerAt = 0;
  }

  start() {
    if (this._timer) return;
    if (!isAlt1Available()) {
      this.onStatus("Alt1 pixel permission isn't granted.");
      return;
    }
    this._lastPixels = null;
    this._armed = true;
    this._quietStreak = 0;
    this._timer = setInterval(() => this._poll(), this.pollMs);
    this.onStatus(`Watching calibrated spot for ${this.label}...`);
  }

  stop() {
    if (this._timer) {
      clearInterval(this._timer);
      this._timer = null;
    }
    this.onStatus("");
  }

  _poll() {
    let img;
    try {
      img = A1lib.captureHoldFullRs();
    } catch (e) {
      return;
    }
    // The region was calibrated in absolute screen coordinates; convert
    // to this capture's own coordinate space in case the window moved.
    const rx = this.region.x - img.x;
    const ry = this.region.y - img.y;
    if (rx < 0 || ry < 0 || rx + this.region.w > img.width || ry + this.region.h > img.height) {
      this.onStatus("Calibrated spot is off-screen -- move the game window back or recalibrate.");
      return;
    }
    let data;
    try {
      data = img.toData(this.region.x, this.region.y, this.region.w, this.region.h);
    } catch (e) {
      return;
    }

    const pixels = data.data;
    if (this._lastPixels) {
      const changed = changedSampleCount(pixels, this._lastPixels, this.perSampleThreshold);
      const now = performance.now();

      if (this._armed) {
        if (changed > this.triggerCount) {
          this._armed = false;
          this._quietStreak = 0;
          this._lastTriggerAt = now;
          this.onStatus(`${this.label} detected -- synced (${changed} px changed).`);
          this.onTrigger();
        }
      } else {
        const sinceTrigger = now - this._lastTriggerAt;
        if (changed < this.quietCount) {
          this._quietStreak++;
        } else {
          this._quietStreak = 0;
        }
        if (sinceTrigger > TICK_MS && this._quietStreak >= this.quietStreakNeeded) {
          this._armed = true;
          this.onStatus(`Watching calibrated spot for ${this.label}...`);
        }
      }
    }
    this._lastPixels = pixels;
  }
}

function changedSampleCount(a, b, perSampleThreshold) {
  // RGBA byte arrays of equal length. Sampling every 4th pixel (skip 3
  // pixels between samples) keeps this cheap at 45ms polling even over a
  // large region. Counts how many sampled pixels changed by more than
  // perSampleThreshold (summed abs R+G+B delta) between polls -- a count
  // stays meaningful whether the watched region is a tight icon (most of
  // it changes at once) or a whole panel (only a small patch of digits
  // changes at once), unlike an average over the whole region.
  let count = 0;
  const step = 16; // 4 pixels * 4 bytes
  for (let i = 0; i < a.length; i += step) {
    const d = Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]);
    if (d > perSampleThreshold) count++;
  }
  return count;
}
