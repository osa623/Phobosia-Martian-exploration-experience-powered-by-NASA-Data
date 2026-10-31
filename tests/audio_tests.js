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

assert.equal(sounds.length, 4, "one audio element is created per existing sound asset");
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

audio.setSol5DroneActive(true);
audio.update(0.2);
assert.equal(byName("droneSound.MP3").playCount, 1);
assert.equal(byName("marsSound.MP3").playCount, 1);
audio.setSol5DroneActive(true);
audio.update(0.2);
assert.equal(byName("droneSound.MP3").playCount, 1, "repeated activation does not create duplicate playback");
assert.equal(byName("walkSound.MP3").volume, 0, "drone operation suppresses indoor footstep audio");

audio.setSol5DroneActive(false);
audio.update(0.2);
assert.equal(byName("droneSound.MP3").pauseCount, 1);
assert.equal(byName("marsSound.MP3").pauseCount, 1);

audio.setIndoorMovement("walking");
audio.update(0.2);
assert.equal(byName("walkSound.MP3").playCount, 2, "indoor movement audio resumes after drone operation");
audio.dispose();
console.log("Audio state tests passed.");
