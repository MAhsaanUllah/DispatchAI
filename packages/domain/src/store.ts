import {
  Customer,
  Property,
  Technician,
  TechnicianSlot,
  WorkOrder,
  IntegrationEvent,
  LocalNotification
} from "@dispatchai/shared";
import { generateSeedData } from "./seed.js";
import { generateScheduleSlots } from "./schedule.js";
import { getBusinessConfig, readEnv } from "./templates.js";

export type Snapshot = {
  version: 1;
  customers: Customer[];
  properties: Property[];
  technicians: Technician[];
  slots: TechnicianSlot[];
  workOrders: WorkOrder[];
  idempotencyRecords: [string, unknown][];
  integrationEvents: IntegrationEvent[];
  notifications: LocalNotification[];
};

export class DispatchStore {
  public customers: Map<string, Customer> = new Map();
  public properties: Map<string, Property> = new Map();
  public technicians: Map<string, Technician> = new Map();
  public slots: Map<string, TechnicianSlot> = new Map();
  public workOrders: Map<string, WorkOrder> = new Map();
  public idempotencyRecords: Map<string, any> = new Map();
  public integrationEvents: IntegrationEvent[] = [];
  public notifications: LocalNotification[] = [];
  private save?: (snapshot: Snapshot) => void;

  constructor(snapshot?: Snapshot, save?: (snapshot: Snapshot) => void) {
    this.save = save;
    if (snapshot) this.restore(snapshot);
    else this.reset();
    this.addUpcomingSlots();
  }

  // True while this store still holds the fictional demo dataset. The seeded customers live on
  // example.com, so this stays true for an old demo database and turns false once the owner
  // works with real customers. It is what tells the dashboard "this is seeded, read only".
  public get demo(): boolean {
    for (const customer of this.customers.values()) {
      if (customer.email?.toLowerCase().endsWith("@example.com")) return true;
    }
    return false;
  }

  private restore(snapshot: Snapshot): void {
    if (snapshot.version !== 1 || !Array.isArray(snapshot.slots) || !Array.isArray(snapshot.workOrders)) {
      throw new Error("Unsupported or corrupt DispatchAI database snapshot");
    }
    this.customers = new Map(snapshot.customers.map((item) => [item.id, item]));
    this.properties = new Map(snapshot.properties.map((item) => [item.id, item]));
    this.technicians = new Map(snapshot.technicians.map((item) => [item.id, item]));
    this.slots = new Map(snapshot.slots.map((item) => [item.id, item]));
    this.workOrders = new Map(snapshot.workOrders.map((item) => [item.id, item]));
    this.idempotencyRecords = new Map(snapshot.idempotencyRecords);
    this.integrationEvents = snapshot.integrationEvents;
    this.notifications = snapshot.notifications ?? [];
  }

  // Demo mode tops up fixture slots; a real business gets slots from its opening hours and staff.
  public addUpcomingSlots(): void {
    let changed = false;
    const demo = this.demo || readEnv("SEED_DEMO_DATA") !== "false";
    const upcoming = demo
      ? generateSeedData(getBusinessConfig(), { force: true }).slots
      : generateScheduleSlots(getBusinessConfig(), [...this.technicians.values()]);
    for (const slot of upcoming) {
      if (!slot.id.startsWith("slot_20") || this.slots.has(slot.id)) continue;
      this.slots.set(slot.id, slot);
      changed = true;
    }
    if (changed) this.persist();
  }

  // After hours or staff change: drop future free slots and regenerate. Booked/reserved slots are kept.
  public rebuildFutureSlots(now = new Date().toISOString()): void {
    for (const [id, slot] of this.slots) {
      if (slot.status === "AVAILABLE" && slot.startAt > now) this.slots.delete(id);
    }
    this.addUpcomingSlots();
    this.persist();
  }

  // Replace the staff list. Staff with a future booking cannot be removed. Returns the blocking staff ids.
  public setStaff(staff: { id?: string; name: string; skills: string[]; hours?: Technician["hours"] }[], serviceZones: string[], now = new Date().toISOString()): string[] {
    const keep = new Set(staff.map((member) => member.id).filter(Boolean));
    const blocked = [...this.technicians.keys()].filter((id) => !keep.has(id) && [...this.slots.values()].some((slot) => slot.technicianId === id && slot.status !== "AVAILABLE" && slot.startAt > now));
    if (blocked.length > 0) return blocked;
    let next = Math.max(0, ...[...this.technicians.keys()].map((id) => Number(/^tech_(\d+)$/.exec(id)?.[1] ?? 0))) + 1;
    const updated = new Map<string, Technician>();
    for (const member of staff) {
      const id = member.id && this.technicians.has(member.id) ? member.id : `tech_${String(next++).padStart(2, "0")}`;
      updated.set(id, { id, name: member.name, skills: member.skills, serviceZones, status: "ACTIVE", ...(member.hours ? { hours: member.hours } : {}) });
    }
    this.technicians = updated;
    this.rebuildFutureSlots(now);
    return [];
  }

  public persist(): void {
    this.save?.(this.snapshot());
  }

  public snapshot(): Snapshot {
    return {
      version: 1,
      customers: [...this.customers.values()],
      properties: [...this.properties.values()],
      technicians: [...this.technicians.values()],
      slots: [...this.slots.values()],
      workOrders: [...this.workOrders.values()],
      idempotencyRecords: [...this.idempotencyRecords.entries()],
      integrationEvents: this.integrationEvents,
      notifications: this.notifications
    };
  }

  public reset(): void {
    // A demo install resets back to the demo dataset even if the env now says "no demo data".
    const wasDemo = this.demo;
    this.customers.clear();
    this.properties.clear();
    this.technicians.clear();
    this.slots.clear();
    this.workOrders.clear();
    this.idempotencyRecords.clear();
    this.integrationEvents = [];
    this.notifications = [];

    const seed = wasDemo ? generateSeedData(getBusinessConfig(), { force: true }) : generateSeedData();

    for (const c of seed.customers) {
      this.customers.set(c.id, { ...c });
    }
    for (const p of seed.properties) {
      this.properties.set(p.id, { ...p });
    }
    for (const t of seed.technicians) {
      this.technicians.set(t.id, { ...t });
    }
    for (const s of seed.slots) {
      this.slots.set(s.id, { ...s });
    }
    for (const w of seed.workOrders) {
      this.workOrders.set(w.id, { ...w });
    }
    this.persist();
  }

  public recordEvent(event: IntegrationEvent): void {
    this.integrationEvents.push(event);
    this.persist();
  }
}
