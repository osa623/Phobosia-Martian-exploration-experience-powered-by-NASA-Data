/**
 * PHOBOSIA — Mission Framework Foundation Types
 *
 * Designed for the 14-day Martian observation campaign.
 * In Phase 1, this defines the contracts and state shapes for future progression.
 */

export type MissionDayNumber = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14;

export type ObjectiveStatus = "locked" | "active" | "completed" | "optional-available";

export interface MissionObjective {
  id: string;
  day: MissionDayNumber;
  title: string;
  description: string;
  isMain: boolean;
  status: ObjectiveStatus;
  targetModule?: string;
  targetObjectIdentifier?: string;
  completedAt?: string;
}

export interface AtmosphericEvent {
  day: MissionDayNumber;
  name: string;
  intensity: "low" | "medium" | "severe";
  description: string;
  seed: number;
}

export interface MissionState {
  currentDay: MissionDayNumber;
  dayBriefingSeen: boolean;
  activeObjectives: MissionObjective[];
  completedObjectiveIds: string[];
  atmosphericEvents: AtmosphericEvent[];
  campaignFinished: boolean;
  lastSleepTimestamp?: string;
}

export const INITIAL_MISSION_STATE: MissionState = {
  currentDay: 1,
  dayBriefingSeen: false,
  activeObjectives: [
    {
      id: "day1_initial_briefing",
      day: 1,
      title: "Mission Briefing",
      description: "Review initial scientific parameters and Habitat status.",
      isMain: true,
      status: "active",
      targetModule: "Habitat",
      targetObjectIdentifier: "HAB_MONITOR_01"
    }
  ],
  completedObjectiveIds: [],
  atmosphericEvents: [
    // Pre-seeded reproducible atmospheric-event days
    { day: 4, name: "Dust Storm Approaching", intensity: "medium", description: "High altitude dust front detected.", seed: 401 },
    { day: 8, name: "Atmospheric Pressure Drop", intensity: "low", description: "Rapid barometric fluctuation across the canyon basin.", seed: 802 },
    { day: 12, name: "Solar Radiation Event", intensity: "severe", description: "Coronal particle influx; EVA restricted.", seed: 1203 }
  ],
  campaignFinished: false
};
