import {
  Customer,
  Property,
  Technician,
  TechnicianSlot,
  WorkOrder
} from "@dispatchai/shared";

export function generateSeedData() {
  // 1. 20 Synthetic Austin Customers
  const customers: Customer[] = [
    { id: "cust_101", firstName: "Alicia", lastName: "Ramirez", phone: "5125550101", email: "alicia.ramirez@example.com", createdAt: "2026-01-10T08:00:00Z" },
    { id: "cust_102", firstName: "Marcus", lastName: "Thorne", phone: "5125550102", email: "marcus.thorne@example.com", createdAt: "2026-01-12T09:30:00Z" },
    { id: "cust_103", firstName: "Maya", lastName: "Lin", phone: "5125550103", email: "maya.lin@example.com", createdAt: "2026-01-15T11:00:00Z" },
    { id: "cust_104", firstName: "David", lastName: "Sterling", phone: "5125550104", email: "david.s@example.com", createdAt: "2026-01-18T14:15:00Z" },
    { id: "cust_105", firstName: "Sophia", lastName: "Rodriguez", phone: "5125550105", email: "sophia.r@example.com", createdAt: "2026-01-20T10:00:00Z" },
    { id: "cust_106", firstName: "Liam", lastName: "O'Connor", phone: "5125550106", email: "liam.oc@example.com", createdAt: "2026-01-22T16:20:00Z" },
    { id: "cust_107", firstName: "Chloe", lastName: "Bennett", phone: "5125550107", email: "chloe.b@example.com", createdAt: "2026-01-25T13:45:00Z" },
    { id: "cust_108", firstName: "Julian", lastName: "Vasquez", phone: "5125550108", email: "julian.v@example.com", createdAt: "2026-01-28T09:10:00Z" },
    { id: "cust_109", firstName: "Hannah", lastName: "Abbott", phone: "5125550109", email: "hannah.a@example.com", createdAt: "2026-02-01T15:00:00Z" },
    { id: "cust_110", firstName: "Trevor", lastName: "King", phone: "5125550110", email: "trevor.k@example.com", createdAt: "2026-02-03T11:30:00Z" },
    { id: "cust_111", firstName: "Elena", lastName: "Reyes", phone: "5125550111", email: "elena.reyes@example.com", createdAt: "2026-02-05T08:45:00Z" },
    { id: "cust_112", firstName: "Noah", lastName: "Patel", phone: "5125550112", email: "noah.patel@example.com", createdAt: "2026-02-07T12:00:00Z" },
    { id: "cust_113", firstName: "Zoe", lastName: "Kaufman", phone: "5125550113", email: "zoe.k@example.com", createdAt: "2026-02-10T14:50:00Z" },
    { id: "cust_114", firstName: "Brandon", lastName: "Scott", phone: "5125550114", email: "brandon.s@example.com", createdAt: "2026-02-12T10:25:00Z" },
    { id: "cust_115", firstName: "Isabella", lastName: "Gomez", phone: "5125550115", email: "isabella.g@example.com", createdAt: "2026-02-15T09:00:00Z" },
    { id: "cust_116", firstName: "Tyler", lastName: "Brooks", phone: "5125550116", email: "tyler.b@example.com", createdAt: "2026-02-18T17:10:00Z" },
    { id: "cust_117", firstName: "Grace", lastName: "Kim", phone: "5125550117", email: "grace.kim@example.com", createdAt: "2026-02-20T11:15:00Z" },
    { id: "cust_118", firstName: "Lucas", lastName: "Henderson", phone: "5125550118", email: "lucas.h@example.com", createdAt: "2026-02-22T13:30:00Z" },
    { id: "cust_119", firstName: "Ava", lastName: "Morales", phone: "5125550119", email: "ava.m@example.com", createdAt: "2026-02-25T16:00:00Z" },
    { id: "cust_120", firstName: "Ethan", lastName: "Campbell", phone: "5125550120", email: "ethan.c@example.com", createdAt: "2026-02-28T08:30:00Z" }
  ];

  // 2. 20 Synthetic Austin Properties (One per customer, in distinct Austin zones)
  const properties: Property[] = [
    { id: "prop_201", customerId: "cust_101", addressLine1: "1402 South Congress Ave", city: "Austin", state: "TX", zipCode: "78704", serviceZone: "Austin-South" },
    { id: "prop_202", customerId: "cust_102", addressLine1: "2201 Barton Springs Rd", city: "Austin", state: "TX", zipCode: "78704", serviceZone: "Austin-South" },
    { id: "prop_203", customerId: "cust_103", addressLine1: "504 Colorado St", city: "Austin", state: "TX", zipCode: "78701", serviceZone: "Austin-Central" },
    { id: "prop_204", customerId: "cust_104", addressLine1: "11410 Century Oaks Terrace", city: "Austin", state: "TX", zipCode: "78758", serviceZone: "Austin-North" },
    { id: "prop_205", customerId: "cust_105", addressLine1: "4208 Manchaca Rd", city: "Austin", state: "TX", zipCode: "78704", serviceZone: "Austin-South" },
    { id: "prop_206", customerId: "cust_106", addressLine1: "1905 E 6th St", city: "Austin", state: "TX", zipCode: "78702", serviceZone: "Austin-East" },
    { id: "prop_207", customerId: "cust_107", addressLine1: "3810 Speedway", city: "Austin", state: "TX", zipCode: "78751", serviceZone: "Austin-Central" },
    { id: "prop_208", customerId: "cust_108", addressLine1: "2600 S Lamar Blvd", city: "Austin", state: "TX", zipCode: "78704", serviceZone: "Austin-South" },
    { id: "prop_209", customerId: "cust_109", addressLine1: "4550 Mueller Blvd", city: "Austin", state: "TX", zipCode: "78723", serviceZone: "Austin-East" },
    { id: "prop_210", customerId: "cust_110", addressLine1: "9500 Burnet Rd", city: "Austin", state: "TX", zipCode: "78758", serviceZone: "Austin-North" },
    { id: "prop_211", customerId: "cust_111", addressLine1: "701 W Riverside Dr", city: "Austin", state: "TX", zipCode: "78704", serviceZone: "Austin-South" },
    { id: "prop_212", customerId: "cust_112", addressLine1: "1100 E 11th St", city: "Austin", state: "TX", zipCode: "78702", serviceZone: "Austin-East" },
    { id: "prop_213", customerId: "cust_113", addressLine1: "3100 Guadalupe St", city: "Austin", state: "TX", zipCode: "78705", serviceZone: "Austin-Central" },
    { id: "prop_214", customerId: "cust_114", addressLine1: "12400 N Interstate 35", city: "Austin", state: "TX", zipCode: "78753", serviceZone: "Austin-North" },
    { id: "prop_215", customerId: "cust_115", addressLine1: "5207 Brodie Ln", city: "Austin", state: "TX", zipCode: "78745", serviceZone: "Austin-South" },
    { id: "prop_216", customerId: "cust_116", addressLine1: "2113 Manor Rd", city: "Austin", state: "TX", zipCode: "78722", serviceZone: "Austin-East" },
    { id: "prop_217", customerId: "cust_117", addressLine1: "1000 West Ave", city: "Austin", state: "TX", zipCode: "78701", serviceZone: "Austin-Central" },
    { id: "prop_218", customerId: "cust_118", addressLine1: "10710 Research Blvd", city: "Austin", state: "TX", zipCode: "78759", serviceZone: "Austin-North" },
    { id: "prop_219", customerId: "cust_119", addressLine1: "2410 E Riverside Dr", city: "Austin", state: "TX", zipCode: "78741", serviceZone: "Austin-South" },
    { id: "prop_220", customerId: "cust_120", addressLine1: "4600 Seton Center Pkwy", city: "Austin", state: "TX", zipCode: "78759", serviceZone: "Austin-North" }
  ];

  // 3. 6 Technicians (HVAC, Plumbing, Dual, and one Off-Duty)
  const technicians: Technician[] = [
    {
      id: "tech_01",
      name: "Carlos Mendoza",
      skills: ["HVAC"],
      serviceZones: ["Austin-Central", "Austin-South"],
      status: "ACTIVE"
    },
    {
      id: "tech_02",
      name: "Sarah Jenkins",
      skills: ["HVAC"],
      serviceZones: ["Austin-North", "Austin-Central"],
      status: "ACTIVE"
    },
    {
      id: "tech_03",
      name: "Robert Miller",
      skills: ["PLUMBING"],
      serviceZones: ["Austin-South", "Austin-East"],
      status: "ACTIVE"
    },
    {
      id: "tech_04",
      name: "Emily Chen",
      skills: ["PLUMBING"],
      serviceZones: ["Austin-Central", "Austin-North"],
      status: "ACTIVE"
    },
    {
      id: "tech_05",
      name: "David Taylor",
      skills: ["HVAC", "PLUMBING"],
      serviceZones: ["Austin-Central", "Austin-South", "Austin-North"],
      status: "ACTIVE"
    },
    {
      id: "tech_06",
      name: "Frank Alvarez",
      skills: ["HVAC"],
      serviceZones: ["Austin-East"],
      status: "OFF_DUTY" // Explicitly off duty for filtering tests
    }
  ];

  // 4. Technician availability: stable fixture dates plus the current and next seven UTC days.
  const slots: TechnicianSlot[] = [];
  const dates = ["2026-09-18", "2026-09-19"];
  for (let offset = 0; offset <= 7; offset++) {
    const day = new Date();
    day.setUTCHours(0, 0, 0, 0);
    day.setUTCDate(day.getUTCDate() + offset);
    const date = day.toISOString().slice(0, 10);
    if (!dates.includes(date)) dates.push(date);
  }
  const windows = [
    { start: "08:00:00Z", end: "10:00:00Z" },
    { start: "10:00:00Z", end: "12:00:00Z" },
    { start: "13:00:00Z", end: "15:00:00Z" },
    { start: "15:00:00Z", end: "17:00:00Z" }
  ];

  let slotCounter = 301;
  for (const date of dates) {
    for (const tech of technicians) {
      for (const w of windows) {
        // First few slots can be marked booked or reserved for realistic initial state
        const slotId = date === "2026-09-18" || date === "2026-09-19"
          ? `slot_${slotCounter++}`
          : `slot_${date.replaceAll("-", "")}_${tech.id}_${w.start.slice(0, 2)}`;
        let status: "AVAILABLE" | "RESERVED" | "BOOKED" = "AVAILABLE";

        // Specifically reserve/book a few known slots for tests
        if (slotId === "slot_301") {
          status = "BOOKED"; // tech_01 08-10 today is booked
        } else if (slotId === "slot_302") {
          status = "RESERVED"; // tech_01 10-12 today is reserved
        }

        slots.push({
          id: slotId,
          technicianId: tech.id,
          startAt: `${date}T${w.start}`,
          endAt: `${date}T${w.end}`,
          status
        });
      }
    }
  }

  // 5. 25 Work Orders (Historical, completed, in-progress, dispatched, and booked)
  const workOrders: WorkOrder[] = [
    {
      id: "wo_1001",
      customerId: "cust_101",
      propertyId: "prop_201",
      technicianId: "tech_01",
      serviceType: "HVAC",
      issueSummary: "Central AC blowing warm air in master bedroom",
      urgency: "HIGH",
      scheduledStart: "2026-09-18T08:00:00Z",
      scheduledEnd: "2026-09-18T10:00:00Z",
      status: "IN_PROGRESS",
      createdBy: "VOICE_AGENT",
      createdAt: "2026-09-18T07:15:00Z",
      updatedAt: "2026-09-18T08:00:00Z"
    },
    {
      id: "wo_1002",
      customerId: "cust_103",
      propertyId: "prop_203",
      technicianId: "tech_04",
      serviceType: "PLUMBING",
      issueSummary: "Kitchen sink drain clogged and leaking beneath cabinet",
      urgency: "STANDARD",
      scheduledStart: "2026-09-18T10:00:00Z",
      scheduledEnd: "2026-09-18T12:00:00Z",
      status: "DISPATCHED",
      createdBy: "WEB_AGENT",
      createdAt: "2026-09-17T18:30:00Z",
      updatedAt: "2026-09-18T09:00:00Z"
    },
    {
      id: "wo_1003",
      customerId: "cust_105",
      propertyId: "prop_205",
      technicianId: "tech_03",
      serviceType: "PLUMBING",
      issueSummary: "Main water shutoff valve dripping",
      urgency: "STANDARD",
      scheduledStart: "2026-09-18T13:00:00Z",
      scheduledEnd: "2026-09-18T15:00:00Z",
      status: "BOOKED",
      createdBy: "HUMAN",
      createdAt: "2026-09-17T14:00:00Z",
      updatedAt: "2026-09-17T14:00:00Z"
    }
  ];

  // 22 diverse, realistic field-service work orders across Austin metro
  const historicalProfiles: Array<{
    serviceType: "HVAC" | "PLUMBING";
    issueSummary: string;
    techIndex: number;
    urgency: "HIGH" | "STANDARD";
    startHour: string;
    endHour: string;
    dayOffset: number;
    status: "BOOKED" | "DISPATCHED" | "IN_PROGRESS" | "COMPLETED";
  }> = [
    { serviceType: "HVAC", issueSummary: "Thermostat unresponsive and AC fan short cycling", techIndex: 1, urgency: "HIGH", startHour: "09:00:00Z", endHour: "11:00:00Z", dayOffset: 0, status: "IN_PROGRESS" },
    { serviceType: "PLUMBING", issueSummary: "Main sewer line slow drainage and gurgling in downstairs half-bath", techIndex: 2, urgency: "STANDARD", startHour: "10:30:00Z", endHour: "12:30:00Z", dayOffset: 0, status: "DISPATCHED" },
    { serviceType: "HVAC", issueSummary: "Capacitor failure on outdoor condenser unit with loud humming", techIndex: 0, urgency: "STANDARD", startHour: "11:00:00Z", endHour: "13:00:00Z", dayOffset: 0, status: "BOOKED" },
    { serviceType: "PLUMBING", issueSummary: "Water heater pressure relief valve continuously leaking", techIndex: 3, urgency: "HIGH", startHour: "11:30:00Z", endHour: "13:30:00Z", dayOffset: 0, status: "BOOKED" },
    { serviceType: "HVAC", issueSummary: "Ductwork air leak in attic trunk causing low airflow to south wing", techIndex: 4, urgency: "STANDARD", startHour: "13:00:00Z", endHour: "15:00:00Z", dayOffset: 0, status: "BOOKED" },
    { serviceType: "PLUMBING", issueSummary: "Garbage disposal unit seized and leaking around mounting flange", techIndex: 2, urgency: "STANDARD", startHour: "14:00:00Z", endHour: "16:00:00Z", dayOffset: 0, status: "BOOKED" },
    { serviceType: "HVAC", issueSummary: "Evaporator coil frozen with heavy ice buildup and condensation overflow", techIndex: 1, urgency: "HIGH", startHour: "14:30:00Z", endHour: "16:30:00Z", dayOffset: 0, status: "BOOKED" },
    { serviceType: "PLUMBING", issueSummary: "Master bathroom shower cartridge failure preventing hot water shutoff", techIndex: 3, urgency: "HIGH", startHour: "15:00:00Z", endHour: "17:00:00Z", dayOffset: 0, status: "BOOKED" },
    { serviceType: "HVAC", issueSummary: "Condensate drain line backed up causing safety float switch trip", techIndex: 0, urgency: "STANDARD", startHour: "15:30:00Z", endHour: "17:30:00Z", dayOffset: 0, status: "BOOKED" },
    { serviceType: "PLUMBING", issueSummary: "Outdoor hose bibb cracked from freeze with active spray", techIndex: 4, urgency: "STANDARD", startHour: "16:00:00Z", endHour: "18:00:00Z", dayOffset: 0, status: "BOOKED" },
    { serviceType: "HVAC", issueSummary: "Blower motor bearing worn out with high-pitched squeal", techIndex: 1, urgency: "STANDARD", startHour: "08:30:00Z", endHour: "10:30:00Z", dayOffset: 1, status: "COMPLETED" },
    { serviceType: "PLUMBING", issueSummary: "Tankless water heater mineral scaling and error code E02 flush", techIndex: 2, urgency: "STANDARD", startHour: "09:00:00Z", endHour: "11:00:00Z", dayOffset: 1, status: "COMPLETED" },
    { serviceType: "HVAC", issueSummary: "Zone damper actuator replacement on upstairs HVAC zone", techIndex: 4, urgency: "STANDARD", startHour: "10:00:00Z", endHour: "12:00:00Z", dayOffset: 1, status: "COMPLETED" },
    { serviceType: "PLUMBING", issueSummary: "Sump pump check valve failure and basement basin overflow", techIndex: 3, urgency: "STANDARD", startHour: "11:00:00Z", endHour: "13:00:00Z", dayOffset: 1, status: "COMPLETED" },
    { serviceType: "HVAC", issueSummary: "Refrigerant leak detection and system recharge with R-410A", techIndex: 0, urgency: "STANDARD", startHour: "12:30:00Z", endHour: "14:30:00Z", dayOffset: 1, status: "COMPLETED" },
    { serviceType: "PLUMBING", issueSummary: "Kitchen island under-sink P-trap cracked and leaking water", techIndex: 2, urgency: "STANDARD", startHour: "13:30:00Z", endHour: "15:30:00Z", dayOffset: 1, status: "COMPLETED" },
    { serviceType: "HVAC", issueSummary: "Seasonal AC efficiency tuneup, coil cleaning, and filter swap", techIndex: 1, urgency: "STANDARD", startHour: "14:00:00Z", endHour: "16:00:00Z", dayOffset: 1, status: "COMPLETED" },
    { serviceType: "PLUMBING", issueSummary: "Toilet fill valve continuous running water and flapper replacement", techIndex: 3, urgency: "STANDARD", startHour: "15:00:00Z", endHour: "17:00:00Z", dayOffset: 1, status: "COMPLETED" },
    { serviceType: "HVAC", issueSummary: "Contactor points pitted causing intermittent heat pump startup", techIndex: 4, urgency: "STANDARD", startHour: "09:00:00Z", endHour: "11:00:00Z", dayOffset: 2, status: "COMPLETED" },
    { serviceType: "PLUMBING", issueSummary: "Gas water heater pilot thermocouple replacement", techIndex: 2, urgency: "STANDARD", startHour: "11:00:00Z", endHour: "13:00:00Z", dayOffset: 2, status: "COMPLETED" },
    { serviceType: "HVAC", issueSummary: "Ecobee smart thermostat wiring harness short and power cycle", techIndex: 0, urgency: "STANDARD", startHour: "13:00:00Z", endHour: "15:00:00Z", dayOffset: 2, status: "COMPLETED" },
    { serviceType: "PLUMBING", issueSummary: "Emergency water main shutoff valve seized and corroded", techIndex: 3, urgency: "HIGH", startHour: "15:30:00Z", endHour: "17:30:00Z", dayOffset: 2, status: "COMPLETED" }
  ];

  historicalProfiles.forEach((prof, idx) => {
    const num = idx + 4;
    const cust = customers[(num - 1) % customers.length];
    const prop = properties[(num - 1) % properties.length];
    const tech = technicians[prof.techIndex];
    const day = 18 - prof.dayOffset;
    const dateStr = `2026-09-${day < 10 ? "0" + day : day}`;

    workOrders.push({
      id: `wo_10${num < 10 ? "0" + num : num}`,
      customerId: cust.id,
      propertyId: prop.id,
      technicianId: tech.id,
      serviceType: prof.serviceType,
      issueSummary: prof.issueSummary,
      urgency: prof.urgency,
      scheduledStart: `${dateStr}T${prof.startHour}`,
      scheduledEnd: `${dateStr}T${prof.endHour}`,
      status: prof.status,
      createdBy: num % 3 === 0 ? "VOICE_AGENT" : num % 3 === 1 ? "WEB_AGENT" : "HUMAN",
      createdAt: `${dateStr}T07:30:00Z`,
      updatedAt: `${dateStr}T08:00:00Z`
    });
  });

  return {
    customers,
    properties,
    technicians,
    slots,
    workOrders
  };
}
