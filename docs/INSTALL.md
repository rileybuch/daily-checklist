# Install to iPhone (Add to Home Screen)

The Daily Checklist is a PWA — it installs to your iPhone home screen and its shell
loads even with no signal. There is no App Store step and no build step; you just
add the GitHub Pages URL to your home screen.

## First install

1. Open the GitHub Pages URL in **Safari** on your iPhone
   (e.g. `https://<your-user>.github.io/<repo>/`). Use Safari — Chrome/Firefox on
   iOS cannot add PWAs to the home screen.
2. Tap the **Share** button (the square with an up-arrow) in the toolbar.
3. Scroll down and tap **Add to Home Screen**.
4. Confirm the name shows as **Checklist** with the green check icon, then tap **Add**.
5. Tap the new **Checklist** icon on your home screen. The app opens
   **standalone** — full screen, no Safari address bar or toolbar — and the Today
   view is interactive within a few seconds.

The first time you open it, enter your shared-secret token and Web App URL when
prompted (stored on-device in `localStorage`). Append `?demo=1` to the URL first if
you just want to try it with sample data.

## Using it offline

Once you've opened the installed app at least once, the app shell (HTML/CSS/JS/icons)
is cached by the service worker. In airplane mode or with no signal:

- Tap the home-screen icon — the app **shell still loads from cache** (no blank
  error screen).
- You can view your cached data and log sets. New logs are **queued locally** and
  sync to your Google Sheet automatically the next time you have a connection
  (this is the offline queue from the Today view — the service worker never touches
  those data calls).

## Getting a new release

When a new version ships, the service-worker cache version is bumped. On your next
open, the app activates the new service worker, deletes the old cached shell, and
serves the new assets — no manual reinstall needed. If you ever want to force it,
delete the home-screen icon and re-add it from Safari.
