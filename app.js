// Wires the tick engine, audio, visuals, overlay and settings together.

const SETTINGS_KEY = "rs3metronome.settings";
const ABILITY_CALIBRATION_KEY = "rs3metronome.autosync.region";
const XP_CALIBRATION_KEY = "rs3metronome.autosync.xpregion";
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

  let abilityWatcher = null;
  let xpWatcher = null;

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
  const calibrateXpBtn = document.getElementById("calibrate-xp-btn");
  const xpSyncOnceBtn = document.getElementById("xp-sync-once-btn");
  const xpAutosyncStatus = document.getElementById("xp-autosync-status");
  const generalStatus = document.getElementById("general-status");

  const placeOverlayBtn = document.getElementById("place-overlay-btn");
  const overlayEnabledCheckbox = document.getElementById("overlay-enabled-checkbox");
  const overlaySizeInput = document.getElementById("overlay-size-input");
  const overlayColorSelect = document.getElementById("overlay-color-select");
  const overlayStatus = document.getElementById("overlay-status");

  const abilityWidthInput = document.getElementById("ability-width");
  const abilityHeightInput = document.getElementById("ability-height");
  const xpWidthInput = document.getElementById("xp-width");
  const xpHeightInput = document.getElementById("xp-height");

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

  // --- hover-to-place overlay position ---
  // Rather than clicking a spot on a static screenshot, this places the
  // overlay by tracking the live cursor (alt1.mousePosition, which needs
  // the "gamestate" permission) while the player hovers over the game,
  // drawing a short-lived preview draw at that exact spot so they can see
  // where it'll land before it's locked in. mousePosition is already
  // RS-window-relative -- the same coordinate space overlay drawing uses
  // -- so there's no origin math needed here, unlike the pixel-region
  // calibration above.
  const HOVER_CAPTURE_SECONDS = 3;
  let hoverActive = false;
  let hoverPreviewTimer = null;
  let hoverCountdownTimer = null;

  function decodeMousePosition(raw) {
    if (typeof raw !== "number" || raw < 0) return null;
    return { x: (raw >> 16) & 0xffff, y: raw & 0xffff };
  }

  function stopHoverPlacement(finalStatus) {
    hoverActive = false;
    if (hoverPreviewTimer) { clearInterval(hoverPreviewTimer); hoverPreviewTimer = null; }
    if (hoverCountdownTimer) { clearInterval(hoverCountdownTimer); hoverCountdownTimer = null; }
    overlay.clearPreview();
    placeOverlayBtn.textContent = "Place overlay position (hover)...";
    if (finalStatus !== undefined) overlayStatus.textContent = finalStatus;
  }

  function startHoverPlacement() {
    if (!window.alt1) {
      overlayStatus.textContent = "Alt1 isn't available.";
      return;
    }
    if (!window.alt1.permissionGameState) {
      overlayStatus.textContent = 'Needs the "Game state" permission to track your cursor -- you may need to remove and re-add the app once for the new permission to take effect.';
      return;
    }
    if (!overlay.isAvailable()) {
      overlayStatus.textContent = "Alt1 overlay permission isn't granted for this app.";
      return;
    }

    hoverActive = true;
    placeOverlayBtn.textContent = "Cancel";
    let lastPos = null;
    let secondsLeft = HOVER_CAPTURE_SECONDS;
    overlayStatus.textContent = `Hover over the game where you want the counter -- capturing in ${secondsLeft}...`;

    hoverPreviewTimer = setInterval(() => {
      const pos = decodeMousePosition(window.alt1.mousePosition);
      if (pos) {
        lastPos = pos;
        overlay.previewAt(pos.x, pos.y);
      }
    }, 80);

    hoverCountdownTimer = setInterval(() => {
      secondsLeft--;
      if (secondsLeft > 0) {
        overlayStatus.textContent = `Hover over the game where you want the counter -- capturing in ${secondsLeft}...`;
        return;
      }
      if (lastPos) {
        overlay.setPosition(lastPos);
        stopHoverPlacement(settings.overlayEnabled ? "Overlay is on." : "Positioned. Enable the checkbox to show it.");
      } else {
        stopHoverPlacement("Didn't catch your cursor over the game -- make sure the mouse is inside the RS window, then try again.");
      }
    }, 1000);
  }

  placeOverlayBtn.addEventListener("click", () => {
    if (hoverActive) {
      stopHoverPlacement(overlay.position ? (settings.overlayEnabled ? "Overlay is on." : "Positioned. Enable the checkbox to show it.") : "Not positioned yet.");
    } else {
      startHoverPlacement();
    }
  });

  // --- auto-sync (ability GCD) ---
  function autoSyncStatusText(text) {
    autosyncStatus.textContent = text;
  }

  function startAbilityWatcher() {
    const region = loadCalibration(ABILITY_CALIBRATION_KEY);
    if (!region) {
      autoSyncStatusText("Calibrate an ability slot first.");
      autosyncCheckbox.checked = false;
      settings.autosyncEnabled = false;
      saveSettings(settings);
      return;
    }
    if (abilityWatcher) abilityWatcher.stop();
    abilityWatcher = new AutoSyncWatcher(region, triggerSync, autoSyncStatusText, "GCD");
    abilityWatcher.start();
  }

  function stopAbilityWatcher() {
    if (abilityWatcher) {
      abilityWatcher.stop();
      abilityWatcher = null;
    }
  }

  autosyncCheckbox.addEventListener("change", () => {
    settings.autosyncEnabled = autosyncCheckbox.checked;
    saveSettings(settings);
    if (settings.autosyncEnabled) {
      startAbilityWatcher();
    } else {
      stopAbilityWatcher();
      autoSyncStatusText("");
    }
  });

  if (settings.autosyncEnabled) {
    startAbilityWatcher();
  } else {
    const existing = loadCalibration(ABILITY_CALIBRATION_KEY);
    autoSyncStatusText(existing ? "Calibrated. Enable the checkbox to start watching." : "Not calibrated yet.");
  }

  // --- auto-sync (XP drop / RuneMetrics) ---
  // This is one-shot rather than an always-on watcher: click it, do the
  // action you want to sync to, and it stops itself the instant it
  // catches the next change. Watching a whole RuneMetrics panel
  // continuously turned out to be too easy to false-trigger on things
  // that have nothing to do with your own tick timing -- XP/h rates on
  // other tracked skills recalculating on their own schedule, a row
  // highlighting on mouse hover, the scrollbar -- each of which would
  // silently re-sync the metronome and made the count look like it kept
  // "resetting" rather than counting properly. A one-shot catch avoids
  // that: it only ever fires once per click, right when you're actually
  // watching for it.
  const XP_SYNC_TIMEOUT_MS = 8000;
  let xpSyncWaiting = false;
  let xpSyncTimeoutId = null;

  function xpAutoSyncStatusText(text) {
    xpAutosyncStatus.textContent = text;
  }

  function stopXpSyncOnce(status) {
    xpSyncWaiting = false;
    if (xpWatcher) {
      xpWatcher.stop();
      xpWatcher = null;
    }
    if (xpSyncTimeoutId) {
      clearTimeout(xpSyncTimeoutId);
      xpSyncTimeoutId = null;
    }
    xpSyncOnceBtn.textContent = "Sync now from XP/RuneMetrics";
    if (status !== undefined) xpAutoSyncStatusText(status);
  }

  function startXpSyncOnce() {
    const region = loadCalibration(XP_CALIBRATION_KEY);
    if (!region) {
      xpAutoSyncStatusText("Calibrate your XP spot first.");
      return;
    }
    xpSyncWaiting = true;
    xpSyncOnceBtn.textContent = "Cancel (waiting for next XP update...)";
    xpAutoSyncStatusText("Watching -- do the action you want to sync to now.");
    xpWatcher = new AutoSyncWatcher(
      region,
      () => {
        triggerSync();
        stopXpSyncOnce("Synced.");
      },
      () => {},
      "XP drop"
    );
    xpWatcher.start();
    xpSyncTimeoutId = setTimeout(() => {
      stopXpSyncOnce("Didn't catch a change in time -- try again while actively gaining XP.");
    }, XP_SYNC_TIMEOUT_MS);
  }

  xpSyncOnceBtn.addEventListener("click", () => {
    if (xpSyncWaiting) {
      stopXpSyncOnce("Cancelled.");
    } else {
      startXpSyncOnce();
    }
  });

  {
    const existingXp = loadCalibration(XP_CALIBRATION_KEY);
    xpAutoSyncStatusText(existingXp ? "Calibrated. Click \"Sync now\" whenever you want to re-sync from it." : "Not calibrated yet.");
  }

  // ==========================================================================
  // Hover-to-calibrate -- shared by the ability-slot region and the
  // XP/RuneMetrics region (both auto-sync sources). Same idea as the
  // overlay counter's own hover placement above: hover the spot in-game
  // and hold still rather than clicking a shrunk, zoomed screenshot in a
  // little in-app preview, which was fiddly to line up precisely. A live
  // rectangle outline (drawn with the game's own overlay, at whatever
  // width/height is set below) follows the cursor so you can see exactly
  // what will be watched before it locks in.
  // ==========================================================================

  const REGION_PREVIEW_GROUP = "rs3metronomeRegionPreview";
  let regionHoverActive = false;
  let regionHoverKind = null; // "ability" | "xp"
  let regionHoverPreviewTimer = null;
  let regionHoverCountdownTimer = null;

  function regionSizeInputs(kind) {
    return kind === "ability"
      ? { width: abilityWidthInput, height: abilityHeightInput }
      : { width: xpWidthInput, height: xpHeightInput };
  }

  function clampedRegionSize(kind) {
    const { width, height } = regionSizeInputs(kind);
    return {
      w: Math.max(8, Math.min(800, parseInt(width.value, 10) || 34)),
      h: Math.max(8, Math.min(800, parseInt(height.value, 10) || 34)),
    };
  }

  function drawRegionPreview(x, y, w, h) {
    if (!window.alt1 || !window.alt1.permissionOverlay) return;
    try {
      window.alt1.overLayClearGroup(REGION_PREVIEW_GROUP);
      window.alt1.overLaySetGroup(REGION_PREVIEW_GROUP);
      window.alt1.overLayRect(A1lib.mixColor(255, 204, 51, 255), Math.round(x - w / 2), Math.round(y - h / 2), w, h, 200, 2);
    } catch (e) {
      // ignore
    }
  }

  function clearRegionPreview() {
    if (window.alt1 && window.alt1.permissionOverlay) {
      try {
        window.alt1.overLayClearGroup(REGION_PREVIEW_GROUP);
      } catch (e) {
        // ignore
      }
    }
  }

  function stopRegionHover(status) {
    const kind = regionHoverKind;
    regionHoverActive = false;
    regionHoverKind = null;
    if (regionHoverPreviewTimer) { clearInterval(regionHoverPreviewTimer); regionHoverPreviewTimer = null; }
    if (regionHoverCountdownTimer) { clearInterval(regionHoverCountdownTimer); regionHoverCountdownTimer = null; }
    clearRegionPreview();
    calibrateBtn.textContent = "Calibrate ability slot (hover)...";
    calibrateXpBtn.textContent = "Calibrate XP orb/indicator (hover)...";
    calibrateBtn.disabled = false;
    calibrateXpBtn.disabled = false;
    if (status !== undefined && kind) {
      (kind === "ability" ? autoSyncStatusText : xpAutoSyncStatusText)(status);
    }
  }

  function startRegionHover(kind) {
    if (!window.alt1) {
      generalStatus.textContent = "Alt1 isn't available.";
      return;
    }
    if (!window.alt1.permissionGameState) {
      (kind === "ability" ? autoSyncStatusText : xpAutoSyncStatusText)('Needs the "Game state" permission to track your cursor -- you may need to remove and re-add the app once for the new permission to take effect.');
      return;
    }
    if (!window.alt1.permissionPixel) {
      (kind === "ability" ? autoSyncStatusText : xpAutoSyncStatusText)("Alt1 pixel permission isn't granted -- needed to actually watch the spot once calibrated.");
      return;
    }

    regionHoverActive = true;
    regionHoverKind = kind;
    const btn = kind === "ability" ? calibrateBtn : calibrateXpBtn;
    const otherBtn = kind === "ability" ? calibrateXpBtn : calibrateBtn;
    const statusFn = kind === "ability" ? autoSyncStatusText : xpAutoSyncStatusText;
    btn.textContent = "Cancel";
    otherBtn.disabled = true;

    let lastPos = null;
    let secondsLeft = HOVER_CAPTURE_SECONDS;
    statusFn(`Hover over the spot to watch -- capturing in ${secondsLeft}...`);

    regionHoverPreviewTimer = setInterval(() => {
      const pos = decodeMousePosition(window.alt1.mousePosition);
      if (pos) {
        lastPos = pos;
        const { w, h } = clampedRegionSize(kind);
        drawRegionPreview(pos.x, pos.y, w, h);
      }
    }, 80);

    regionHoverCountdownTimer = setInterval(() => {
      secondsLeft--;
      if (secondsLeft > 0) {
        statusFn(`Hover over the spot to watch -- capturing in ${secondsLeft}...`);
        return;
      }
      if (!lastPos) {
        stopRegionHover("Didn't catch your cursor over the game -- make sure the mouse is inside the RS window, then try again.");
        return;
      }
      const { w, h } = clampedRegionSize(kind);
      const region = {
        x: Math.round((window.alt1.rsX || 0) + lastPos.x - w / 2),
        y: Math.round((window.alt1.rsY || 0) + lastPos.y - h / 2),
        w,
        h,
      };
      if (kind === "ability") {
        saveCalibration(ABILITY_CALIBRATION_KEY, region);
        stopRegionHover("Calibrated. Enable the checkbox to start watching.");
        if (settings.autosyncEnabled) startAbilityWatcher();
      } else {
        saveCalibration(XP_CALIBRATION_KEY, region);
        stopRegionHover('Calibrated. Click "Sync now" whenever you want to re-sync from it.');
      }
    }, 1000);
  }

  calibrateBtn.addEventListener("click", () => {
    if (regionHoverActive && regionHoverKind === "ability") stopRegionHover("Cancelled.");
    else if (!regionHoverActive) startRegionHover("ability");
  });
  calibrateXpBtn.addEventListener("click", () => {
    if (regionHoverActive && regionHoverKind === "xp") stopRegionHover("Cancelled.");
    else if (!regionHoverActive) startRegionHover("xp");
  });
});
