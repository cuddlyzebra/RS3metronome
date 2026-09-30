# RS3 Tick Metronome

An [Alt1 Toolkit](https://runeapps.org/alt1) app that keeps a steady beat on RuneScape 3's 600ms game tick, with a visual flash, an audio click, and an optional transparent overlay counter drawn right on top of the game -- similar to the tick-timer metronome tools OSRS players use, adapted for RS3's tick length.

![The app's main screen](media/app-main-screen.png)

## What would I use this for?

Anything where "exactly how many ticks until my next action" matters more than a rough feel for it:

- **Tick-perfect skilling methods.** Plenty of training methods depend on acting again the instant the current tick cycle completes, not "as soon as it looks done" -- the flash and click give you a precise, consistent beat to act on rather than eyeballing an animation.
- **Learning a new timing-sensitive method.** Set "Count to" to however many ticks your method's cycle takes, and use the accented arrival tick as a metronome click to build the muscle memory for landing it consistently.
- **Any fixed-tick timing you're tracking manually today** -- resource respawns, buff reapplication, anything you currently count out in your head.

The overlay is the main payoff -- it sits wherever you place it and counts up in real time over live gameplay, no alt-tabbing to a separate window:

![Transparent overlay counting 1 to 4 during a skilling session](media/overlay-showcase.gif)

## Install

Requires the [Alt1 Toolkit app](https://runeapps.org/alt1) (free, official RuneScape add-on). With Alt1 running:

```
alt1://addapp/https://cuddlyzebra.github.io/RS3metronome/appconfig.json
```

Click that link (or paste it into your browser) while Alt1 is running, and it'll offer to add the app.

## Why this exists

Almost everything in RS3 that's timed happens in whole multiples of the game's 600ms server tick -- movement, skilling actions, and plenty else besides. Knowing exactly where you are in that beat, in real time, helps with any tick-based timing you're doing. This app is a dedicated, always-on-top metronome for that beat, rather than something built into a specific tool.

## How it works

### The beat

A drift-corrected 600ms scheduler fires every tick. Each tick:

- Advances a counter from 1 up to whatever you've set "Count to" as (3 by default, for the 1.8s GCD), then wraps back to 1. The number changes instantly -- no fade or slide -- both in the app window and on the overlay.
- Plays a short click -- a lower "tock" on ordinary ticks, and (if "accent" is on) a higher-pitched "tick" the instant it *arrives* on the tick you're counting to, so you can hear that boundary without looking.
- Flashes the on-screen dial and the whole app window, but only on that arrival tick -- not on every tick. If you're counting to 3, you'll see 1, 2, 3(flash), 1, 2, 3(flash)... rather than a flash every beat.

### Staying in sync

The metronome runs freely from whenever you hit Start, which won't line up with the server's actual tick boundary on its own. A few ways to correct that:

- **Tap to sync (reliable, always available).** The instant you see an XP drop or an update in your RuneMetrics tab, click "Tap to sync". That instant becomes the new tick 0, and everything schedules from there. This is the same technique real OSRS tick tools rely on, and it works regardless of your UI layout.
- **Sync from RuneMetrics (experimental).** RuneMetrics only ever updates on a game tick, and it doesn't matter which value moves -- an XP total, an XP/h rate, anything -- any change in the panel is itself a valid tick signal, which is why this watches the whole tab rather than one exact number. Open the RuneMetrics tab (press F7 if it's not bound to anything else) with **"Show precise values"** and **"Show XP change value"** turned on. Click "Calibrate RuneMetrics tab (hover)...", then hover your mouse over the panel in-game -- a live outline follows your cursor and locks in after a few seconds; widen the spot size first if it doesn't cover the whole panel.

  **This has to be calibrated on the RuneMetrics tab itself, not the "+93 xp" text that floats above your character in the world** -- that text drifts with every camera turn, which breaks a region watch. RuneMetrics stays fixed regardless of camera movement, and keeps working at any level, including 200m XP in a skill.

  Click "Sync now from XP/RuneMetrics" whenever you want to re-sync, then do the action you want to sync to -- it catches the very next detected change in the panel and stops watching immediately afterwards, so it's tuned to fire on essentially any change at all rather than waiting for an obviously large one. This is deliberately one-shot rather than an always-on watcher: an earlier version kept watching continuously, but a whole RuneMetrics panel has enough going on -- other tracked skills' XP/h recalculating on their own schedule, a row highlighting on mouse hover -- that it would re-sync on things that had nothing to do with the moment you actually wanted to sync to, and the count looked like it kept resetting instead of counting properly. One-shot avoids all of that: it only ever fires once per click, exactly when you're watching for it.

  One quirk to know about: RuneMetrics can land a tick or so later than the actual in-game event (the game confirms it slightly after the fact). If it consistently lands a tick late, set **Sync offset (ms)** to -600 to correct for it.

### Transparent overlay counter

The count can also be drawn directly on top of the game itself -- just the number, no background or window around it, positioned wherever you like. Click "Place overlay position (hover)...", then hover your mouse over the game where you want the counter -- a live preview follows your cursor in real time, and after a few seconds it locks in wherever you were last hovering (a status line counts down so you know when). Click the button again (it becomes "Cancel") if you want to back out mid-countdown. Then tick "Show overlay counter in-game". It changes instantly on each tick, same as the number in the app window. Size and color (gold/white/red/green/cyan) are both adjustable.

### Calibrating (RuneMetrics tab, or overlay position)

Both of these are calibrated the same way: click the relevant "...(hover)..." button, then hover your mouse over the spot in-game and hold still. A live preview -- an outline of the watched box for RuneMetrics, or the number itself for the overlay counter -- follows your cursor in real time, so you can see exactly what you're about to lock in, and it captures automatically after a few seconds (a status line counts down). Click the button again (it becomes "Cancel") to back out. For RuneMetrics, set the width/height fields above the button *before* clicking if the default 50x50 doesn't suit -- widen them generously to cover the whole panel.

This all needs the "Game state" permission (for reading your live cursor position) alongside the existing pixel and overlay ones -- if you installed the app before this feature existed, you may need to remove and re-add it once for Alt1 to prompt for the new permission.

### Settings

- **Output**: visual + audio, visual only, or audio only.
- **Count to (ticks)**: defaults to 3 (the GCD), but set it to whatever run length you're tracking.
- **Volume** and whether the arrival tick is accented (a distinct tone, and the flash).
- **Sync offset (ms)**: shifts exactly when a sync (tap or auto) actually lands, -600 to +600ms. See the auto-sync note above -- this is the main knob for correcting a sync source that's consistently early or late.

All settings and your calibration are saved locally on your own computer (not synced anywhere) and persist across restarts.

## Troubleshooting

- **Auto-sync fires at the wrong moment.** See the Sync offset note above -- this is almost always a fixed-timing issue, not a broken detector.
- **XP sync never catches anything (or "Sync now" times out).** You've likely calibrated on the text that floats above your character rather than the RuneMetrics tab itself -- the floating text moves with the camera and drifts out of a watched spot almost immediately. Recalibrate on the RuneMetrics tab (Show precise values + Show XP change value on), making sure the tab is actually open and visible in-game.
- **The metronome count kept jumping back to 1 / looked like it was "resetting" while auto-sync was on.** This was a real issue with an earlier version, where RuneMetrics auto-sync ran continuously and re-synced on anything that changed in the panel, not just the moment you actually wanted to sync to. It's now one-shot ("Sync now from XP/RuneMetrics") instead -- click it right before the action you want to sync to, rather than leaving it running.
- **"Calibrated spot is off-screen".** The game window moved or was resized since you calibrated -- recalibrate.
- **Overlay counter doesn't show.** Make sure you've both placed a position *and* ticked "Show overlay counter in-game", and that the metronome is actually running (Start).
- **"Needs the Game state permission" when calibrating anything.** Remove and re-add the app once so Alt1 prompts for the new permission -- this was added alongside hover-based calibration and older installs won't have it yet.
- **Hover calibration says it didn't catch your cursor.** Your mouse needs to be over the RS game window (not this app, not another monitor) when the countdown reaches zero -- try again and keep it steady on the target spot until the status line confirms.
- **Nothing happens when clicking install.** Make sure Alt1 is running first -- the `alt1://` link needs Alt1 registered as a protocol handler, which only happens once Alt1's been installed and run at least once.

## What's next

- Possibly: a keybind for "tap to sync" that works even when the app isn't focused, if Alt1's binding API supports it cleanly.

## Credit

Tick mechanics reference: general RuneScape 3 community knowledge of the 600ms game tick and the 1.8s/3-tick global ability cooldown. This app is an original build.
