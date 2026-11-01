const assert = require("node:assert/strict");
const { GameAudioManager, resolveIndoorMovementAudioState } = require("../dist/core/GameAudioManager.js");

class FakeAudio {
  loop = false;
  volume = 0;
  preload = "";
  currentTime = 0;
  playCount = 0;
  pauseCount = 0;
  active = false;
  listeners = new Map();
  constructor(src) { this.src = src; }
  play() { this.playCount++; this.active = true; return Promise.resolve(); }
  pause() { this.pauseCount++; this.active = false; }
  addEventListener(type, listener) { this.listeners.set(type, listener); }
}

const sounds = [];
const audio = new GameAudioManager(src => {
  const sound = new FakeAudio(src);
  sounds.push(sound);
  return sound;
});
const byName = name => sounds.find(sound => sound.src.endsWith(name));
const allByName = name => sounds.filter(sound => sound.src.endsWith(name));

assert.equal(sounds.length, 6, "indoor and Mars contexts own separate movement sources plus shared ambient/drone sources");
assert.equal(allByName("terrainWalkSound.MP3").length, 1, "Mars walking uses the dedicated new terrain asset");
assert.equal(allByName("terrainRunningSound.MP3").length, 1, "Mars running uses the dedicated new terrain asset");
assert.equal(resolveIndoorMovementAudioState({ indoor: false, playerControlled: true, grounded: true, horizontalSpeed: 2, running: false }), "idle");
assert.equal(resolveIndoorMovementAudioState({ indoor: true, playerControlled: true, grounded: true, horizontalSpeed: 0, running: false }), "idle");
assert.equal(resolveIndoorMovementAudioState({ indoor: true, playerControlled: false, grounded: true, horizontalSpeed: 2, running: false }), "idle");
assert.equal(resolveIndoorMovementAudioState({ indoor: true, playerControlled: true, grounded: true, horizontalSpeed: 0.4, running: false }), "walking");
assert.equal(resolveIndoorMovementAudioState({ indoor: true, playerControlled: true, grounded: true, horizontalSpeed: 0.4, running: true }), "running");

audio.setIndoorMovement("walking");
audio.update(0.2);
assert.equal(byName("walkSound.MP3").playCount, 1);
assert.equal(byName("runningSound.MP3").playCount, 0);

audio.setIndoorMovement("running");
audio.update(0.016);
assert.equal(byName("runningSound.MP3").active, false, "running waits until the walking loop fades out");
for (let i = 0; i < 40; i++) audio.update(0.016);
assert.equal(byName("runningSound.MP3").playCount, 1);
assert.equal(byName("walkSound.MP3").pauseCount, 1, "walking stops before running begins");
assert.equal(byName("walkSound.MP3").active && byName("runningSound.MP3").active, false, "walking and running never overlap");

audio.setIndoorMovement("idle");
audio.update(0.2);
assert.equal(byName("runningSound.MP3").pauseCount, 1, "running stops at idle");

audio.setMarsTerrain(true, "idle");
audio.update(0.2);
assert.equal(byName("marsSound.MP3").active, true, "Mars ambience plays while the suited player is outdoors and stationary");
assert.equal(byName("terrainWalkSound.MP3").playCount, 0, "outdoor idle does not start terrain footsteps");
audio.setMarsTerrain(true, "walking");
audio.update(0.2);
assert.equal(byName("terrainWalkSound.MP3").playCount, 1, "Mars walking uses its separate terrain audio source");
assert.equal(allByName("walkSound.MP3")[0].active, false, "indoor footsteps remain silent outdoors");
audio.setMarsTerrain(true, "running");
audio.update(0.016);
assert.equal(byName("terrainRunningSound.MP3").active, false, "Mars running waits until Mars walking fades out");
for (let i = 0; i < 40; i++) audio.update(0.016);
assert.equal(byName("terrainRunningSound.MP3").playCount, 1, "Mars running uses its separate terrain audio source");
assert.equal(byName("terrainWalkSound.MP3").active, false, "Mars walk/run tracks never overlap");
audio.setMarsTerrain(true, "idle");
for (let i = 0; i < 40; i++) audio.update(0.016);
assert.equal(byName("marsSound.MP3").active, true, "Mars ambience continues after movement stops");
assert.equal(byName("terrainRunningSound.MP3").active, false, "Mars running stops at idle");
audio.setMarsTerrain(false);
audio.update(0.2);
assert.equal(byName("marsSound.MP3").active, false, "Mars ambience stops on return indoors");

audio.setSol5DroneActive(true);
audio.update(0.2);
assert.equal(byName("droneSound.MP3").playCount, 1);
assert.equal(byName("marsSound.MP3").playCount, 2, "one ambience playback is used for the outdoor EVA phase and a second for drone operation after the first fades out");
audio.setSol5DroneActive(true);
audio.update(0.2);
assert.equal(byName("droneSound.MP3").playCount, 1, "repeated activation does not create duplicate playback");
assert.equal(byName("walkSound.MP3").volume, 0, "drone operation suppresses indoor footstep audio");
assert.equal(byName("terrainWalkSound.MP3").volume, 0, "drone operation suppresses Mars terrain footsteps");

audio.setSol5DroneActive(false);
audio.update(0.2);
assert.equal(byName("droneSound.MP3").pauseCount, 1);
assert.equal(byName("marsSound.MP3").pauseCount, 2, "each independent ambience phase stops cleanly");

audio.setIndoorMovement("walking");
audio.update(0.2);
assert.equal(byName("walkSound.MP3").playCount, 2, "indoor movement audio resumes after drone operation");
audio.dispose();
console.log("Audio state tests passed.");
