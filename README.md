# RS3 Tick Metronome

An [Alt1 Toolkit](https://runeapps.org/alt1) app that keeps a steady beat on RuneScape 3's 600ms game tick, with a visual flash, an audio click, and an optional transparent overlay counter drawn right on top of the game -- similar to the tick-timer metronome tools OSRS players use, adapted for RS3's tick length and its ability GCD.

## Install

Requires the [Alt1 Toolkit app](https://runeapps.org/alt1) (free, official RuneScape add-on). With Alt1 running:

```
alt1://addapp/https://cuddlyzebra.github.io/RS3metronome/appconfig.json
```

Click that link (or paste it into your browser) while Alt1 is running, and it'll offer to add the app.

## Why this exists

Almost everything in RS3 that's timed happens in whole multiples of the game's 600ms server tick -- movement, combat, and notably the global ability cooldown (1.8s = exactly 3 ticks) after you use an ability. Knowing exactly where you are in that beat, in real time, helps with ability queuing and rotation timing. This app is a dedicated, always-on-top metronome for that beat, rather than something built into a specific rotation tool.

## How it works

### The beat

A drift-corrected 600ms scheduler fires every tick. Each tick:

- Advances a counter from 1 up to whatever you've set "Count to" as (3 by default, for the 1.8s GCD), then wraps back to 1. The number changes instantly -- no fade or slide -- both in the app window and on the overlay.
- Plays a short click -- a lower "tock" on ordinary ticks, and (if "accent" is on) a higher-pitched "tick" the instant it *arrives* on the tick you're counting to, so you can hear that boundary without looking.
- Flashes the on-screen dial and the whole app window, but only on that arrival tick -- not on every tick. If you're counting to 3, you'll see 1, 2, 3(flash), 1, 2, 3(flash)... rather than a flash every beat.

### Staying in sync

The metronome runs freely from whenever you hit Start, which won't line up with the server's actual tick boundary on its own. Two ways to correct that:

- **Tap to sync (reliable, always available).** The instant you see an XP drop or watch a GCD sweep start on your ability bar, click "Tap to sync". That instant becomes the new tick 0, and everything schedules from there. This is the same technique real OSRS tick tools rely on, and it works regardless of your UI layout.
- **Auto-sync off your ability bar (experimental).** RS3 sweeps a visible cooldown overlay across an ability's icon the instant its GCD starts -- a large, sudden pixel change confined to just that icon. The app can watch a small screen region for that change and re-sync automatically. Since everyone's ability bar sits in a different place at a different UI scale, there's a one-time calibration: click "Calibrate ability slot...", click the ability icon you want watched in the captured screenshot, and it's saved. Turn on "Enable auto-sync" to start watching. If you move or rescale your UI later, just recalibrate.

  This part is genuinely experimental. If it fires too early or too late relative to the real cooldown -- likely, since the ability icon may show some instant client-side "pressed" feedback the moment you click, before the server actually confirms the ability and the real cooldown sweep starts on the next tick, up to 600ms later -- use **Sync offset (ms)** in Settings: watch the metronome against real gameplay for a few GCDs and nudge it (positive = later, negative = earlier) until the arrival tick lines up with when your ability actually comes off cooldown. The same offset also applies to manual tap-to-sync, so it doubles as a reaction-time correction if you tend to tap a bit after the cue.

  XP-drop-based auto-sync isn't implemented yet -- it'd need reading the XP counter's digits via OCR, which is more involved than a simple pixel-change watch and doesn't fire on ticks where you don't gain XP anyway. GCD-based sync covers the common case (actively using abilities) more simply.

### Transparent overlay counter

The count can also be drawn directly on top of the game itself -- just the number, no background or window around it, positioned wherever you like. Click "Place overlay position...", click the spot in the captured screenshot, then tick "Show overlay counter in-game". It changes instantly on each tick, same as the number in the app window. Size and color (gold/white/red/green/cyan) are both adjustable.

### Calibrating (ability slot or overlay position)

Both the auto-sync ability slot and the overlay position use the same click-to-place screenshot picker. The captured screenshot is your whole game window shrunk to fit the preview, which can make it hard to click exactly the right pixel -- **scroll the mouse wheel over the preview to zoom in around wherever your cursor is**, right down to individual pixels, then click. "Reset zoom" goes back to the full view.

### Settings

- **Output**: visual + audio, visual only, or audio only.
- **Count to (ticks)**: defaults to 3 (the GCD), but set it to whatever run length you're tracking.
- **Volume** and whether the arrival tick is accented (a distinct tone, and the flash).
- **Sync offset (ms)**: shifts exactly when a sync (tap or auto) actually lands, -600 to +600ms. See the auto-sync note above -- this is the main knob for correcting a sync source that's consistently early or late.

All settings and your calibration are saved locally on your own computer (not synced anywhere) and persist across restarts.

## Troubleshooting

- **Auto-sync fires at the wrong moment.** See the Sync offset note above -- this is almost always a fixed-timing issue, not a broken detector.
- **"Calibrated slot is off-screen".** The game window moved or was resized since you calibrated -- recalibrate.
- **Overlay counter doesn't show.** Make sure you've both placed a position *and* ticked "Show overlay counter in-game", and that the metronome is actually running (Start).
- **Nothing happens when clicking install.** Make sure Alt1 is running first -- the `alt1://` link needs Alt1 registered as a protocol handler, which only happens once Alt1's been installed and run at least once.

## What's next

- Possibly: XP-drop-based auto-sync as a second trigger source, if GCD-based sync doesn't prove reliable enough alone.
- Possibly: a keybind for "tap to sync" that works even when the app isn't focused, if Alt1's binding API supports it cleanly.

## Credit

Tick mechanics reference: general RuneScape 3 community knowledge of the 600ms game tick and the 1.8s/3-tick global ability cooldown. This app is an original build.
