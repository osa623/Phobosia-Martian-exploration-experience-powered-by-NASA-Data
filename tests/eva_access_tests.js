const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const THREE = require('three');
const {
  EVA_PREPARATION_TRIGGER_ID,
  getEVAAccessBlockReason,
  isWithinEVAInteractionRange
} = require('../dist/core/EVAAccess.js');
const { DEFAULT_MOVEMENT_CONFIG, EVA_MOVEMENT_CONFIG } = require('../dist/core/MovementConfig.js');
const { Player } = require('../dist/core/Player.js');
const { resolveIndoorMovementAudioState } = require('../dist/core/GameAudioManager.js');

function readGLBNodeNames(relativePath) {
  const bytes = fs.readFileSync(path.join(process.cwd(), relativePath));
  assert.equal(bytes.toString('ascii', 0, 4), 'glTF', `${relativePath} has a GLB header`);
  const jsonLength = bytes.readUInt32LE(12);
  const document = JSON.parse(bytes.toString('utf8', 20, 20 + jsonLength));
  return new Set((document.nodes || []).map(node => node.name).filter(Boolean));
}

const airlockNames = readGLBNodeNames('public/assets/models/AirLock.glb');
for (const name of [EVA_PREPARATION_TRIGGER_ID, 'Terrain_Entrance_Trigger', 'Central_Hub_Entrance_Trigger']) {
  assert(airlockNames.has(name), `Existing Airlock GLB contains ${name}`);
}
console.log('✓ PASS: EVA preparation and both guarded entrances are the existing objects in AirLock.glb');

const terrainNames = readGLBNodeNames('public/assets/models/mars_Terrain.glb');
assert(terrainNames.has('Spwaning_Position'), 'Terrain return interaction currently maps to the existing Spwaning_Position node');
assert(airlockNames.has('Terrain_Entrance_Trigger'), 'Airlock return spawn reuses its existing terrain-side entrance marker');
const gameSource = fs.readFileSync(path.join(process.cwd(), 'src/core/Game.ts'), 'utf8');
assert(gameSource.includes('Terrain: { Spwaning_Position: { module: "Airlock", spawn: "Terrain_Entrance_Trigger" } }'));
console.log('✓ PASS: Mars-to-Airlock return uses existing Spwaning_Position → Terrain_Entrance_Trigger mapping');

const hubBytes = fs.readFileSync(path.join(process.cwd(), 'public/assets/models/Central_Connector.glb'));
const hubDocument = JSON.parse(hubBytes.toString('utf8', 20, 20 + hubBytes.readUInt32LE(12)));
const hubColliderNames = (hubDocument.nodes || []).map(node => node.name).filter(name => /collider/i.test(name || ''));
assert.deepEqual(hubColliderNames.sort(), ['Collider_Section01', 'Collider_Section02'].sort());
console.log('✓ PASS: Central_Connector.glb excludes Collider_1–Collider_6 and preserves both complex collider sections');

assert.equal(getEVAAccessBlockReason('Terrain', false)?.includes('EVA suit required'), true);
assert.equal(getEVAAccessBlockReason('Terrain', true), null);
assert.equal(getEVAAccessBlockReason('Hub', true)?.includes('remove your suit'), true);
assert.equal(getEVAAccessBlockReason('Hub', false), null);
console.log('✓ PASS: Outdoor access requires an active suit; Central Hub access requires suit removal');

assert.equal(isWithinEVAInteractionRange(2.5, 2.5), true);
assert.equal(isWithinEVAInteractionRange(2.501, 2.5), false);
assert.equal(isWithinEVAInteractionRange(Number.NaN, 2.5), false);
console.log('✓ PASS: Suit prepare/remove interaction uses a finite in-range distance check');

assert(EVA_MOVEMENT_CONFIG.walkSpeed < DEFAULT_MOVEMENT_CONFIG.walkSpeed);
assert(EVA_MOVEMENT_CONFIG.runSpeed < DEFAULT_MOVEMENT_CONFIG.runSpeed);
assert.equal(EVA_MOVEMENT_CONFIG.walkSpeed, DEFAULT_MOVEMENT_CONFIG.walkSpeed * 0.8);
assert.equal(EVA_MOVEMENT_CONFIG.runSpeed, DEFAULT_MOVEMENT_CONFIG.runSpeed * 0.8);
console.log('✓ PASS: EVA mode applies configured slower speeds and normal values remain available for restoration');

