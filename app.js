// Wires the tick engine, audio, visuals and settings together.

const SETTINGS_KEY = "rs3metronome.settings";
const DEFAULT_SETTINGS = {
  mode: "both", // "both" | "visual" | "audio"
  tickTarget: 3, // e.g. 3 for the 1.8s/3-tick GCD
  volume: 70,
  accent: true,
  autosyncEnabled: false,
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

document.addEventListener("DOMContentLoaded", () => {
  if (window.alt1) {
    window.alt1.identifyAppUrl("./appconfig.json");
  }

  const settings = loadSettings();

  const engine = new TickEngine();
  const player = new ClickPlayer();
  player.setVolume(settings.volume / 100);

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
  const calibrateBtn = document.getElementById("calibrate-btn");
  const autosyncCheckbox = document.getElementById("autosync-checkbox");
  const autosyncStatus = document.getElementById("autosync-status");
  const generalStatus = document.getElementById("general-status");

  const calibrationModal = document.getElementById("calibration-modal");
  const calibrationCanvas = document.getElementById("calibration-canvas");
  const calibrationSize = document.getElementById("calibration-size");
  const calibrationCancelBtn = document.getElementById("calibration-cancel-btn");
  const calibrationRecaptureBtn = document.getElementById("calibration-recapture-btn");

  // --- apply saved settings to controls ---
  modeSelect.value = settings.mode;
  tickTargetInput.value = settings.tickTarget;
  volumeInput.value = settings.volume;
  accentCheckbox.checked = settings.accent;
  autosyncCheckbox.checked = settings.autosyncEnabled;
  tickTargetLabel.textContent = `counting to ${settings.tickTarget}`;

  if (!window.alt1 || !window.alt1.permissionPixel) {
    generalStatus.textContent = "Alt1 pixel permission isn't granted -- tap-to-sync and the metronome still work, but auto-sync needs it.";
  }

  // --- tick handling ---
  engine.onTick = (tickIndex) => {
    const target = Math.max(1, settings.tickTarget | 0);
    const position = ((tickIndex % target) + target) % target; // 0-indexed within the count
    const isAccent = settings.accent && position === 0;
    const displayCount = position + 1;

    tickCountEl.textContent = String(displayCount);

    if (settings.mode === "visual" || settings.mode === "both") {
      tickFace.classList.remove("pulse", "pulse-accent");
      flashOverlay.classList.remove("flash", "flash-accent");
      // force reflow so the animation restarts even on consecutive ticks
      void tickFace.offsetWidth;
      const cls = isAccent ? "pulse-accent" : "pulse";
      const flashCls = isAccent ? "flash-accent" : "flash";
      tickFace.classList.add(cls);
      flashOverlay.classList.add(flashCls);
      setTimeout(() => {
        tickFace.classList.remove(cls);
        flashOverlay.classList.remove(flashCls);
      }, 140);
    }

    if (settings.mode === "audio" || settings.mode === "both") {
      player.play(isAccent);
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
    }
  }

  startStopBtn.addEventListener("click", () => {
    setRunning(!engine.running);
  });

  syncBtn.addEventListener("click", () => {
    engine.syncNow();
    if (!startStopBtn.classList.contains("running")) {
      startStopBtn.textContent = "Stop";
      startStopBtn.classList.add("running");
    }
  });

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
      () => {
        engine.syncNow();
        if (!startStopBtn.classList.contains("running")) {
          startStopBtn.textContent = "Stop";
          startStopBtn.classList.add("running");
        }
      },
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

  // --- calibration modal ---
  let calibrationCapture = null; // { imageData, originX, originY, scale }

  function openCalibration() {
    const capture = captureForCalibration();
    if (!capture) {
      generalStatus.textContent = "Alt1 pixel permission isn't granted -- can't capture the screen to calibrate.";
      return;
    }
    const maxDim = 520;
    const scale = Math.min(1, maxDim / Math.max(capture.imageData.width, capture.imageData.height));
    calibrationCapture = { ...capture, scale };

    const off = document.createElement("canvas");
    off.width = capture.imageData.width;
    off.height = capture.imageData.height;
    off.getContext("2d").putImageData(capture.imageData, 0, 0);

    calibrationCanvas.width = Math.round(capture.imageData.width * scale);
    calibrationCanvas.height = Math.round(capture.imageData.height * scale);
    const ctx = calibrationCanvas.getContext("2d");
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(off, 0, 0, calibrationCanvas.width, calibrationCanvas.height);

    calibrationModal.classList.remove("hidden");
  }

  function closeCalibration() {
    calibrationModal.classList.add("hidden");
    calibrationCapture = null;
  }

  calibrateBtn.addEventListener("click", openCalibration);
  calibrationCancelBtn.addEventListener("click", closeCalibration);
  calibrationRecaptureBtn.addEventListener("click", openCalibration);

  calibrationCanvas.addEventListener("click", (ev) => {
    if (!calibrationCapture) return;
    const rect = calibrationCanvas.getBoundingClientRect();
    // canvas may itself be CSS-scaled to fit (max-width:100%) on top of
    // our own scale factor -- account for both to get true source pixels.
    const canvasScaleX = calibrationCanvas.width / rect.width;
    const canvasScaleY = calibrationCanvas.height / rect.height;
    const cssX = (ev.clientX - rect.left) * canvasScaleX;
    const cssY = (ev.clientY - rect.top) * canvasScaleY;

    const sourceX = cssX / calibrationCapture.scale;
    const sourceY = cssY / calibrationCapture.scale;

    const size = Math.max(12, Math.min(120, parseInt(calibrationSize.value, 10) || 34));
    const region = {
      x: Math.round(calibrationCapture.originX + sourceX - size / 2),
      y: Math.round(calibrationCapture.originY + sourceY - size / 2),
      w: size,
      h: size,
    };
    saveCalibration(region);
    closeCalibration();
    autoSyncStatusText("Calibrated. Enable the checkbox to start watching.");
    if (settings.autosyncEnabled) startAutoWatcher();
  });
});
