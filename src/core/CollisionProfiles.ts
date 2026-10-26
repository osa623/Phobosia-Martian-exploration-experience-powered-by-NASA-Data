export type CollisionModule = "Habitat" | "Hub" | "Airlock" | "Engineering" | "Science" | "MissionControl";
export type CollisionProfile = { maxRoomFootprint: number; roomShells: readonly string[] };

// Audited independently from each module export. These values only suppress
// combined room-shell meshes; individual solid meshes still receive bounds.
export const collisionProfiles: Record<CollisionModule, CollisionProfile> = {
  Habitat: { maxRoomFootprint: 58, roomShells: ["Cube008", "Cube008_2"] },
  Hub: { maxRoomFootprint: 65, roomShells: [] },
  Airlock: { maxRoomFootprint: 65, roomShells: [] },
  Engineering: { maxRoomFootprint: 80, roomShells: [] },
  Science: { maxRoomFootprint: 80, roomShells: [] },
  MissionControl: { maxRoomFootprint: 65, roomShells: [] }
};
