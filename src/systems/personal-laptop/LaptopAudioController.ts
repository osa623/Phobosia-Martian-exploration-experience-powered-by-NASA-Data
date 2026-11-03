export interface LaptopTrack {
  id: string;
  fileName: string;
  title: string;
  url: string;
  mimeType: string;
  extension: string;
}

export type LaptopRepeatMode = "off" | "all" | "one";

export interface LaptopAudioSnapshot {
  tracks: LaptopTrack[];
  currentTrackId: string | null;
  currentTime: number;
  duration: number;
  volume: number;
  isPlaying: boolean;
  shuffle: boolean;
  repeat: LaptopRepeatMode;
  favorites: string[];
  queue: string[];
  recentlyPlayed: string[];
  error: string | null;
  habitatAudible: boolean;
}

const STORAGE_KEY = "phobosia_personal_laptop_v1";
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

function readSavedState(): Partial<LaptopAudioSnapshot> {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) as Partial<LaptopAudioSnapshot> : {};
  } catch {
    return {};
  }
}

export class LaptopAudioController {
  private readonly audio: HTMLAudioElement;
  private listeners = new Set<(snapshot: Readonly<LaptopAudioSnapshot>) => void>();
  private snapshot: LaptopAudioSnapshot;
  private currentUrl: string | null = null;
  private rampFrame = 0;
  private lastPersistAt = 0;
  private savedPosition = 0;
  private disposed = false;

  constructor() {
    const saved = readSavedState();
    this.snapshot = {
      tracks: [],
      currentTrackId: typeof saved.currentTrackId === "string" ? saved.currentTrackId : null,
      currentTime: 0,
      duration: 0,
      volume: typeof saved.volume === "number" ? clamp(saved.volume, 0, 1) : 0.65,
      isPlaying: false,
      shuffle: Boolean(saved.shuffle),
      repeat: saved.repeat === "all" || saved.repeat === "one" ? saved.repeat : "off",
      favorites: Array.isArray(saved.favorites) ? saved.favorites.filter((item): item is string => typeof item === "string") : [],
      queue: Array.isArray(saved.queue) ? saved.queue.filter((item): item is string => typeof item === "string") : [],
      recentlyPlayed: Array.isArray(saved.recentlyPlayed) ? saved.recentlyPlayed.filter((item): item is string => typeof item === "string") : [],
      error: null,
      habitatAudible: false
    };
    this.savedPosition = typeof saved.currentTime === "number" ? Math.max(0, saved.currentTime) : 0;
    this.audio = new Audio();
    this.audio.preload = "metadata";
    this.audio.volume = 0;
    this.audio.addEventListener("timeupdate", this.onTimeUpdate);
    this.audio.addEventListener("durationchange", this.onDurationChange);
    this.audio.addEventListener("ended", this.onEnded);
    this.audio.addEventListener("error", this.onError);
  }

  public getSnapshot = (): Readonly<LaptopAudioSnapshot> => this.snapshot;

  public subscribe = (listener: (snapshot: Readonly<LaptopAudioSnapshot>) => void): (() => void) => {
    this.listeners.add(listener);
    listener(this.snapshot);
    return () => this.listeners.delete(listener);
  };

  public setLibrary(tracks: LaptopTrack[]) {
    const savedQueue = this.snapshot.queue.filter(id => tracks.some(track => track.id === id));
    this.update({
      tracks,
      queue: savedQueue.length ? savedQueue : tracks.map(track => track.id),
      favorites: this.snapshot.favorites.filter(id => tracks.some(track => track.id === id)),
      recentlyPlayed: this.snapshot.recentlyPlayed.filter(id => tracks.some(track => track.id === id))
    });
    const savedTrack = tracks.find(track => track.id === this.snapshot.currentTrackId);
    if (savedTrack) this.setSource(savedTrack, false);
    else if (tracks.length && this.snapshot.currentTrackId) this.update({ currentTrackId: null, currentTime: 0, duration: 0 });
  }

