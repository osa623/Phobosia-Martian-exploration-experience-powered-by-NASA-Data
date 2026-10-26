/**
 * PHOBOSIA — Player Movement & Camera Motion Configuration
 *
 * All speeds are expressed in Three.js world units per second.
 * Scene analysis indicates 1 Three.js world unit roughly corresponds to 1 meter
 * (human eye height is 1.65 units, indoor module spans are ~10-15 units wide).
 */
export interface MovementConfig {
  /** Deliberately restrained walking speed (units/s) suitable for spacesuit exploration */
  walkSpeed: number;
  /** Controlled slow-running / jogging speed (units/s) */
  runSpeed: number;
  /** Horizontal acceleration rate (units/s^2) for smooth start */
  acceleration: number;
  /** Horizontal deceleration / friction rate (units/s^2) for controlled stopping */
  deceleration: number;
  /** World gravity downward acceleration (units/s^2). Mars standard is ~3.71 m/s^2 */
  gravity: number;
  /** Initial vertical velocity applied on jump (units/s) */
  jumpVelocity: number;
  /** Default player eye height above ground (units) */
  defaultEyeHeight: number;
  /** Enable subtle camera head-bobbing while walking/running */
  bobEnabled: boolean;
  /** Walking head-bob frequency (radians/s) */
  bobWalkFrequency: number;
  /** Walking head-bob vertical amplitude (units) ~2 cm */
  bobWalkAmplitude: number;
  /** Running head-bob frequency (radians/s) */
  bobRunFrequency: number;
  /** Running head-bob vertical amplitude (units) ~3.5 cm */
  bobRunAmplitude: number;
  /** Enable subtle breathing motion while stationary */
  idleBreathingEnabled: boolean;
  /** Idle breathing frequency (radians/s, ~4 second calm breathing cycle) */
  idleBreathingFrequency: number;
  /** Idle breathing vertical amplitude (units) ~4 mm */
  idleBreathingAmplitude: number;
  /** Blend speed between idle and movement bob (units/s) */
  bobBlendSpeed: number;
}

export const DEFAULT_MOVEMENT_CONFIG: MovementConfig = {
  walkSpeed: 1.4,             // 2.4 m/s (restrained, believable spacesuit exploration pace)
  runSpeed: 2.2,              // 4.2 m/s (controlled jog, not an arcade sprint)
  acceleration: 12.0,         // smooth ramp-up (~0.2s to reach walking speed)
  deceleration: 14.0,         // smooth stopping (~0.18s to come to rest)
  gravity: 5.5,               // tuned Mars gravity reference (Mars is 3.71 m/s^2; 5.5 avoids floaty jumping in indoors)
  jumpVelocity: 3.2,          // max jump height = v^2 / (2g) = 10.24 / 11 = ~0.93m (clears low obstacles safely indoors)
  defaultEyeHeight: 1.65,     // average human eye height
  bobEnabled: true,
  bobWalkFrequency: 7.5,
  bobWalkAmplitude: 0.022,    // 2.2 cm vertical bob
  bobRunFrequency: 9.8,
  bobRunAmplitude: 0.038,     // 3.8 cm vertical bob
  idleBreathingEnabled: true,
  idleBreathingFrequency: 1.5,
  idleBreathingAmplitude: 0.005, // 5 mm breathing displacement
  bobBlendSpeed: 6.0
};
