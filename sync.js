// Sync sources for the tick metronome.
//
// The reliable baseline is manual "tap to sync": you tap the instant you
// see an XP drop or a GCD start, the same technique real OSRS tick tools
// use, and it works regardless of UI layout or scale.
//
// The experimental extras are two auto-sync sources, both built on the
// same idea: watch a calibrated screen region for a sudden pixel change,
// and treat that instant as the new tick 0. Neither needs to read or
// understand what's actually there (no OCR) -- just "did enough of this
// region suddenly look different", which is cheap to poll many times a
// second by counting changed samples rather than comparing whole images:
//
//   - An XP drop appearing -- or any value updating in the RuneMetrics
//     tab, which the game only ever does on a tick -- is a patch of
//     screen going from unchanged to visibly different all at once.
//     RuneMetrics is a good target for this precisely because it can be
//     calibrated loosely: watching the *whole panel* rather than one
//     exact row works fine, since any of its numbers changing is itself
//     the tick signal, and a changed-sample count (rather than an
//     average over the region) stays sensitive to a small patch of
//     updated digits even inside a much bigger watched box.
//   - A GCD starting sweeps a cooldown overlay across an ability's icon,
//     a large, sudden change confined to that one icon.
//
// Since ability bar position, XP/RuneMetrics position, and UI scale are
// all up to each player, there's no fixed landmark to hard-code for
// either -- this asks the player to calibrate once per source by
// clicking the spot in a captured screenshot shown inside the app. Both
// calibrations are stored under their own key so they don't overwrite
// each other.

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

// Captures the full RS window for the calibration UI to display. Returns
// { imageData, originX, originY } -- originX/Y are the capture's own
// screen offset (img.x/img.y), needed to convert a click on the displayed
// (possibly scaled-down) preview back into absolute screen coordinates.
function captureForCalibration() {
  if (!isAlt1Available()) return null;
  const img = A1lib.captureHoldFullRs();
  const pixels = img.toData(img.x, img.y, img.width, img.height);
  return { imageData: pixels, originX: img.x, originY: img.y };
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
    // between polls, not an average change across the whole region. A
    // region can be anything from a tight 34x34 ability icon (where a
    // GCD sweep changes most of the box) to an entire RuneMetrics panel
    // (where a tick's worth of updated digits changes only a small
    // fraction of a much bigger box) -- averaging would dilute a small
    // update to nothing in a big box, but a count of changed samples
    // stays meaningful regardless of how much unchanged UI surrounds it.
    this.perSampleThreshold = 45; // summed abs R+G+B delta to count one sample as "changed"
    this.triggerCount = 14; // changed samples needed to fire while armed
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
