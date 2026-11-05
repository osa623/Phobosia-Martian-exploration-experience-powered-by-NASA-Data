import { TRIGGERS } from "../../systems/operating-system/triggerRegistry";

const moduleFromLocation = (location: string): string => {
  if (location.startsWith("Habitat")) return "Habitat";
  if (location.startsWith("Engineering Unit")) return "Engineering";
  if (location.startsWith("Research Lab")) return "Science";
  if (location.startsWith("Mission Control")) return "MissionControl";
  if (location.startsWith("Central Connector")) return "Hub";
  if (location.startsWith("Airlock")) return "Airlock";
  if (location.startsWith("Mars Terrain")) return "Terrain";
  return "";
};

const displayModule = (module: string): string => ({
  MissionControl: "Mission Control",
  Science: "Research Lab",
  Engineering: "Engineering Unit",
  Hub: "Central Hub",
  Terrain: "Mars Terrain"
}[module] ?? module);

export const SOL10_TRIGGER_CHECKS = Object.entries(TRIGGERS)
  .filter(([, spec]) => !spec.workstation)
  .map(([triggerId, spec]) => {
    const module = moduleFromLocation(spec.location);
    const taskId = `SOL10_VERIFY_${triggerId.toUpperCase().replace(/[^A-Z0-9]+/g, "_")}`;
    return {
      taskId,
      triggerId,
      title: `Verify ${spec.title} Status`,
      location: spec.location,
      module,
      moduleLabel: displayModule(module),
      section: spec.title,
      objective: `Use the existing ${spec.title} physical interaction point in ${spec.location}. Review the persisted SOL 1–9 records associated with this trigger, then record its current status and any limitation. This task is activated by the physical trigger, not by opening an unrelated display.`,
      interfaceId: `SOL10_TRIGGER_${triggerId.toUpperCase().replace(/[^A-Z0-9]+/g, "_")}`
    };
  });

export type Sol10VerificationStatus = "verified" | "flagged" | "incomplete";
export interface Sol10TriggerVerification {
  taskId: string;
  triggerId: string;
  status: Sol10VerificationStatus;
  notes: string;
  completedAt: string;
}
