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

  public addUpcomingSlots(): void {
    let changed = false;
    for (const slot of generateSeedData().slots) {
      if (!slot.id.startsWith("slot_20") || this.slots.has(slot.id)) continue;
      this.slots.set(slot.id, slot);
      changed = true;
    }
    if (changed) this.persist();
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
    this.customers.clear();
    this.properties.clear();
    this.technicians.clear();
    this.slots.clear();
    this.workOrders.clear();
    this.idempotencyRecords.clear();
    this.integrationEvents = [];
    this.notifications = [];

    const seed = generateSeedData();

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
