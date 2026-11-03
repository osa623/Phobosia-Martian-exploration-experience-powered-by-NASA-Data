"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import generatedAssets from "./assets.generated.json";
import { LaptopAudioController, type LaptopAudioSnapshot, type LaptopTrack } from "./LaptopAudioController";
import styles from "./PersonalLaptopOS.module.css";

type AppId = "computer" | "music" | "gallery" | "documents" | "recycle";
type LibraryView = "all" | "favorites" | "playlists" | "recent";
interface WindowState { id: AppId; minimized: boolean; maximized: boolean; z: number }
interface LaptopAssetFile { id: string; fileName: string; title: string; url: string; mimeType: string; extension: string }
const assets = generatedAssets as unknown as { songs: LaptopTrack[]; images: LaptopAssetFile[]; wallpapers: LaptopAssetFile[]; documents: LaptopAssetFile[] };
interface PersonalLaptopOSProps {
  open: boolean;
  onClose: () => void;
  audio: LaptopAudioController;
  audioSnapshot: Readonly<LaptopAudioSnapshot>;
}

const APP_META: Record<AppId, { title: string; glyph: string; color: string }> = {
  computer: { title: "My Computer", glyph: "▣", color: "#69b8e7" },
  music: { title: "Music", glyph: "♫", color: "#d895ee" },
  gallery: { title: "My Gallery", glyph: "▧", color: "#f28d69" },
  documents: { title: "Documents", glyph: "▤", color: "#f2cf7f" },
  recycle: { title: "Recycle Bin", glyph: "⌫", color: "#b7cad4" }
};
const TRASH_KEY = "phobosia_personal_laptop_bin_v1";
const PLAYLIST_KEY = "phobosia_personal_laptop_playlists_v1";

function readStringList(key: string): string[] {
  try {
    const value = JSON.parse(window.localStorage.getItem(key) ?? "[]");
    return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
  } catch { return []; }
}
function readPlaylists(): Record<string, string[]> {
  try {
    const value = JSON.parse(window.localStorage.getItem(PLAYLIST_KEY) ?? "{}");
    return value && typeof value === "object" && !Array.isArray(value) ? value : {};
  } catch { return {}; }
}
function formatTime(seconds: number) {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  return `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`;
}
function supportedTracks(): LaptopTrack[] {
  const probe = document.createElement("audio");
  return assets.songs.filter(track => Boolean(probe.canPlayType(track.mimeType))).map(track => track as LaptopTrack);
}
function renderDocumentText(contents: string) {
  const lines = contents.replace(/\r/g, "").split("\n");
  const blocks: React.ReactNode[] = [];
  let paragraph: string[] = [];
  let list: string[] = [];
  const flushParagraph = () => { if (paragraph.length) { blocks.push(<p key={`p-${blocks.length}`}>{paragraph.join(" ")}</p>); paragraph = []; } };
  const flushList = () => { if (list.length) { blocks.push(<ul key={`ul-${blocks.length}`}>{list.map((line, index) => <li key={index}>{line}</li>)}</ul>); list = []; } };
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) { flushParagraph(); flushList(); continue; }
    const heading = /^(#{1,3})\s+(.+)$/.exec(trimmed);
    if (heading) {
      flushParagraph(); flushList();
      const depth = heading[1].length;
      blocks.push(depth === 1 ? <h1 key={`h-${blocks.length}`}>{heading[2]}</h1> : depth === 2 ? <h2 key={`h-${blocks.length}`}>{heading[2]}</h2> : <h3 key={`h-${blocks.length}`}>{heading[2]}</h3>);
    } else if (/^[-*]\s+/.test(trimmed)) {
      flushParagraph(); list.push(trimmed.replace(/^[-*]\s+/, ""));
    } else {
      flushList(); paragraph.push(trimmed);
    }
  }
  flushParagraph(); flushList();
  return blocks.length ? blocks : <p className={styles.muted}>This document is empty.</p>;
}

