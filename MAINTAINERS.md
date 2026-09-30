# Maintainer notes

Not for players -- this is for whoever owns the `cuddlyzebra/RS3metronome` repo and needs to push updates.

Repo: [github.com/cuddlyzebra/RS3metronome](https://github.com/cuddlyzebra/RS3metronome)

## First-time setup

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
4. Wait a minute or two, then `alt1://addapp/https://cuddlyzebra.github.io/RS3metronome/appconfig.json` should work.

## Pushing an update

From inside the project folder:
```
git add .
git commit -m "<describe the change>"
git push
```
Alt1 apps installed from the Pages URL pick up changes automatically the next time the player opens the app -- no reinstall needed, unless `appconfig.json` itself changed in a way Alt1 needs to re-read (e.g. new permissions), in which case the player may need to remove and re-add the app once.
