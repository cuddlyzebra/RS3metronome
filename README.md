# RS3 Tick Metronome

A standalone Alt1 Toolkit app that keeps a steady beat on RuneScape 3's 600ms game tick, with both a visual flash and an audio click -- similar to the tick-timer metronome tools OSRS players use, adapted for RS3's tick length and its ability GCD.

## Why this exists

Almost everything in RS3 that's timed happens in whole multiples of the game's 600ms server tick -- movement, combat, and notably the global ability cooldown (1.8s = exactly 3 ticks) after you use an ability. Knowing exactly where you are in that beat, in real time, helps with ability queuing and rotation timing. This app is a dedicated, always-on-top metronome for that beat, rather than something built into a specific rotation tool.

## How it works

### The beat

A drift-corrected 600ms scheduler (anchored to a single start time via `performance.now()`, recomputing the delay to the next absolute tick instant every time, rather than a naive `setInterval` that slowly drifts) fires a callback every tick. Each tick:

- Flashes the on-screen dial and, optionally, the whole app window briefly.
- Plays a short synthesized click (no external sound files) -- a higher-pitched "tick" on the first beat of your count, a lower "tock" on the rest, so you can tell the count boundary by ear.
- Advances a counter from 1 up to whatever you've set "Count to" as (3 by default, for the 1.8s GCD), then wraps back to 1.

### Staying in sync

The metronome runs freely from whenever you hit Start, which won't line up with the server's actual tick boundary on its own. Two ways to correct that:

- **Tap to sync (reliable, always available).** The instant you see an XP drop or watch a GCD sweep start on your ability bar, click "Tap to sync" (or trigger it via a hotkey through Alt1's own binding, if you set one up). That instant becomes the new tick 0, and everything schedules from there. This is the same technique real OSRS tick tools rely on, and it works regardless of your UI layout.
- **Auto-sync off your ability bar (experimental).** RS3 sweeps a visible cooldown overlay across an ability's icon the instant its GCD starts -- a large, sudden pixel change confined to just that icon. The app can watch a small screen region for that change and re-sync automatically. Since everyone's ability bar sits in a different place at a different UI scale, there's no fixed position to hard-code: click "Calibrate ability slot...", click the ability icon you want watched in the captured screenshot, and it's saved. Turn on "Enable auto-sync" to start watching. If you move or rescale your UI later, just recalibrate.

  This part is genuinely experimental -- the pixel-change threshold that decides "a GCD just started" was tuned by eye, not against real gameplay footage. If it fires on things that aren't a GCD start (fires too often) or misses real ones (never fires), send a screenshot of "Test" behavior and it can be retuned, the same iterative way the pixel-detection parts of the other Alt1 apps in this account got dialed in.

  XP-drop-based auto-sync (the other trigger you mentioned) isn't implemented yet -- it needs reading the XP counter's digits via OCR to know a drop happened, which is a fair bit more involved than a simple pixel-change watch and doesn't fire on ticks where you don't gain XP anyway. GCD-based sync covers the common case (you're actively using abilities) more simply. Worth revisiting if the GCD approach doesn't feel reliable enough in practice.

### Settings

- **Output**: visual + audio, visual only, or audio only.
- **Count to (ticks)**: defaults to 3 (the GCD), but set it to whatever run length you're tracking.
- **Volume** and whether the first tick of each count is accented.

All settings and your calibration persist across reloads (stored locally in the app, not synced anywhere).

## What's next

- **Transparent overlay counter**, so the count is visible directly over the game window rather than only inside the app's own frame. Alt1 supports drawing overlay text/shapes on top of the game via its `overlay` permission -- deliberately left out of this first version to keep the permission ask minimal until it's actually built. Flagged as the next thing to add once the core metronome is confirmed working well for you.
- Possibly: XP-drop-based auto-sync as a second trigger source, if GCD-based sync doesn't prove reliable enough alone.
- Possibly: a keybind for "tap to sync" that works even when the app isn't focused, if Alt1's binding API supports it cleanly.

## How to install

```
alt1://addapp/https://cuddlyzebra.github.io/RS3metronome/appconfig.json
```

## Setting this up on GitHub (one-time)

Repo: [github.com/cuddlyzebra/RS3metronome](https://github.com/cuddlyzebra/RS3metronome)

1. If the repo doesn't exist yet, go to [github.com/new](https://github.com/new) and create a new **public** repository named `RS3metronome`. Don't initialize it with a README.
2. Unzip this project's files into a folder, then from inside that folder:
   ```
   git init
   git add .
   git commit -m "Initial RS3 Tick Metronome scaffold"
   git branch -M master
   git remote add origin https://github.com/cuddlyzebra/RS3metronome.git
   git push -u origin master
   ```
3. Enable GitHub Pages: **Settings → Pages**, Source "Deploy from a branch", branch `master`, folder `/ (root)`, Save.
4. Wait a minute or two, then the install link above should work.

## Credit

Tick mechanics reference: general RuneScape 3 community knowledge of the 600ms game tick and the 1.8s/3-tick global ability cooldown. This app is an original build.