export function PersonalLaptopOS({ open, onClose, audio, audioSnapshot }: PersonalLaptopOSProps) {
  const [windows, setWindows] = useState<WindowState[]>([]);
  const [focus, setFocus] = useState<AppId | null>(null);
  const [clock, setClock] = useState(() => new Date());
  const [folder, setFolder] = useState<"root" | "Music" | "Images" | "Documents">("root");
  const [galleryImage, setGalleryImage] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [libraryView, setLibraryView] = useState<LibraryView>("all");
  const [activePlaylist, setActivePlaylist] = useState<string | null>(null);
  const [playlists, setPlaylists] = useState<Record<string, string[]>>(() => readPlaylists());
  const [trashed, setTrashed] = useState<string[]>(() => readStringList(TRASH_KEY));
  const [documentContents, setDocumentContents] = useState<Record<string, string>>({});
  const [documentError, setDocumentError] = useState<string | null>(null);
  const [playingFile, setPlayingFile] = useState<string | null>(null);
  const zCounter = useRef(1);
  const wallpaper = assets.wallpapers[0]?.url;
  const availableTracks = useMemo(() => audioSnapshot.tracks.filter(track => !trashed.includes(track.id)), [audioSnapshot.tracks, trashed]);
  const availableImages = useMemo(() => assets.images.filter(image => !trashed.includes(image.id)), [trashed]);
  const availableDocuments = useMemo(() => assets.documents.filter(document => !trashed.includes(document.id)), [trashed]);

  useEffect(() => {
    // Keep the controller's catalog stable even when a file is hidden in the simulated bin.
    audio.setLibrary(supportedTracks());
    const timer = window.setInterval(() => setClock(new Date()), 15_000);
    return () => window.clearInterval(timer);
  }, [audio]);
  useEffect(() => { setTrashed(readStringList(TRASH_KEY)); setPlaylists(readPlaylists()); }, []);
  useEffect(() => { try { window.localStorage.setItem(TRASH_KEY, JSON.stringify(trashed)); } catch { /* Simulated trash is optional when storage is unavailable. */ } }, [trashed]);
  useEffect(() => { try { window.localStorage.setItem(PLAYLIST_KEY, JSON.stringify(playlists)); } catch { /* Playlists remain available for this session. */ } }, [playlists]);
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!open) return;
      event.stopPropagation();
      if (event.key === "Escape") { event.preventDefault(); onClose(); }
      if (galleryImage && event.key === "ArrowRight") stepGallery(1);
      if (galleryImage && event.key === "ArrowLeft") stepGallery(-1);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, galleryImage, availableImages, onClose]);

  const openApp = (id: AppId) => {
    const nextZ = ++zCounter.current;
    setWindows(previous => {
      const exists = previous.some(item => item.id === id);
      return exists ? previous.map(item => item.id === id ? { ...item, minimized: false, z: nextZ } : item) : [...previous, { id, minimized: false, maximized: false, z: nextZ }];
    });
    setFocus(id);
  };
  const focusApp = (id: AppId) => {
    const nextZ = ++zCounter.current;
    setWindows(previous => previous.map(item => item.id === id ? { ...item, minimized: false, z: nextZ } : item));
    setFocus(id);
  };
  const closeApp = (id: AppId) => {
    setWindows(previous => previous.filter(item => item.id !== id));
    setFocus(current => current === id ? null : current);
    if (id === "gallery") setGalleryImage(null);
  };
  const updateWindow = (id: AppId, patch: Partial<WindowState>) => setWindows(previous => previous.map(item => item.id === id ? { ...item, ...patch } : item));
  const toggleWindow = (id: AppId) => {
    const current = windows.find(item => item.id === id);
    if (!current) openApp(id);
    else if (current.minimized || focus !== id) focusApp(id);
    else updateWindow(id, { minimized: true });
  };
  const moveToBin = (id: string) => setTrashed(previous => previous.includes(id) ? previous : [...previous, id]);
  const restoreFile = (id: string) => setTrashed(previous => previous.filter(item => item !== id));
  const emptyBin = () => setTrashed([]);
  const openFile = (fileId: string, type: "song" | "image" | "document") => {
    if (type === "song") { openApp("music"); setLibraryView("all"); setActivePlaylist(null); void audio.playTrack(fileId); }
    if (type === "image") { setGalleryImage(fileId); setZoom(1); openApp("gallery"); }
    if (type === "document") { openApp("documents"); void loadDocument(fileId); }
  };
  const loadDocument = async (id: string) => {
    const file = assets.documents.find(item => item.id === id);
    if (!file || documentContents[id] !== undefined) return;
    setDocumentError(null);
    try {
      const response = await fetch(file.url, { credentials: "same-origin" });
      if (!response.ok) throw new Error("Document could not be opened.");
      const contents = await response.text();
      setDocumentContents(previous => ({ ...previous, [id]: contents }));
      setPlayingFile(id);
    } catch { setDocumentError("This local document could not be loaded."); }
  };
  const stepGallery = (direction: number) => {
    if (!galleryImage || !availableImages.length) return;
    const current = availableImages.findIndex(image => image.id === galleryImage);
    const next = (current + direction + availableImages.length) % availableImages.length;
    setGalleryImage(availableImages[next].id);
    setZoom(1);
  };
  const createPlaylist = () => {
    const name = window.prompt("Name your playlist");
    if (!name?.trim()) return;
    const normalized = name.trim().slice(0, 48);
    setPlaylists(previous => previous[normalized] ? previous : { ...previous, [normalized]: [] });
    setLibraryView("playlists");
    setActivePlaylist(normalized);
  };
  const addToPlaylist = (trackId: string) => {
    const name = activePlaylist ?? Object.keys(playlists)[0];
    if (!name) { createPlaylist(); return; }
    setPlaylists(previous => ({ ...previous, [name]: previous[name].includes(trackId) ? previous[name] : [...previous[name], trackId] }));
  };
  const rootStyle = wallpaper ? { backgroundImage: `linear-gradient(180deg, rgba(6,12,20,.1), rgba(6,12,20,.22)), url("${wallpaper}")` } : undefined;
  const selectedGallery = availableImages.find(image => image.id === galleryImage) ?? null;
  const menuClock = new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }).format(clock);
  const menuDate = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(clock);

  if (!open) return null;
  if (typeof document === "undefined") return null;
  return createPortal(<main className={styles.desktop} style={rootStyle} role="application" aria-label="Personal laptop desktop" onKeyDown={event => event.stopPropagation()}>
    <header className={styles.menuBar}>
      <div className={styles.menuBrand}><span className={styles.brandMark}>◉</span><strong>PHOBOSIA</strong><span className={styles.menuSeparator}>|</span><span>Desktop</span></div>
      <div className={styles.menuRight}>
        <span className={styles.statusItem} title="Local device network; no internet connection"><span className={styles.signalBars}><i/><i/><i/><i/></span><small>LOCAL</small></span>
        <span className={styles.statusItem} title="Simulated laptop battery"><span className={styles.battery}><i/></span><small>86%</small></span>
        <span className={styles.lang}>EN</span><span className={styles.clockText}>{menuDate} &nbsp; {menuClock}</span>
        <button type="button" className={styles.exitButton} onClick={onClose} aria-label="Close laptop">⏻ <span>Exit</span></button>
      </div>
    </header>

    <section className={styles.desktopIcons} aria-label="Desktop shortcuts">
      {(Object.keys(APP_META) as AppId[]).map(id => <button key={id} className={styles.desktopIcon} type="button" onClick={() => { if (id === "computer") setFolder("root"); if (id === "gallery") setGalleryImage(null); openApp(id); }}>
        <span className={styles.iconTile} style={{ "--app-color": APP_META[id].color } as React.CSSProperties}>{APP_META[id].glyph}</span>
        <span>{id === "gallery" ? "My Gallery" : APP_META[id].title}</span>
      </button>)}
    </section>

    {windows.filter(item => !item.minimized).map(windowState => {
      const app = APP_META[windowState.id];
      const isFocused = focus === windowState.id;
      return <section key={windowState.id} className={`${styles.window} ${windowState.maximized ? styles.maximized : ""} ${isFocused ? styles.focused : ""}`} style={{ zIndex: windowState.z }} onPointerDown={() => focusApp(windowState.id)} aria-label={`${app.title} window`}>
        <header className={styles.windowBar} onDoubleClick={() => updateWindow(windowState.id, { maximized: !windowState.maximized })}>
          <div className={styles.windowControls}>
            <button type="button" className={styles.closeControl} onClick={() => closeApp(windowState.id)} aria-label={`Close ${app.title}`}>×</button>
            <button type="button" className={styles.minControl} onClick={() => updateWindow(windowState.id, { minimized: true })} aria-label={`Minimize ${app.title}`}>−</button>
            <button type="button" className={styles.maxControl} onClick={() => updateWindow(windowState.id, { maximized: !windowState.maximized })} aria-label={windowState.maximized ? "Restore window" : "Maximize window"}>□</button>
          </div>
          <div className={styles.windowTitle}><span style={{ color: app.color }}>{app.glyph}</span>{app.title}</div>
          <div className={styles.windowBarRight}>{windowState.id === "music" && audioSnapshot.isPlaying && <span className={styles.livePlayback}>♫ Playing</span>}</div>
        </header>
        <div className={styles.windowBody}>
          {windowState.id === "computer" && <ComputerApp folder={folder} setFolder={setFolder} tracks={availableTracks} images={availableImages} documents={availableDocuments} trashed={trashed} onOpen={openFile} onTrash={moveToBin}/>}
          {windowState.id === "music" && <MusicApp audio={audio} snapshot={audioSnapshot} tracks={availableTracks} playlists={playlists} view={libraryView} setView={setLibraryView} activePlaylist={activePlaylist} setActivePlaylist={setActivePlaylist} onCreatePlaylist={createPlaylist} onAddToPlaylist={addToPlaylist} onTrash={moveToBin}/>}
          {windowState.id === "gallery" && <GalleryApp images={availableImages} selected={selectedGallery} zoom={zoom} setZoom={setZoom} onSelect={id => { setGalleryImage(id); setZoom(1); }} onStep={stepGallery} onTrash={moveToBin}/>}
          {windowState.id === "documents" && <DocumentsApp documents={availableDocuments} selectedId={playingFile} contents={documentContents} error={documentError} onSelect={id => void loadDocument(id)}/>}
          {windowState.id === "recycle" && <RecycleApp trashed={trashed} files={[...assets.songs, ...assets.images, ...assets.documents]} onRestore={restoreFile} onEmpty={emptyBin}/>}
        </div>
      </section>;
    })}

    <footer className={styles.dockWrap}>
      <nav className={styles.dock} aria-label="Laptop taskbar">
        {(Object.keys(APP_META) as AppId[]).map(id => {
          const open = windows.some(item => item.id === id);
          const minimized = windows.some(item => item.id === id && item.minimized);
          return <button key={id} type="button" className={`${styles.dockApp} ${focus === id && !minimized ? styles.dockFocused : ""}`} onClick={() => toggleWindow(id)} title={APP_META[id].title} aria-label={`${minimized ? "Restore" : open && focus === id ? "Minimize" : "Open"} ${APP_META[id].title}`}>
            <span className={styles.dockTile} style={{ "--app-color": APP_META[id].color } as React.CSSProperties}>{APP_META[id].glyph}</span>
            {open && <i className={styles.openDot}/>}
          </button>;
        })}
        <span className={styles.dockDivider}/>
        <button type="button" className={styles.dockApp} onClick={onClose} title="Close laptop"><span className={`${styles.dockTile} ${styles.powerTile}`}>⏻</span></button>
      </nav>
      <div className={styles.dockStatus} aria-label="Simulated laptop status">
        <span title="Local device network; internet is unavailable"><span className={styles.signalBars}><i/><i/><i/><i/></span> Local</span>
        <span title="Simulated laptop battery"><span className={styles.battery}><i/></span> 86%</span>
        <span>EN</span><span>{menuDate} · {menuClock}</span>
      </div>
      <div className={styles.dockCaption}>Personal workstation · local files only</div>
    </footer>
    <div className={styles.desktopHelp}>Double-click a window title to maximize or restore · Esc to return to the Habitat</div>
    {windows.length === 0 && <div className={styles.welcome}><div className={styles.welcomeBadge}>PERSONAL WORKSTATION</div><h1>Good to see you.</h1><p>Your local music and images are ready. Open an app from the desktop or dock.</p><button type="button" onClick={() => openApp("computer")}>Browse this computer <span>→</span></button></div>}
  </main>, document.body);
}

