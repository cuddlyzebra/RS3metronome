// The transparent in-game overlay counter, drawn with Alt1's overlay API
// (alt1.overLayText) rather than anything in this app's own window -- it
// renders directly on top of the game, with no background of its own, at
// a screen spot the player picks once.
//
// Alt1 overlay coordinates are relative to the RS client window itself
// (0,0 = the game window's own top-left), NOT absolute desktop
// coordinates -- unlike the pixel-region reading in sync.js, which uses
// absolute screen coordinates for toData(). That's why this position is
// stored exactly as read from alt1.mousePosition (already
// RS-window-relative), whereas the RuneMetrics region calibration in
// app.js adds alt1.rsX/rsY to get absolute screen coordinates.
//
// An overlay draw call only persists on screen for its own `time`
// argument (ms) before Alt1 removes it -- there's no "leave this up
// forever" call. So this redraws on every tick (which is exactly when
// the number changes anyway) with a `time` a bit longer than one tick,
// so a little scheduling jitter never causes a visible blank gap.

const OVERLAY_POSITION_KEY = "rs3metronome.overlay.position";
const OVERLAY_GROUP = "rs3metronomeCounter";
const OVERLAY_PREVIEW_GROUP = "rs3metronomeCounterPreview";

const OVERLAY_COLORS = {
  gold: [255, 204, 51],
  white: [240, 240, 240],
  red: [230, 70, 70],
  green: [90, 220, 110],
  cyan: [90, 220, 220],
};

function loadOverlayPosition() {
  try {
    const raw = localStorage.getItem(OVERLAY_POSITION_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    return null;
  }
}

function saveOverlayPosition(pos) {
  try {
    localStorage.setItem(OVERLAY_POSITION_KEY, JSON.stringify(pos));
  } catch (e) {
    // best-effort only
  }
}

class OverlayCounter {
  constructor() {
    this.position = loadOverlayPosition();
    this.colorName = "gold";
    this.size = 28;
  }

  isAvailable() {
    return typeof window.alt1 !== "undefined" && window.alt1.permissionOverlay;
  }

  setPosition(pos) {
    this.position = pos;
    saveOverlayPosition(pos);
  }

  setColorName(name) {
    if (OVERLAY_COLORS[name]) this.colorName = name;
  }

  setSize(px) {
    this.size = Math.max(10, Math.min(80, px));
  }

  // Draws (or redraws) the current text at the calibrated spot. Call this
  // every tick while enabled.
  //
  // A group isn't a single slot that a new draw overwrites -- every
  // overLayTextEx call adds another draw to the group, which only goes
  // away once its own `time` expires. Redrawing every tick without
  // clearing first meant each tick's number stacked on top of the
  // previous one still fading out, instead of replacing it -- hence the
  // overlapping digits. Clearing the group immediately before drawing the
  // new number fixes that: at any instant there's at most one draw in
  // the group.
  show(text) {
    if (!this.position || !this.isAvailable()) return;
    const [r, g, b] = OVERLAY_COLORS[this.colorName] || OVERLAY_COLORS.gold;
    const color = A1lib.mixColor(r, g, b, 255);
    try {
      window.alt1.overLayClearGroup(OVERLAY_GROUP);
      window.alt1.overLaySetGroup(OVERLAY_GROUP);
      window.alt1.overLayTextEx(text, color, this.size, this.position.x, this.position.y, TICK_MS + 300, "", true, true);
    } catch (e) {
      // overlay draw failing shouldn't take down the rest of the app
    }
  }

  clear() {
    if (this.isAvailable()) {
      try {
        window.alt1.overLayClearGroup(OVERLAY_GROUP);
      } catch (e) {
        // ignore
      }
    }
  }

  // A short-lived preview draw at an arbitrary (x, y), used while the
  // player is hovering to place the overlay -- separate group from the
  // real counter so the two never fight over the same slot.
  previewAt(x, y) {
    if (!this.isAvailable()) return;
    const [r, g, b] = OVERLAY_COLORS[this.colorName] || OVERLAY_COLORS.gold;
    const color = A1lib.mixColor(r, g, b, 255);
    try {
      window.alt1.overLayClearGroup(OVERLAY_PREVIEW_GROUP);
      window.alt1.overLaySetGroup(OVERLAY_PREVIEW_GROUP);
      window.alt1.overLayTextEx("1", color, this.size, x, y, 200, "", true, true);
    } catch (e) {
      // ignore
    }
  }

  clearPreview() {
    if (this.isAvailable()) {
      try {
        window.alt1.overLayClearGroup(OVERLAY_PREVIEW_GROUP);
      } catch (e) {
        // ignore
      }
    }
  }
}
