# SPOOL

A tiny, private, ad-free music player. It lists whatever audio files you've pushed into this repo's
`/music` folder and plays them back-to-back — no ads, no video, no algorithm. Runs entirely as a
static site on GitHub Pages.

## 1. Set it up

1. Create a new GitHub repo (public — GitHub Pages on the free tier needs a public repo unless you
   have GitHub Pro/Team/Enterprise).
2. Upload everything in this folder to the repo, keeping the structure as-is.
3. Open `js/config.js` and fill in your details:

   ```js
   const SPOOL_CONFIG = {
     owner:  "your-github-username",
     repo:   "your-repo-name",
     branch: "main",
     path:   "music",
   };
   ```

4. Drop your audio files into `/music` (see `music/README.md` for naming tips) and push.

## 2. Turn on GitHub Pages

In your repo: **Settings → Pages → Build and deployment → Source: Deploy from a branch → Branch:
`main` / `root`**. Save. GitHub will give you a URL like
`https://your-username.github.io/your-repo-name/` — that's your player.

## 3. Using it

- Open the URL. SPOOL fetches the file list from `/music` via the GitHub API and shows it as a
  playlist.
- Tap a track, or hit play. Use shuffle/repeat, or just let it play through.
- Added new songs? Push them, then tap **Re-sync** in the app (or just reload).
- **Add it to your home screen** (browser menu → "Add to Home Screen" / "Install app"). This is the
  single biggest thing you can do to make background playback reliable — see below.

## About "playing with the screen off"

There's no such thing as a website forcing itself to keep running once the OS decides to freeze or
kill the browser tab — that's a genuine platform limit, not something any site (including this one)
can fully override. What SPOOL *does* do to give itself the best possible chance:

- Uses the **Media Session API**, so your lock screen / notification shade shows proper play, pause,
  next, and previous controls, and the OS treats SPOOL as an active media session rather than a
  random background tab.
- Ships a **web app manifest + service worker**, so you can install it as a standalone app icon
  instead of a browser tab. Installed apps are much less likely to be paused or killed by the OS
  than a tab sitting in a stack of thirty others.
- Caches each track the first time it plays, so a repeat listen doesn't need a live connection.

In practice: on Android (Chrome/Edge/Firefox), audio reliably keeps playing through screen lock, and
generally keeps playing in the background even if you switch to another app, as long as you don't
force-close SPOOL. On iOS, install it to the home screen first — background/lock-screen audio from
a plain Safari tab is far less reliable than from an installed app. Either way, avoid manually
swiping the app away from the recent-apps list while music is playing, since that's what actually
kills the process.

## Notes

- The GitHub API used to list files is unauthenticated and rate-limited (60 requests/hour per IP),
  which is plenty for personal use. If you ever hit the limit, the app falls back to the last
  successful listing it cached in your browser.
- Repo size: GitHub is fine for personal audio libraries but isn't built for large media hosting —
  keep an eye on total repo size if you're uploading a lot of high-bitrate files.
- Everything here is plain HTML/CSS/JS — no build step, no dependencies to install.