function ComputerApp({ folder, setFolder, tracks, images, documents, trashed, onOpen, onTrash }: {
  folder: "root" | "Music" | "Images" | "Documents"; setFolder: (folder: "root" | "Music" | "Images" | "Documents") => void;
  tracks: LaptopTrack[]; images: LaptopAssetFile[]; documents: LaptopAssetFile[]; trashed: string[];
  onOpen: (id: string, type: "song" | "image" | "document") => void; onTrash: (id: string) => void;
}) {
  const folderItems = [
    { name: "Music", glyph: "♫", count: tracks.length, action: () => setFolder("Music") },
    { name: "Images", glyph: "▧", count: images.length, action: () => setFolder("Images") },
    { name: "Documents", glyph: "▤", count: documents.length, action: () => setFolder("Documents") }
  ];
  return <div className={styles.fileBrowser}>
    <aside className={styles.fileSidebar}><div className={styles.sidebarLabel}>FAVORITES</div><button className={folder === "root" ? styles.selectedNav : ""} onClick={() => setFolder("root")}>▣ <span>My Computer</span></button>{folderItems.map(item => <button key={item.name} className={folder === item.name ? styles.selectedNav : ""} onClick={item.action}>{item.glyph} <span>{item.name}</span></button>)}<div className={styles.sidebarLabel}>LOCATIONS</div><div className={styles.locationStatus}><i/> Local files<br/><small>No internet connection</small></div></aside>
    <section className={styles.fileContent}><div className={styles.breadcrumb}><button onClick={() => setFolder("root")}>My Computer</button>{folder !== "root" && <><span>›</span><b>{folder}</b></>}</div>
      {folder === "root" ? <div className={styles.folderGrid}>{folderItems.map(item => <button className={styles.folderCard} key={item.name} onDoubleClick={item.action} onClick={item.action}><span className={styles.folderGlyph}>{item.glyph}</span><b>{item.name}</b><small>{item.count} {item.count === 1 ? "item" : "items"}</small></button>)}</div> : <FileList folder={folder} tracks={tracks} images={images} documents={documents} trashed={trashed} onOpen={onOpen} onTrash={onTrash}/>}</section>
  </div>;
}