const normalCamera = new THREE.PerspectiveCamera();
normalCamera.position.y = 1.65;
const normalPlayer = new Player(normalCamera);
normalPlayer.keys.add('KeyW');
for (let i = 0; i < 60; i++) normalPlayer.update(1 / 60, () => true, () => 0);
assert.equal(normalCamera.rotation.z, 0, 'normal indoor first-person view has no added EVA roll');
const evaCamera = new THREE.PerspectiveCamera();
evaCamera.position.y = 1.65;
const evaPlayer = new Player(evaCamera);
evaPlayer.setEVAOutdoorMotion(true);
evaPlayer.keys.add('KeyW');
let maxEVAOffset = 0;
let maxEVARoll = 0;
for (let i = 0; i < 60; i++) {
  evaPlayer.update(1 / 60, () => true, () => 0);
  maxEVAOffset = Math.max(maxEVAOffset, Math.abs(evaCamera.position.x - evaPlayer.basePosition.x), Math.abs(evaCamera.position.y - evaPlayer.basePosition.y));
  maxEVARoll = Math.max(maxEVARoll, Math.abs(evaCamera.rotation.z));
}
assert(maxEVARoll > 0.001 || maxEVAOffset > 0.001, 'outdoor EVA movement adds subtle camera sway');
evaPlayer.setEVAOutdoorMotion(false);
assert.equal(evaCamera.rotation.z, 0, 'deactivating outdoor motion restores neutral camera roll');
console.log('✓ PASS: Added astronaut camera sway is isolated to EVA outdoor mode and resets cleanly');

const suitOutdoorAudio = resolveIndoorMovementAudioState({
  indoor: false, playerControlled: true, grounded: true, horizontalSpeed: 1.2, running: false
});
assert.equal(suitOutdoorAudio, 'idle');
console.log('✓ PASS: Outdoor suit movement does not request indoor walking/running loops');

const viewportSource = fs.readFileSync(path.join(process.cwd(), 'src/components/game/GameViewport.tsx'), 'utf8');
assert(gameSource.includes('getEVAAccessBlockMessage(route.module)'));
assert(gameSource.includes('target?.identifier !== EVA_PREPARATION_TRIGGER_ID'));
assert(gameSource.includes('targetModule === "Terrain" && !this.evaSuitActive'));
assert(gameSource.includes('targetModule === "Hub" && this.evaSuitActive'));
assert(gameSource.includes('initialModule = "Airlock"') && gameSource.includes('initialSpawn = "Central_Hub_Entrance_Trigger"'));
assert(gameSource.includes('indoor: this.active !== "Terrain"'));
assert(gameSource.includes('[E] PREPARE EVA SUIT') && gameSource.includes('[E] REMOVE EVA SUIT'));
assert(viewportSource.includes('OXYGEN') && viewportSource.includes('SUIT POWER') && viewportSource.includes('SUIT STATUS') && viewportSource.includes('OPERATIONAL'));
assert(viewportSource.includes('EVA helmet visor and suit HUD') && viewportSource.includes('SIM'));
console.log('✓ PASS: Game routes prepare at the existing trigger, gates transitions, and shows the active-suit visor HUD');

const soundNames = fs.readdirSync(path.join(process.cwd(), 'public/assets/sounds'));
assert(!soundNames.some(name => /eva|suit|breath|helmet/i.test(name)), 'No dedicated EVA audio asset exists; outdoor audio remains unassigned');
assert(soundNames.includes('terrainWalkSound.MP3') && soundNames.includes('terrainRunningSound.MP3') && soundNames.includes('marsSound.MP3'));
assert(fs.readFileSync(path.join(process.cwd(), 'src/core/GameAudioManager.ts'), 'utf8').includes('"terrainWalkSound.MP3"'));
assert(fs.readFileSync(path.join(process.cwd(), 'src/core/GameAudioManager.ts'), 'utf8').includes('"terrainRunningSound.MP3"'));
console.log('✓ PASS: New Mars movement audio assets exist and are referenced; no EVA breathing track exists');
