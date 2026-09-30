// Sync sources for the tick metronome.
//
// The reliable baseline is manual "tap to sync": you tap the instant you
// see an XP drop or a GCD start, the same technique real OSRS tick tools
// use, and it works regardless of UI layout or scale.
//
// The experimental extra is auto-sync off the ability bar's GCD: the
// instant an ability is used, RS3 sweeps a cooldown overlay across its
// icon -- a large, sudden pixel change confined to that one icon. Unlike
// an XP counter (which needs reading digits via OCR and doesn't tick
// every game tick anyway), that's a simple "did this small region change
// a lot" signal, cheap to poll. But since ability bar position and UI
// scale are entirely up to each player, there's no fixed landmark to
// hardcode -- this asks the player to calibrate it once by clicking their
// own ability slot in a captured screenshot shown inside the app.

const CALIBRATION_KEY = "rs3metronome.autosync.region";

function loadCalibration() {
  try {
    const raw = localStorage.getItem(CALIBRATION_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    return null;
  }
}

function saveCalibration(region) {
  try {
    localStorage.setItem(CALIBRATION_KEY, JSON.stringify(region));
  } catch (e) {
    // storage unavailable -- calibration just won't persist across reloads
  }
}

function clearCalibration() {
  try {
    localStorage.removeItem(CALIBRATION_KEY);
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

// Watches a calibrated screen region for the sudden pixel change that
// marks a GCD starting, and calls onTrigger() at that instant.
//
// State machine per poll:
//   armed=true, waiting for a big frame-to-frame change ("baseline").
//   On a big change: fire onTrigger(), disarm, note the time.
//   While disarmed: once the region has looked quiet (small
//   frame-to-frame change) for a couple of consecutive polls AND at least
//   one tick's worth of time has passed since the trigger, re-arm.
// This stops the cooldown-sweep animation's own ongoing pixel churn from
// re-triggering a dozen times per activation.
class AutoSyncWatcher {
  constructor(region, onTrigger, onStatus) {
    this.region = region;
    this.onTrigger = onTrigger;
    this.onStatus = onStatus || (() => {});
    this.pollMs = 45;
    this.changeThreshold = 18; // avg per-channel brightness delta to count as "big"
    this.quietThreshold = 6;
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
    this.onStatus("Watching calibrated slot for GCD activations...");
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
      this.onStatus("Calibrated slot is off-screen -- move the game window back or recalibrate.");
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
      const delta = averageAbsDelta(pixels, this._lastPixels);
      const now = performance.now();

      if (this._armed) {
        if (delta > this.changeThreshold) {
          this._armed = false;
          this._quietStreak = 0;
          this._lastTriggerAt = now;
          this.onStatus(`GCD detected -- synced (change ${delta.toFixed(1)}).`);
          this.onTrigger();
        }
      } else {
        const sinceTrigger = now - this._lastTriggerAt;
        if (delta < this.quietThreshold) {
          this._quietStreak++;
        } else {
          this._quietStreak = 0;
        }
        if (sinceTrigger > TICK_MS && this._quietStreak >= this.quietStreakNeeded) {
          this._armed = true;
          this.onStatus("Watching calibrated slot for GCD activations...");
        }
      }
    }
    this._lastPixels = pixels;
  }
}

function averageAbsDelta(a, b) {
  // RGBA byte arrays of equal length. Sampling every 4th pixel (skip 3
  // pixels between samples) keeps this cheap at 45ms polling without
  // losing sensitivity -- a real GCD sweep changes a large fraction of
  // the region, not a couple of stray pixels.
  let sum = 0;
  let count = 0;
  const step = 16; // 4 pixels * 4 bytes
  for (let i = 0; i < a.length; i += step) {
    sum += Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]);
    count += 3;
  }
  return count ? sum / count : 0;
}