function FileList({ folder, tracks, images, documents, trashed, onOpen, onTrash }: {
  folder: "Music" | "Images" | "Documents"; tracks: LaptopTrack[]; images: LaptopAssetFile[]; documents: LaptopAssetFile[]; trashed: string[];
  onOpen: (id: string, type: "song" | "image" | "document") => void; onTrash: (id: string) => void;
}) {
  const items = folder === "Music" ? tracks.map(item => ({ ...item, kind: "song" as const })) : folder === "Images" ? images.map(item => ({ ...item, kind: "image" as const })) : documents.map(item => ({ ...item, kind: "document" as const }));
  if (!items.length) return <div className={styles.emptyState}><span>{folder === "Documents" ? "▤" : folder === "Music" ? "♫" : "▧"}</span><h3>This folder is empty</h3><p>{folder === "Documents" ? "No personal documents have been supplied." : `No supported ${folder.toLowerCase()} files are available.`}</p></div>;
  return <div className={styles.listView}><div className={styles.listHeader}><span>Name</span><span>Kind</span><span>Action</span></div>{items.map(item => <div className={styles.fileRow} key={item.id}><button className={styles.fileName} onDoubleClick={() => onOpen(item.id, item.kind)} onClick={() => onOpen(item.id, item.kind)}><span className={styles.rowGlyph}>{item.kind === "song" ? "♫" : item.kind === "image" ? "▧" : "▤"}</span>{item.title}</button><span className={styles.fileKind}>{item.extension.toUpperCase()} · Local</span><button className={styles.rowAction} onClick={() => onTrash(item.id)} aria-label={`Move ${item.title} to Recycle Bin`}>Move to Bin</button></div>)}</div>;
}