  public setHabitatAudible(audible: boolean) {
    if (this.snapshot.habitatAudible === audible) return;
    this.update({ habitatAudible: audible });
    const generation = ++this.rampFrame;
    const from = this.audio.volume;
    const to = audible ? this.snapshot.volume : 0;
    const startedAt = performance.now();
    const tick = (now: number) => {
      if (this.disposed || generation !== this.rampFrame) return;
      const progress = clamp((now - startedAt) / 260, 0, 1);
      this.audio.volume = from + (to - from) * progress;
      if (progress < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }

  public async playTrack(trackId: string, queue?: LaptopTrack[]) {
    const track = this.snapshot.tracks.find(item => item.id === trackId);
    if (!track) return;
    if (queue) this.update({ queue: queue.map(item => item.id) });
    const changedTrack = this.snapshot.currentTrackId !== track.id;
    if (changedTrack || this.currentUrl !== track.url) this.setSource(track, true);
    if (changedTrack) this.update({ currentTrackId: track.id, currentTime: 0, duration: 0 });
    this.update({ error: null });
    try {
      await this.audio.play();
      this.update({ isPlaying: true, error: null });
      this.touchRecentlyPlayed(track.id);
      this.persist(true);
    } catch {
      this.update({ isPlaying: false, error: "Playback was blocked. Press Play again to start audio." });
    }
  }

  public async togglePlayback() {
    if (this.audio.paused) {
      if (!this.snapshot.currentTrackId) {
        const first = this.snapshot.tracks[0];
        if (first) await this.playTrack(first.id);
        return;
      }
      try {
        await this.audio.play();
        this.update({ isPlaying: true, error: null });
      } catch {
        this.update({ error: "Playback was blocked. Press Play again to start audio." });
      }
    } else {
      this.audio.pause();
      this.update({ isPlaying: false });
      this.persist(true);
    }
  }

  public async next() {
    const queue = this.queueTracks();
    if (!queue.length) return;
    if (this.snapshot.shuffle && queue.length > 1) {
      const alternatives = queue.filter(track => track.id !== this.snapshot.currentTrackId);
      await this.playTrack(alternatives[Math.floor(Math.random() * alternatives.length)].id);
      return;
    }
    const index = queue.findIndex(track => track.id === this.snapshot.currentTrackId);
    const nextIndex = index + 1;
    if (nextIndex < queue.length) await this.playTrack(queue[nextIndex].id);
    else if (this.snapshot.repeat === "all") await this.playTrack(queue[0].id);
    else this.update({ isPlaying: false });
  }

  public async previous() {
    if (this.audio.currentTime > 3) {
      this.audio.currentTime = 0;
      this.onTimeUpdate();
      return;
    }
    const queue = this.queueTracks();
    if (!queue.length) return;
    const index = queue.findIndex(track => track.id === this.snapshot.currentTrackId);
    const previousIndex = index > 0 ? index - 1 : this.snapshot.repeat === "all" ? queue.length - 1 : 0;
    await this.playTrack(queue[previousIndex].id);
  }

  public seek(time: number) {
    if (!Number.isFinite(this.audio.duration)) return;
    this.audio.currentTime = clamp(time, 0, this.audio.duration);
    this.onTimeUpdate();
  }

  public setVolume(volume: number) {
    const nextVolume = clamp(volume, 0, 1);
    this.rampFrame++;
    this.update({ volume: nextVolume });
    if (this.snapshot.habitatAudible) this.audio.volume = nextVolume;
    this.persist(true);
  }

  public toggleShuffle() {
    this.update({ shuffle: !this.snapshot.shuffle });
    this.persist(true);
  }

  public cycleRepeat() {
    const repeat: LaptopRepeatMode = this.snapshot.repeat === "off" ? "all" : this.snapshot.repeat === "all" ? "one" : "off";
    this.update({ repeat });
    this.persist(true);
  }

  public toggleFavorite(trackId: string) {
    const favorites = new Set(this.snapshot.favorites);
    if (favorites.has(trackId)) favorites.delete(trackId); else favorites.add(trackId);
    this.update({ favorites: [...favorites] });
    this.persist(true);
  }

  public playQueue(queue: LaptopTrack[], trackId: string) {
    return this.playTrack(trackId, queue);
  }

  public dispose() {
    this.disposed = true;
    this.rampFrame++;
    this.audio.pause();
    this.persist(true);
    this.audio.removeEventListener("timeupdate", this.onTimeUpdate);
    this.audio.removeEventListener("durationchange", this.onDurationChange);
    this.audio.removeEventListener("ended", this.onEnded);
    this.audio.removeEventListener("error", this.onError);
    this.audio.removeAttribute("src");
    this.audio.load();
    this.listeners.clear();
  }

  private queueTracks() {
    return this.snapshot.queue.map(id => this.snapshot.tracks.find(track => track.id === id)).filter((track): track is LaptopTrack => Boolean(track));
  }

  private setSource(track: LaptopTrack, restorePosition: boolean) {
    const savedPosition = this.savedPosition;
    this.currentUrl = track.url;
    this.audio.src = track.url;
    this.audio.load();
    if (restorePosition && savedPosition > 0) {
      this.audio.addEventListener("loadedmetadata", () => {
        if (this.currentUrl === track.url && Number.isFinite(this.audio.duration)) this.audio.currentTime = Math.min(savedPosition, this.audio.duration);
      }, { once: true });
    } else if (!restorePosition) {
      this.audio.addEventListener("loadedmetadata", () => {
        if (this.currentUrl === track.url && savedPosition > 0) this.audio.currentTime = Math.min(savedPosition, this.audio.duration || savedPosition);
      }, { once: true });
    }
    this.savedPosition = 0;
  }

  private touchRecentlyPlayed(trackId: string) {
    this.update({ recentlyPlayed: [trackId, ...this.snapshot.recentlyPlayed.filter(id => id !== trackId)].slice(0, 30) });
  }

  private onTimeUpdate = () => {
    const currentTime = Number.isFinite(this.audio.currentTime) ? this.audio.currentTime : 0;
    this.update({ currentTime });
    this.persist(false);
  };
  private onDurationChange = () => this.update({ duration: Number.isFinite(this.audio.duration) ? this.audio.duration : 0 });
  private onEnded = () => {
    if (this.snapshot.repeat === "one") {
      this.audio.currentTime = 0;
      void this.audio.play().then(() => this.update({ isPlaying: true })).catch(() => this.update({ isPlaying: false }));
      return;
    }
    void this.next();
  };
  private onError = () => this.update({ isPlaying: false, error: "This audio file could not be played by the browser." });

  private update(patch: Partial<LaptopAudioSnapshot>) {
    this.snapshot = { ...this.snapshot, ...patch };
    for (const listener of this.listeners) listener(this.snapshot);
  }

  private persist(force: boolean) {
    const now = Date.now();
    if (!force && now - this.lastPersistAt < 5000) return;
    this.lastPersistAt = now;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify({
        currentTrackId: this.snapshot.currentTrackId,
        currentTime: this.audio.currentTime || this.snapshot.currentTime,
        volume: this.snapshot.volume,
        shuffle: this.snapshot.shuffle,
        repeat: this.snapshot.repeat,
        favorites: this.snapshot.favorites,
        queue: this.snapshot.queue,
        recentlyPlayed: this.snapshot.recentlyPlayed
      }));
    } catch { /* Persistence is optional when browser storage is unavailable. */ }
  }
}
