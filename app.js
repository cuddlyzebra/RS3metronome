// Wires the tick engine, audio, visuals, overlay and settings together.

const SETTINGS_KEY = "rs3metronome.settings";
const DEFAULT_SETTINGS = {
  mode: "both", // "both" | "visual" | "audio"
  tickTarget: 3, // e.g. 3 for the 1.8s/3-tick GCD
  volume: 70,
  accent: true,
  autosyncEnabled: false,
  syncOffsetMs: 0, // shifts when a detected sync point actually lands, +later / -earlier
  overlayEnabled: false,
  overlaySize: 28,
  overlayColor: "gold",
};

function loadSettings() {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch (e) {
    return { ...DEFAULT_SETTINGS };
  }
}

function saveSettings(settings) {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch (e) {
    // best-effort only
  }
}

// Fixed size of the calibration viewport canvas -- zooming/panning changes
// what part of the captured screenshot is drawn into it, never its own
// element size, which keeps the click math in one place.
const CAL_VIEWPORT_W = 560;
const CAL_VIEWPORT_H = 420;

document.addEventListener("DOMContentLoaded", () => {
  if (window.alt1) {
    window.alt1.identifyAppUrl("./appconfig.json");
  }

  const settings = loadSettings();

  const engine = new TickEngine();
  const player = new ClickPlayer();
  player.setVolume(settings.volume / 100);
  const overlay = new OverlayCounter();
  overlay.setSize(settings.overlaySize);
  overlay.setColorName(settings.overlayColor);

  let autoWatcher = null;

  // --- element refs ---
  const startStopBtn = document.getElementById("start-stop-btn");
  const syncBtn = document.getElementById("sync-btn");
  const tickFace = document.getElementById("tick-face");
  const tickCountEl = document.getElementById("tick-count");
  const tickTargetLabel = document.getElementById("tick-target-label");
  const flashOverlay = document.getElementById("flash-overlay");
  const modeSelect = document.getElementById("mode-select");
  const tickTargetInput = document.getElementById("tick-target-input");
  const volumeInput = document.getElementById("volume-input");
  const accentCheckbox = document.getElementById("accent-checkbox");
  const syncOffsetInput = document.getElementById("sync-offset-input");
  const calibrateBtn = document.getElementById("calibrate-btn");
  const autosyncCheckbox = document.getElementById("autosync-checkbox");
  const autosyncStatus = document.getElementById("autosync-status");
  const generalStatus = document.getElementById("general-status");

  const placeOverlayBtn = document.getElementById("place-overlay-btn");
  const overlayEnabledCheckbox = document.getElementById("overlay-enabled-checkbox");
  const overlaySizeInput = document.getElementById("overlay-size-input");
  const overlayColorSelect = document.getElementById("overlay-color-select");
  const overlayStatus = document.getElementById("overlay-status");

  const calibrationModal = document.getElementById("calibration-modal");
  const calibrationCanvas = document.getElementById("calibration-canvas");
  const calibrationTitle = document.getElementById("calibration-title");
  const calibrationHint = document.getElementById("calibration-hint");
  const calibrationSizeRow = document.getElementById("calibration-size-row");
  const calibrationSize = document.getElementById("calibration-size");
  const calibrationCancelBtn = document.getElementById("calibration-cancel-btn");
  const calibrationRecaptureBtn = document.getElementById("calibration-recapture-btn");
  const calibrationZoomLabel = document.getElementById("calibration-zoom-label");
  const calibrationZoomResetBtn = document.getElementById("calibration-zoom-reset-btn");

  // --- apply saved settings to controls ---
  modeSelect.value = settings.mode;
  tickTargetInput.value = settings.tickTarget;
  volumeInput.value = settings.volume;
  accentCheckbox.checked = settings.accent;
  syncOffsetInput.value = settings.syncOffsetMs;
  autosyncCheckbox.checked = settings.autosyncEnabled;
  overlayEnabledCheckbox.checked = settings.overlayEnabled;
  overlaySizeInput.value = settings.overlaySize;
  overlayColorSelect.value = settings.overlayColor;
  tickTargetLabel.textContent = `counting to ${settings.tickTarget}`;

  if (!window.alt1 || !window.alt1.permissionPixel) {
    generalStatus.textContent = "Alt1 pixel permission isn't granted -- tap-to-sync and the metronome still work, but auto-sync needs it.";
  }

  // --- tick handling ---
  engine.onTick = (tickIndex) => {
    const target = Math.max(1, settings.tickTarget | 0);
    const position = ((tickIndex % target) + target) % target; // 0-indexed within the count
    const isArrival = position === target - 1; // the tick it "arrives" on
    const isAccentSound = settings.accent && isArrival;
    const displayCount = position + 1;

    tickCountEl.textContent = String(displayCount);

    if (isArrival && (settings.mode === "visual" || settings.mode === "both")) {
      tickFace.classList.remove("pulse", "pulse-accent");
      flashOverlay.classList.remove("flash", "flash-accent");
      void tickFace.offsetWidth; // force reflow so the animation restarts
      const cls = settings.accent ? "pulse-accent" : "pulse";
      const flashCls = settings.accent ? "flash-accent" : "flash";
      tickFace.classList.add(cls);
      flashOverlay.classList.add(flashCls);
      setTimeout(() => {
        tickFace.classList.remove(cls);
        flashOverlay.classList.remove(flashCls);
      }, 140);
    }

    if (settings.mode === "audio" || settings.mode === "both") {
      player.play(isAccentSound);
    }

    if (settings.overlayEnabled) {
      overlay.show(String(displayCount));
    }
  };

  // --- transport ---
  function setRunning(running) {
    if (running) {
      engine.start();
      startStopBtn.textContent = "Stop";
      startStopBtn.classList.add("running");
    } else {
      engine.stop();
      startStopBtn.textContent = "Start";
      startStopBtn.classList.remove("running");
      tickCountEl.textContent = "0";
      tickFace.classList.remove("pulse", "pulse-accent");
      flashOverlay.classList.remove("flash", "flash-accent");
      overlay.clear();
    }
  }

  startStopBtn.addEventListener("click", () => {
    setRunning(!engine.running);
  });

  // Shared by manual tap-to-sync and auto-sync: re-anchors tick 0 to
  // "now" (or a moment shifted by the sync-offset setting) and makes
  // sure the transport shows as running.
  function triggerSync() {
    engine.syncNow(performance.now() + (settings.syncOffsetMs || 0));
    if (!startStopBtn.classList.contains("running")) {
      startStopBtn.textContent = "Stop";
      startStopBtn.classList.add("running");
    }
  }

  syncBtn.addEventListener("click", triggerSync);

  // --- settings wiring ---
  modeSelect.addEventListener("change", () => {
    settings.mode = modeSelect.value;
    saveSettings(settings);
  });

  tickTargetInput.addEventListener("change", () => {
    const v = Math.max(1, Math.min(999, parseInt(tickTargetInput.value, 10) || 1));
    tickTargetInput.value = v;
    settings.tickTarget = v;
    tickTargetLabel.textContent = `counting to ${v}`;
    saveSettings(settings);
  });

  volumeInput.addEventListener("input", () => {
    settings.volume = parseInt(volumeInput.value, 10);
    player.setVolume(settings.volume / 100);
    saveSettings(settings);
  });

  accentCheckbox.addEventListener("change", () => {
    settings.accent = accentCheckbox.checked;
    saveSettings(settings);
  });

  syncOffsetInput.addEventListener("change", () => {
    const v = Math.max(-600, Math.min(600, parseInt(syncOffsetInput.value, 10) || 0));
    syncOffsetInput.value = v;
    settings.syncOffsetMs = v;
    saveSettings(settings);
  });

  // --- overlay counter ---
  overlaySizeInput.addEventListener("change", () => {
    const v = Math.max(10, Math.min(80, parseInt(overlaySizeInput.value, 10) || 28));
    overlaySizeInput.value = v;
    settings.overlaySize = v;
    overlay.setSize(v);
    saveSettings(settings);
  });

  overlayColorSelect.addEventListener("change", () => {
    settings.overlayColor = overlayColorSelect.value;
    overlay.setColorName(settings.overlayColor);
    saveSettings(settings);
  });

  overlayEnabledCheckbox.addEventListener("change", () => {
    settings.overlayEnabled = overlayEnabledCheckbox.checked;
    saveSettings(settings);
    if (settings.overlayEnabled) {
      if (!overlay.position) {
        overlayStatus.textContent = "Place the overlay position first.";
        overlayEnabledCheckbox.checked = false;
        settings.overlayEnabled = false;
        saveSettings(settings);
        return;
      }
      if (!overlay.isAvailable()) {
        overlayStatus.textContent = "Alt1 overlay permission isn't granted for this app.";
        overlayEnabledCheckbox.checked = false;
        settings.overlayEnabled = false;
        saveSettings(settings);
        return;
      }
      overlayStatus.textContent = engine.running ? "Overlay is on." : "Overlay is on -- start the metronome to see it.";
    } else {
      overlay.clear();
      overlayStatus.textContent = "";
    }
  });

  if (overlay.position) {
    overlayStatus.textContent = settings.overlayEnabled ? "Overlay is on." : "Positioned. Enable the checkbox to show it.";
  } else {
    overlayStatus.textContent = "Not positioned yet.";
  }

  // --- auto-sync ---
  function autoSyncStatusText(text) {
    autosyncStatus.textContent = text;
  }

  function startAutoWatcher() {
    const region = loadCalibration();
    if (!region) {
      autoSyncStatusText("Calibrate an ability slot first.");
      autosyncCheckbox.checked = false;
      settings.autosyncEnabled = false;
      saveSettings(settings);
      return;
    }
    if (autoWatcher) autoWatcher.stop();
    autoWatcher = new AutoSyncWatcher(
      region,
      triggerSync,
      autoSyncStatusText
    );
    autoWatcher.start();
  }

  function stopAutoWatcher() {
    if (autoWatcher) {
      autoWatcher.stop();
      autoWatcher = null;
    }
  }

  autosyncCheckbox.addEventListener("change", () => {
    settings.autosyncEnabled = autosyncCheckbox.checked;
    saveSettings(settings);
    if (settings.autosyncEnabled) {
      startAutoWatcher();
    } else {
      stopAutoWatcher();
      autoSyncStatusText("");
    }
  });

  if (settings.autosyncEnabled) {
    startAutoWatcher();
  } else {
    const existing = loadCalibration();
    autoSyncStatusText(existing ? "Calibrated. Enable the checkbox to start watching." : "Not calibrated yet.");
  }

  // ==========================================================================
  // Calibration modal -- shared by both the ability-slot region picker
  // (auto-sync) and the overlay position picker, distinguished by `mode`.
  // ==========================================================================

  let calCapture = null; // { offCanvas, imgW, imgH, originX, originY }
  let calView = null; // { zoom, srcCenterX, srcCenterY, _last }
  let calMode = "ability"; // "ability" | "overlay"

  function calBaseScale() {
    return Math.min(CAL_VIEWPORT_W / calCapture.imgW, CAL_VIEWPORT_H / calCapture.imgH);
  }

  function renderCalibrationViewport() {
    const ctx = calibrationCanvas.getContext("2d");
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, CAL_VIEWPORT_W, CAL_VIEWPORT_H);

    const scale = calBaseScale() * calView.zoom;
    let srcW = CAL_VIEWPORT_W / scale;
    let srcH = CAL_VIEWPORT_H / scale;
    let srcX = calView.srcCenterX - srcW / 2;
    let srcY = calView.srcCenterY - srcH / 2;

    let destX = 0, destY = 0, destW = CAL_VIEWPORT_W, destH = CAL_VIEWPORT_H;

    if (srcW <= calCapture.imgW) {
      srcX = Math.max(0, Math.min(calCapture.imgW - srcW, srcX));
    } else {
      destW = calCapture.imgW * scale;
      destX = (CAL_VIEWPORT_W - destW) / 2;
      srcX = 0;
      srcW = calCapture.imgW;
    }
    if (srcH <= calCapture.imgH) {
      srcY = Math.max(0, Math.min(calCapture.imgH - srcH, srcY));
    } else {
      destH = calCapture.imgH * scale;
      destY = (CAL_VIEWPORT_H - destH) / 2;
      srcY = 0;
      srcH = calCapture.imgH;
    }

    calView.srcCenterX = srcX + srcW / 2;
    calView.srcCenterY = srcY + srcH / 2;

    ctx.imageSmoothingEnabled = calView.zoom <= 2;
    ctx.drawImage(calCapture.offCanvas, srcX, srcY, srcW, srcH, destX, destY, destW, destH);

    calView._last = { srcX, srcY, srcW, srcH, destX, destY, destW, destH };
    calibrationZoomLabel.textContent = `Zoom: ${calView.zoom.toFixed(1)}x`;
  }

  function openCalibration(mode) {
    calMode = mode;
    const capture = captureForCalibration();
    if (!capture) {
      generalStatus.textContent = "Alt1 pixel permission isn't granted -- can't capture the screen to calibrate.";
      return;
    }
    const off = document.createElement("canvas");
    off.width = capture.imageData.width;
    off.height = capture.imageData.height;
    off.getContext("2d").putImageData(capture.imageData, 0, 0);

    calCapture = {
      offCanvas: off,
      imgW: capture.imageData.width,
      imgH: capture.imageData.height,
      originX: capture.originX,
      originY: capture.originY,
    };
    calView = {
      zoom: 1,
      srcCenterX: calCapture.imgW / 2,
      srcCenterY: calCapture.imgH / 2,
    };

    if (mode === "ability") {
      calibrationTitle.textContent = "Click the center of your ability slot";
      calibrationHint.textContent = "This captures your current screen. Click directly on the ability icon whose cooldown sweep you want the metronome to watch (usually the first slot you press). Scroll to zoom in on the cursor for a more precise click. You can re-run this any time your UI moves or rescales.";
      calibrationSizeRow.style.display = "";
    } else {
      calibrationTitle.textContent = "Click where you want the counter";
      calibrationHint.textContent = "Click the spot on screen where the transparent number should appear. Scroll to zoom in for a more precise click. You can re-run this any time you move your UI.";
      calibrationSizeRow.style.display = "none";
    }

    renderCalibrationViewport();
    calibrationModal.classList.remove("hidden");
  }

  function closeCalibration() {
    calibrationModal.classList.add("hidden");
    calCapture = null;
    calView = null;
  }

  calibrateBtn.addEventListener("click", () => openCalibration("ability"));
  placeOverlayBtn.addEventListener("click", () => openCalibration("overlay"));
  calibrationCancelBtn.addEventListener("click", closeCalibration);
  calibrationRecaptureBtn.addEventListener("click", () => openCalibration(calMode));
  calibrationZoomResetBtn.addEventListener("click", () => {
    if (!calView || !calCapture) return;
    calView.zoom = 1;
    calView.srcCenterX = calCapture.imgW / 2;
    calView.srcCenterY = calCapture.imgH / 2;
    renderCalibrationViewport();
  });

  function viewportPointFromEvent(ev) {
    const rect = calibrationCanvas.getBoundingClientRect();
    const scaleX = CAL_VIEWPORT_W / rect.width;
    const scaleY = CAL_VIEWPORT_H / rect.height;
    return {
      vx: (ev.clientX - rect.left) * scaleX,
      vy: (ev.clientY - rect.top) * scaleY,
    };
  }

  calibrationCanvas.addEventListener("wheel", (ev) => {
    if (!calView || !calCapture) return;
    ev.preventDefault();
    const { vx, vy } = viewportPointFromEvent(ev);
    const m = calView._last;
    const clampedVx = Math.max(m.destX, Math.min(m.destX + m.destW, vx));
    const clampedVy = Math.max(m.destY, Math.min(m.destY + m.destH, vy));
    const srcUnderX = m.srcX + (clampedVx - m.destX) * (m.srcW / m.destW);
    const srcUnderY = m.srcY + (clampedVy - m.destY) * (m.srcH / m.destH);

    const factor = ev.deltaY < 0 ? 1.25 : 1 / 1.25;
    calView.zoom = Math.max(1, Math.min(15, calView.zoom * factor));
    calView.srcCenterX = srcUnderX;
    calView.srcCenterY = srcUnderY;
    renderCalibrationViewport();
  }, { passive: false });

  calibrationCanvas.addEventListener("click", (ev) => {
    if (!calCapture || !calView) return;
    const { vx, vy } = viewportPointFromEvent(ev);
    const m = calView._last;
    if (vx < m.destX || vx > m.destX + m.destW || vy < m.destY || vy > m.destY + m.destH) {
      return; // clicked in a letterboxed area -- not on the image
    }
    const sourceX = m.srcX + (vx - m.destX) * (m.srcW / m.destW);
    const sourceY = m.srcY + (vy - m.destY) * (m.srcH / m.destH);

    if (calMode === "ability") {
      const size = Math.max(12, Math.min(120, parseInt(calibrationSize.value, 10) || 34));
      const region = {
        x: Math.round(calCapture.originX + sourceX - size / 2),
        y: Math.round(calCapture.originY + sourceY - size / 2),
        w: size,
        h: size,
      };
      saveCalibration(region);
      closeCalibration();
      autoSyncStatusText("Calibrated. Enable the checkbox to start watching.");
      if (settings.autosyncEnabled) startAutoWatcher();
    } else {
      // Overlay coordinates are RS-window-relative, which is exactly what
      // the captured screenshot's own pixel offsets already are -- no
      // origin to add here (unlike the ability-slot region above, which
      // needs absolute screen coordinates for toData()/findSubimage()).
      const pos = { x: Math.round(sourceX), y: Math.round(sourceY) };
      overlay.setPosition(pos);
      closeCalibration();
      overlayStatus.textContent = settings.overlayEnabled ? "Overlay is on." : "Positioned. Enable the checkbox to show it.";
    }
  });
});
