# Infinity

Training, food and kitchen app for two people on one phone: three short workouts a
week each with one-tap set logging, food logging by tapping usuals or typing, the
cook's weekly menu with Hinglish messages and groceries, class calendar, progress.
Everything is editable in Settings (the sliders icon, top right).

## Files

Plain scripts loaded in this order; they share one global scope.

| File | What it holds |
|---|---|
| `data.js` | Default content: exercise library (videos, cues, alternatives), sessions, meals, schedule, targets |
| `food.js`, `fooddb.js` | The cook's dishes and add-ons; the 238-item food bank |
| `core.js` | Storage (`Store`), migrations, dates, shared helpers, header, render, event wiring, base actions |
| `train.js` | Progression, workout flow, the Train tab, rest timer, exercise swaps |
| `eat.js` | Food log: usuals, the plain-language parser, add sheet, party mode |
| `kitchen.js` | Cook planner: week menu, messages, groceries |
| `screens.js` | Today, Progress (heat map, strength, check-in, photos), Settings |
| `sync.js` | Undo, file and GitHub backup, start-up |
| `native.js`, `calendar.js` | Native-shell bridge (unused on the web) and the Outlook class calendar |
| `styles.css` | Look and feel (light + dark). Lime = do this / done; blue = Ronit, pink = Yashvi |
| `sw.js`, `manifest.webmanifest`, `icons/` | Installable web app: home-screen icon, full screen, works offline (videos need internet) |

No build step and no dependencies. Serve the folder over HTTPS.

## Install on iPhone

1. Open the hosted URL in **Safari** (not Chrome).
2. Share button → **Add to Home Screen**.
3. Open it from the home-screen icon. Data stays on the phone; export a backup from Settings → Backup every week or two.

## Updating content

Edit `data.js` for defaults that should apply on a fresh install. Changes made
in the app's Settings are stored on the phone and are not overwritten by
updates; new exercises and sessions added to `data.js` are merged in on next
open.

After changing any file, bump the `?v=` number in `index.html` and the `CACHE`
name in `sw.js` so phones pick up the new version.

## Videos

YouTube embeds (`youtube.com/embed/<id>`). Every default id was checked with
YouTube's oEmbed endpoint on 2026-10-08 to confirm it exists and allows
embedding. Re-check with:

```bash
curl -s -o /dev/null -w "%{http_code}" "https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=<id>&format=json"
```

200 = fine; 401 = embedding disabled; 404 = gone.

## Run locally

```bash
python -m http.server 8765 --directory projects/2026-10-fitness-app/output/app
```

## Path to the App Store (later)

Wrap this folder with Capacitor (`npx cap add ios`), build in the cloud on a
macOS runner (GitHub Actions or Codemagic), ship via TestFlight. Needs an
Apple Developer account ($99/yr). Before public release: replace localStorage
with an account-backed store, add onboarding that generates a plan per user,
and a privacy policy.