function MusicApp({ audio, snapshot, tracks, playlists, view, setView, activePlaylist, setActivePlaylist, onCreatePlaylist, onAddToPlaylist, onTrash }: {
  audio: LaptopAudioController; snapshot: Readonly<LaptopAudioSnapshot>; tracks: LaptopTrack[]; playlists: Record<string, string[]>;
  view: LibraryView; setView: (view: LibraryView) => void; activePlaylist: string | null; setActivePlaylist: (name: string | null) => void;
  onCreatePlaylist: () => void; onAddToPlaylist: (id: string) => void; onTrash: (id: string) => void;
}) {
  const [pane, setPane] = useState<"library" | "now">("library");
  let visibleTracks = tracks;
  if (view === "favorites") visibleTracks = tracks.filter(track => snapshot.favorites.includes(track.id));
  if (view === "recent") visibleTracks = snapshot.recentlyPlayed.map(id => tracks.find(track => track.id === id)).filter((track): track is LaptopTrack => Boolean(track));
  if (view === "playlists" && activePlaylist) visibleTracks = (playlists[activePlaylist] ?? []).map(id => tracks.find(track => track.id === id)).filter((track): track is LaptopTrack => Boolean(track));
  const current = tracks.find(track => track.id === snapshot.currentTrackId) ?? null;
  const progress = snapshot.duration > 0 ? snapshot.currentTime / snapshot.duration * 100 : 0;
  return <div className={styles.musicApp}>
    <aside className={styles.musicSidebar}><div className={styles.musicBrand}><span>♫</span><div><b>Music</b><small>Personal Library</small></div></div><div className={styles.sidebarLabel}>LIBRARY</div>
      {([["all", "All Songs", "♫"], ["favorites", "Favorites", "♡"], ["playlists", "Playlists", "▤"], ["recent", "Recently Played", "◷"]] as [LibraryView,string,string][]).map(([id,label,glyph]) => <button key={id} className={view === id && pane === "library" ? styles.musicNavActive : styles.musicNav} onClick={() => { setView(id); setPane("library"); if (id !== "playlists") setActivePlaylist(null); }}>{glyph}<span>{label}</span></button>)}
      {view === "playlists" && <div className={styles.playlistLinks}>{Object.keys(playlists).map(name => <button key={name} className={activePlaylist === name ? styles.musicNavActive : styles.musicNav} onClick={() => { setActivePlaylist(name); setPane("library"); }}>▤<span>{name}</span></button>)}<button className={styles.createPlaylist} onClick={onCreatePlaylist}>＋ Create playlist</button></div>}
      <button className={pane === "now" ? styles.musicNavActive : styles.musicNav} onClick={() => setPane("now")}>☷<span>Queue</span></button>
    </aside>
    <section className={styles.musicMain}>
      <header className={styles.appHeading}><div><div className={styles.eyebrow}>MY MUSIC</div><h2>{pane === "now" ? "Up Next" : activePlaylist && view === "playlists" ? activePlaylist : view === "favorites" ? "Favorites" : view === "recent" ? "Recently Played" : view === "playlists" ? "Playlists" : "All Songs"}</h2><p>{visibleTracks.length} {visibleTracks.length === 1 ? "track" : "tracks"} · stored on this laptop</p></div><button className={styles.secondaryButton} onClick={onCreatePlaylist}>＋ New playlist</button></header>
      {snapshot.error && <p className={styles.errorBanner} role="status">{snapshot.error}</p>}
      {pane === "library" ? <div className={styles.trackTable}><div className={styles.trackHeader}><span>#</span><span>Title</span><span>Duration</span><span>Actions</span></div>{visibleTracks.length ? visibleTracks.map((track,index) => <div className={`${styles.trackRow} ${snapshot.currentTrackId === track.id ? styles.currentTrack : ""}`} key={track.id}>
        <button className={styles.trackPlay} onClick={() => { setPane("now"); void audio.playQueue(visibleTracks, track.id); }} aria-label={`Play ${track.title}`}>{snapshot.currentTrackId === track.id && snapshot.isPlaying ? "Ⅱ" : String(index + 1).padStart(2,"0")}</button><button className={styles.trackTitle} onClick={() => { setPane("now"); void audio.playQueue(visibleTracks, track.id); }}><span className={styles.trackArtwork}>♫</span><span><b>{track.title}</b></span></button><span className={styles.duration}>{snapshot.currentTrackId === track.id ? formatTime(snapshot.duration) : "—"}</span><div className={styles.trackActions}><button onClick={() => audio.toggleFavorite(track.id)} aria-label={snapshot.favorites.includes(track.id) ? "Remove favorite" : "Add favorite"} className={snapshot.favorites.includes(track.id) ? styles.favoriteOn : ""}>{snapshot.favorites.includes(track.id) ? "♥" : "♡"}</button><button onClick={() => onAddToPlaylist(track.id)} title="Add to a playlist">＋</button><button onClick={() => onTrash(track.id)} title="Move to Recycle Bin">⋯</button></div>
      </div>) : <div className={styles.emptyState}><span>♫</span><h3>No songs here</h3><p>Add supported audio files to the laptop Music folder and refresh its asset manifest.</p></div>}</div> : <div className={styles.nowPlaying}>
        <div className={styles.albumArt}>{current ? <span>♫</span> : <span className={styles.muted}>♪</span>}<div className={styles.artGlow}/></div>
        <div className={styles.nowTrack}>{current?.title ?? "Nothing playing"}{!current && <small>Choose a track from your library</small>}</div>
        <div className={styles.playerControls}><button onClick={() => void audio.previous()} aria-label="Previous track">◀|</button><button className={styles.playButton} onClick={() => void audio.togglePlayback()} aria-label={snapshot.isPlaying ? "Pause" : "Play"}>{snapshot.isPlaying ? "Ⅱ" : "▶"}</button><button onClick={() => void audio.next()} aria-label="Next track">|▶</button></div>
        <div className={styles.seekRow}><span>{formatTime(snapshot.currentTime)}</span><input aria-label="Track position" type="range" min="0" max={snapshot.duration || 0} step="0.1" value={Math.min(snapshot.currentTime, snapshot.duration || 0)} onChange={event => audio.seek(Number(event.target.value))} style={{ "--progress": `${progress}%` } as React.CSSProperties}/><span>{formatTime(snapshot.duration)}</span></div>
        <div className={styles.playerOptions}><button onClick={() => audio.toggleShuffle()} className={snapshot.shuffle ? styles.optionActive : ""} title="Shuffle">⤨</button><button onClick={() => audio.cycleRepeat()} className={snapshot.repeat !== "off" ? styles.optionActive : ""} title={`Repeat ${snapshot.repeat}`}>↻{snapshot.repeat === "one" ? <sup>1</sup> : null}</button><div className={styles.volumeControl}><button onClick={() => audio.setVolume(snapshot.volume === 0 ? 0.65 : 0)} aria-label="Mute or unmute">{snapshot.volume === 0 ? "◖" : "◖))"}</button><input aria-label="Volume" type="range" min="0" max="1" step="0.01" value={snapshot.volume} onChange={event => audio.setVolume(Number(event.target.value))}/></div><span className={styles.localAudio}>LOCAL AUDIO · {snapshot.habitatAudible ? "HABITAT" : "MUTED OUTSIDE"}</span></div>
      </div>}
    </section>
  </div>;
}

