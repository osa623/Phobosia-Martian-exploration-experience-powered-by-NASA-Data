const assert = require('assert');
const { resolveTriggerScreens } = require('../dist/systems/operating-system/triggerAccess.js');

const screens = [
  { id: 'MC_OBJECTIVES', mesh: 'MissionControl_ObjectivesScreen' },
  { id: 'MC_NAV', mesh: 'MissionControl_DroneOperationScreen' },
  { id: 'MC_COMMS', mesh: 'MissionControl_CommunicationsScreen' },
  { id: 'MC_SYSTEMS', mesh: 'MissionControl_SystemsScreen' }
];
const navigation = resolveTriggerScreens(screens, ['MissionControl_DroneOperationScreen']);
assert.deepStrictEqual(navigation.map(screen => screen.id), ['MC_NAV']);
const systems = resolveTriggerScreens(screens, ['MissionControl_CommunicationsScreen', 'MissionControl_SystemsScreen']);
assert.deepStrictEqual(systems.map(screen => screen.id), ['MC_COMMS', 'MC_SYSTEMS']);
assert.deepStrictEqual(resolveTriggerScreens(screens, []), []);
console.log('  ✓ PASS: Trigger screen access is restricted to the active trigger allowlist');
