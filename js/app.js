(() => {
  "use strict";

  const AUDIO_EXT = ["mp3", "m4a", "aac", "ogg", "oga", "wav", "flac", "opus"];
  const CACHE_KEY = "spool_track_cache_v1";
  const STATE_KEY = "spool_state_v1";

  const audio = document.getElementById("audio");
  const el = {
    statusDot: document.getElementById("statusDot"),
    statusText: document.getElementById("statusText"),
    disc: document.getElementById("disc"),
    trackCounter: document.getElementById("trackCounter"),
    trackTitle: document.getElementById("trackTitle"),
    trackSub: document.getElementById("trackSub"),
    timeCurrent: document.getElementById("timeCurrent"),
    timeDuration: document.getElementById("timeDuration"),
    scrubber: document.getElementById("scrubber"),
    shuffleBtn: document.getElementById("shuffleBtn"),
    prevBtn: document.getElementById("prevBtn"),
    playBtn: document.getElementById("playBtn"),
    playIcon: document.getElementById("playIcon"),
    nextBtn: document.getElementById("nextBtn"),
    repeatBtn: document.getElementById("repeatBtn"),
    playlist: document.getElementById("playlist"),
    emptyNote: document.getElementById("emptyNote"),
    syncBtn: document.getElementById("syncBtn"),
  };

  let tracks = [];        // [{name, title, url}]
  let order = [];         // playback order (indices into tracks), reshuffled when shuffle toggles
  let posInOrder = 0;     // position within `order`
  let shuffle = false;
  let repeatMode = "off"; // "off" | "all" | "one"
  let isSeeking = false;

  // ---------- helpers ----------

  const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });

  function titleFromFilename(name) {
    const noExt = name.replace(/\.[^.]+$/, "");
    return noExt.replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim();
  }

  function fmtTime(sec) {
    if (!isFinite(sec) || sec < 0) return "0:00";
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60).toString().padStart(2, "0");
    return `${m}:${s}`;
  }

  function setStatus(kind, text) {
    el.statusDot.className = "status-dot" + (kind ? " " + kind : "");
    el.statusText.textContent = text;
  }

  function saveState() {
    try {
      localStorage.setItem(STATE_KEY, JSON.stringify({
        currentTrackIndex: order.length ? order[posInOrder] : null,
        shuffle, repeatMode,
        volume: audio.volume,
      }));
    } catch (_) { /* ignore quota errors */ }
  }

  function loadState() {
    try {
      return JSON.parse(localStorage.getItem(STATE_KEY) || "{}");
    } catch (_) { return {}; }
  }

  // ---------- fetching the track list from GitHub ----------

  async function fetchTracks() {
    setStatus("busy", "syncing");
    const { owner, repo, branch, path } = SPOOL_CONFIG;
    const api = `https://api.github.com/repos/${owner}/${repo}/contents/${encodeURIComponent(path)}?ref=${encodeURIComponent(branch)}`;

    try {
      const res = await fetch(api, { headers: { Accept: "application/vnd.github+json" } });
      if (!res.ok) throw new Error(`GitHub API ${res.status}`);
      const data = await res.json();

      const files = data
        .filter(item => item.type === "file")
        .filter(item => AUDIO_EXT.includes((item.name.split(".").pop() || "").toLowerCase()))
        .sort((a, b) => collator.compare(a.name, b.name))
        .map(item => ({ name: item.name, title: titleFromFilename(item.name), url: item.download_url }));

      tracks = files;
      localStorage.setItem(CACHE_KEY, JSON.stringify(tracks));
      setStatus("ok", "synced");
    } catch (err) {
      console.error("SPOOL: could not reach GitHub, falling back to cache", err);
      const cached = localStorage.getItem(CACHE_KEY);
      if (cached) {
        tracks = JSON.parse(cached);
        setStatus("err", "offline (cached list)");
      } else {
        tracks = [];
        setStatus("err", "could not connect");
      }
    }

    buildOrder();
    renderPlaylist();
  }

  function buildOrder() {
    order = tracks.map((_, i) => i);
    if (shuffle) shuffleOrder();
  }

  function shuffleOrder() {
    for (let i = order.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [order[i], order[j]] = [order[j], order[i]];
    }
  }

  // ---------- rendering ----------

  function renderPlaylist() {
    el.playlist.innerHTML = "";
    el.emptyNote.hidden = tracks.length > 0;

    tracks.forEach((track, i) => {
      const li = document.createElement("li");
      li.className = "track-row";
      li.dataset.index = String(i);

      const num = document.createElement("span");
      num.className = "num";
      num.textContent = String(i + 1).padStart(3, "0");

      const name = document.createElement("span");
      name.className = "name";
      name.textContent = track.title;

      li.appendChild(num);
      li.appendChild(name);

      li.addEventListener("click", () => {
        const pos = order.indexOf(i);
        posInOrder = pos >= 0 ? pos : 0;
        playCurrent();
      });

      el.playlist.appendChild(li);
    });

    highlightActiveRow();
  }

  function highlightActiveRow() {
    const activeIndex = order.length ? order[posInOrder] : -1;
    [...el.playlist.children].forEach(li => {
      const isActive = Number(li.dataset.index) === activeIndex;
      li.classList.toggle("active", isActive);
      const existingMark = li.querySelector(".playing-mark");
      if (isActive && !existingMark) {
        const mark = document.createElement("span");
        mark.className = "playing-mark";
        mark.innerHTML = "<span></span><span></span><span></span>";
        li.appendChild(mark);
      } else if (!isActive && existingMark) {
        existingMark.remove();
      }
    });
  }

  function updateNowPlayingUI() {
    const trackIndex = order.length ? order[posInOrder] : null;
    const track = trackIndex !== null ? tracks[trackIndex] : null;

    el.trackCounter.textContent = order.length
      ? `${String(posInOrder + 1).padStart(3, "0")} / ${String(order.length).padStart(3, "0")}`
      : "— / —";
    el.trackTitle.textContent = track ? track.title : "Nothing loaded yet";
    el.trackSub.textContent = track ? track.name : "Add files to your music folder to begin";

    if (track && "mediaSession" in navigator) {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: track.title,
        artist: "SPOOL",
        album: SPOOL_CONFIG.repo,
      });
    }
  }

  // ---------- playback ----------

  function playCurrent() {
    if (!order.length) return;
    const trackIndex = order[posInOrder];
    const track = tracks[trackIndex];
    if (!track) return;

    if (audio.dataset.loadedUrl !== track.url) {
      audio.src = track.url;
      audio.dataset.loadedUrl = track.url;
    }
    updateNowPlayingUI();
    highlightActiveRow();

    audio.play().catch(err => console.warn("SPOOL: play() was blocked", err));
    saveState();
  }

  function togglePlay() {
    if (!order.length) return;
    if (audio.paused) {
      if (!audio.src) playCurrent();
      else audio.play().catch(err => console.warn("SPOOL: play() was blocked", err));
    } else {
      audio.pause();
    }
  }

  function stepTrack(dir) {
    if (!order.length) return;
    posInOrder = (posInOrder + dir + order.length) % order.length;
    playCurrent();
  }

  function handleEnded() {
    if (repeatMode === "one") {
      audio.currentTime = 0;
      audio.play();
      return;
    }
    const atEnd = posInOrder === order.length - 1;
    if (atEnd && repeatMode === "off") {
      audio.pause();
      audio.currentTime = 0;
      updatePlayIcon(false);
      return;
    }
    stepTrack(1);
  }

  function updatePlayIcon(playing) {
    el.playIcon.innerHTML = playing
      ? '<path d="M7 5h4v14H7zM13 5h4v14h-4z"/>'
      : '<path d="M8 5v14l11-7L8 5z"/>';
    el.playBtn.title = playing ? "Pause" : "Play";
    el.disc.classList.toggle("spinning", playing);
    if ("mediaSession" in navigator) {
      navigator.mediaSession.playbackState = playing ? "playing" : "paused";
    }
  }

  // ---------- events: transport ----------

  el.playBtn.addEventListener("click", togglePlay);
  el.prevBtn.addEventListener("click", () => stepTrack(-1));
  el.nextBtn.addEventListener("click", () => stepTrack(1));

  el.shuffleBtn.addEventListener("click", () => {
    shuffle = !shuffle;
    el.shuffleBtn.setAttribute("aria-pressed", String(shuffle));
    const currentTrackIndex = order.length ? order[posInOrder] : null;
    buildOrder();
    if (currentTrackIndex !== null) {
      posInOrder = order.indexOf(currentTrackIndex);
    }
    highlightActiveRow();
    saveState();
  });

  el.repeatBtn.addEventListener("click", () => {
    repeatMode = repeatMode === "off" ? "all" : repeatMode === "all" ? "one" : "off";
    el.repeatBtn.setAttribute("aria-pressed", String(repeatMode !== "off"));
    el.repeatBtn.title = repeatMode === "one" ? "Repeat one" : repeatMode === "all" ? "Repeat all" : "Repeat";
    saveState();
  });

  el.syncBtn.addEventListener("click", fetchTracks);

  // ---------- events: audio element ----------

  audio.addEventListener("play", () => updatePlayIcon(true));
  audio.addEventListener("pause", () => updatePlayIcon(false));
  audio.addEventListener("ended", handleEnded);

  audio.addEventListener("loadedmetadata", () => {
    el.timeDuration.textContent = fmtTime(audio.duration);
    el.scrubber.max = String(Math.floor(audio.duration || 0) || 1000);
  });

  audio.addEventListener("timeupdate", () => {
    if (isSeeking) return;
    el.timeCurrent.textContent = fmtTime(audio.currentTime);
    el.scrubber.value = String(Math.floor(audio.currentTime));
  });

  el.scrubber.addEventListener("input", () => {
    isSeeking = true;
    el.timeCurrent.textContent = fmtTime(Number(el.scrubber.value));
  });
  el.scrubber.addEventListener("change", () => {
    audio.currentTime = Number(el.scrubber.value);
    isSeeking = false;
  });

  // ---------- Media Session (lock screen controls) ----------

  if ("mediaSession" in navigator) {
    navigator.mediaSession.setActionHandler("play", () => audio.play());
    navigator.mediaSession.setActionHandler("pause", () => audio.pause());
    navigator.mediaSession.setActionHandler("previoustrack", () => stepTrack(-1));
    navigator.mediaSession.setActionHandler("nexttrack", () => stepTrack(1));
    navigator.mediaSession.setActionHandler("seekto", (details) => {
      if (details.seekTime != null) audio.currentTime = details.seekTime;
    });
  }

  // keep playing across a screen lock / app switch: nothing extra to do here —
  // the browser handles it as long as this tab/PWA instance stays alive.
  // saveState() lets us restore your place if the OS ever kills the tab.
  window.addEventListener("visibilitychange", saveState);
  window.addEventListener("pagehide", saveState);

  // ---------- service worker (offline shell + replay caching) ----------

  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("sw.js").catch(err => console.warn("SPOOL: SW registration failed", err));
    });
  }

  // ---------- boot ----------

  (async function init() {
    updatePlayIcon(false);
    const cached = localStorage.getItem(CACHE_KEY);
    if (cached) {
      try { tracks = JSON.parse(cached); buildOrder(); renderPlaylist(); updateNowPlayingUI(); } catch (_) {}
    }
    await fetchTracks();

    const saved = loadState();
    if (typeof saved.volume === "number") audio.volume = saved.volume;
    if (saved.shuffle) {
      shuffle = true;
      el.shuffleBtn.setAttribute("aria-pressed", "true");
      buildOrder();
    }
    if (saved.repeatMode) {
      repeatMode = saved.repeatMode;
      el.repeatBtn.setAttribute("aria-pressed", String(repeatMode !== "off"));
    }
    if (typeof saved.currentTrackIndex === "number") {
      const pos = order.indexOf(saved.currentTrackIndex);
      if (pos >= 0) posInOrder = pos;
    }
    updateNowPlayingUI();
    highlightActiveRow();
  })();

})();