function GalleryApp({ images, selected, zoom, setZoom, onSelect, onStep, onTrash }: {
  images: typeof assets.images; selected: typeof assets.images[number] | null; zoom: number; setZoom: (zoom: number) => void;
  onSelect: (id: string) => void; onStep: (direction: number) => void; onTrash: (id: string) => void;
}) {
  const toggleFullscreen = async () => {
    const element = document.querySelector(`.${styles.galleryViewer}`);
    try { if (element && !document.fullscreenElement) await element.requestFullscreen(); else if (document.fullscreenElement) await document.exitFullscreen(); } catch { /* Fullscreen may be unavailable in an embedded browser. */ }
  };
  return <div className={styles.galleryApp}>
    <header className={styles.appHeading}><div><div className={styles.eyebrow}>LOCAL ALBUM</div><h2>{selected?.title ?? "Images"}</h2><p>{images.length} images · this device</p></div>{selected && <div className={styles.galleryTools}><button onClick={() => setZoom(Math.max(0.5, zoom - 0.25))}>−</button><span>{Math.round(zoom * 100)}%</span><button onClick={() => setZoom(Math.min(3, zoom + 0.25))}>＋</button><button onClick={() => setZoom(1)}>Fit</button><button onClick={toggleFullscreen} title="Fullscreen">⛶</button><button onClick={() => onTrash(selected.id)} title="Move to Recycle Bin">⋯</button></div>}</header>
    {selected ? <div className={styles.galleryViewer}><button className={`${styles.galleryArrow} ${styles.leftArrow}`} onClick={() => onStep(-1)} aria-label="Previous image">‹</button><img src={selected.url} alt={selected.title} style={{ transform: `scale(${zoom})` }} draggable={false}/><button className={`${styles.galleryArrow} ${styles.rightArrow}`} onClick={() => onStep(1)} aria-label="Next image">›</button><div className={styles.imageCaption}>{selected.title}</div></div> : images.length ? <div className={styles.imageGrid}>{images.map(image => <button className={styles.imageCard} key={image.id} onClick={() => onSelect(image.id)}><img src={image.url} alt="" loading="lazy"/><span>{image.title}</span></button>)}</div> : <div className={styles.emptyState}><span>▧</span><h3>Your gallery is empty</h3><p>Supported images in the laptop Images folder will appear here after the asset manifest is refreshed.</p></div>}
  </div>;
}

