export interface EVAResourceSnapshot {
  oxygenPercent: number;
  batteryPercent: number;
  suitActive: boolean;
  outdoors: boolean;
  lastUpdatedAt: number;
}

export interface EVAResourceStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export const EVA_RESOURCE_KEY = "phobosia.eva.resources.v1";
export const EVA_SESSION_DURATION_SECONDS = 2 * 60 * 60;
export const EVA_OXYGEN_PERCENT_PER_SECOND = 100 / EVA_SESSION_DURATION_SECONDS;
export const EVA_BATTERY_PERCENT_PER_SECOND = 100 / EVA_SESSION_DURATION_SECONDS;

/** Small persistence-aware resource clock. Resources drain only while the physical player is outdoors. */
export class EVAResources {
  private snapshot: EVAResourceSnapshot;
  private secondsSinceSave = 0;

  constructor(private readonly storage?: EVAResourceStorage, now = Date.now()) {
    this.snapshot = this.read(now);
    if (this.snapshot.suitActive && this.snapshot.outdoors && this.snapshot.lastUpdatedAt < now) {
      const elapsed = Math.max(0, (now - this.snapshot.lastUpdatedAt) / 1000);
      this.consume(elapsed);
      this.snapshot.lastUpdatedAt = now;
      this.save();
    }
  }

  getState(): Readonly<EVAResourceSnapshot> {
    return { ...this.snapshot };
  }

  beginSession(now = Date.now()): Readonly<EVAResourceSnapshot> {
    this.snapshot = { oxygenPercent: 100, batteryPercent: 100, suitActive: true, outdoors: false, lastUpdatedAt: now };
    this.secondsSinceSave = 0;
    this.save();
    return this.getState();
  }

  endSession(now = Date.now()): Readonly<EVAResourceSnapshot> {
    this.snapshot.suitActive = false;
    this.snapshot.outdoors = false;
    this.snapshot.lastUpdatedAt = now;
    this.secondsSinceSave = 0;
    this.save();
    return this.getState();
  }

  setLocation(outdoors: boolean, now = Date.now()): Readonly<EVAResourceSnapshot> {
    this.snapshot.outdoors = this.snapshot.suitActive && outdoors;
    this.snapshot.lastUpdatedAt = now;
    this.save();
    return this.getState();
  }

  /** Pass actual elapsed seconds from the game clock; no frame-count-based depletion. */
  update(elapsedSeconds: number, outdoors: boolean, now = Date.now()): Readonly<EVAResourceSnapshot> {
    const shouldDrain = this.snapshot.suitActive && outdoors;
    this.snapshot.outdoors = shouldDrain;
    if (!shouldDrain) {
      this.snapshot.lastUpdatedAt = now;
      this.secondsSinceSave = 0;
      return this.getState();
    }
    if (shouldDrain && Number.isFinite(elapsedSeconds) && elapsedSeconds > 0) {
      this.consume(elapsedSeconds);
      this.secondsSinceSave += elapsedSeconds;
    }
    this.snapshot.lastUpdatedAt = now;
    if (this.secondsSinceSave >= 5) {
      this.secondsSinceSave = 0;
      this.save();
    }
    return this.getState();
  }

  private consume(seconds: number) {
    this.snapshot.oxygenPercent = clampResource(this.snapshot.oxygenPercent - EVA_OXYGEN_PERCENT_PER_SECOND * seconds);
    this.snapshot.batteryPercent = clampResource(this.snapshot.batteryPercent - EVA_BATTERY_PERCENT_PER_SECOND * seconds);
  }

  private read(now: number): EVAResourceSnapshot {
    try {
      const raw = this.storage?.getItem(EVA_RESOURCE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<EVAResourceSnapshot>;
        if (typeof parsed.oxygenPercent === "number" && typeof parsed.batteryPercent === "number") {
          return {
            oxygenPercent: clampResource(parsed.oxygenPercent),
            batteryPercent: clampResource(parsed.batteryPercent),
            suitActive: parsed.suitActive === true,
            outdoors: parsed.outdoors === true,
            lastUpdatedAt: typeof parsed.lastUpdatedAt === "number" && Number.isFinite(parsed.lastUpdatedAt) ? parsed.lastUpdatedAt : now
          };
        }
      }
    } catch { /* Storage may be unavailable in embedded/private contexts. */ }
    return { oxygenPercent: 100, batteryPercent: 100, suitActive: false, outdoors: false, lastUpdatedAt: now };
  }

  private save() {
    try { this.storage?.setItem(EVA_RESOURCE_KEY, JSON.stringify(this.snapshot)); }
    catch { /* Continue with in-memory resource values if persistence is blocked. */ }
  }
}

function clampResource(value: number): number {
  return Math.min(100, Math.max(0, Number.isFinite(value) ? value : 0));
}
