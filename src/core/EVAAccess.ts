export type EVARestrictedDestination = "Terrain" | "Hub";

export const EVA_PREPARATION_TRIGGER_ID = "Mars_Observation_Preparation_Trigger";

/** Shared access policy used by every route into outdoor terrain and the Central Hub. */
export function getEVAAccessBlockReason(destination: EVARestrictedDestination, suitActive: boolean, stormLockdown = false): string | null {
  if (destination === "Terrain" && stormLockdown) {
    return "Mars surface access temporarily restricted by the active Sol 7 dust-storm assessment. Existing EVA suit requirements still apply.";
  }
  if (destination === "Terrain" && !suitActive) {
    return "EVA suit required. Visit the Mars Observation Preparation Area and activate your suit before entering the Mars terrain.";
  }
  if (destination === "Hub" && suitActive) {
    return "EVA suit active. Return to the Mars Observation Preparation Area and remove your suit before entering the Central Hub.";
  }
  return null;
}

export function isWithinEVAInteractionRange(distance: number, range: number): boolean {
  return Number.isFinite(distance) && Number.isFinite(range) && distance <= range;
}