function DocumentsApp({ documents, selectedId, contents, error, onSelect }: { documents: typeof assets.documents; selectedId: string | null; contents: Record<string,string>; error: string | null; onSelect: (id: string) => void }) {
  const selected = documents.find(document => document.id === selectedId);
  return <div className={styles.documentsApp}><aside className={styles.documentList}><div className={styles.eyebrow}>ON THIS LAPTOP</div><h3>Documents</h3>{documents.map(document => <button key={document.id} className={selectedId === document.id ? styles.documentActive : ""} onClick={() => onSelect(document.id)}>▤ <span>{document.title}</span></button>)}</aside><article className={styles.documentPreview}>{selected ? <><div className={styles.documentMeta}>PERSONAL FILE · {selected.extension.toUpperCase()}</div><h1>{selected.title}</h1>{error ? <p className={styles.errorBanner}>{error}</p> : contents[selected.id] === undefined ? <p className={styles.muted}>Loading local document…</p> : renderDocumentText(contents[selected.id])}</> : <div className={styles.emptyState}><span>▤</span><h3>No documents yet</h3><p>No personal notes or documents were supplied with the project. Add local .md or .txt files to the laptop documents folder to make them available.</p></div>}</article></div>;
}

function RecycleApp({ trashed, files, onRestore, onEmpty }: { trashed: string[]; files: Array<{ id: string; title: string; extension: string }>; onRestore: (id: string) => void; onEmpty: () => void }) {
  const items = trashed.map(id => files.find(file => file.id === id)).filter((file): file is { id: string; title: string; extension: string } => Boolean(file));
  return <div className={styles.recycleApp}><header className={styles.appHeading}><div><div className={styles.eyebrow}>SIMULATED FILE STORAGE</div><h2>Recycle Bin</h2><p>Items here are hidden from the laptop apps; source assets remain unchanged.</p></div>{items.length > 0 && <button className={styles.secondaryButton} onClick={onEmpty}>Empty Bin</button>}</header>{items.length ? <div className={styles.listView}>{items.map(file => <div className={styles.fileRow} key={file.id}><span className={styles.fileName}><span className={styles.rowGlyph}>▤</span>{file.title}</span><span className={styles.fileKind}>{file.extension.toUpperCase()} · Simulated</span><button className={styles.rowAction} onClick={() => onRestore(file.id)}>Restore</button></div>)}</div> : <div className={styles.emptyState}><span>⌫</span><h3>Recycle Bin is empty</h3><p>Files moved here are only changed in this laptop’s local simulated state.</p></div>}</div>;
}
