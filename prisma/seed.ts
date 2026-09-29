/**
 * Development seed data: service stages, fictional customers, equipment, work orders at
 * different stages, and a user for every role. Run with `npm run db:seed` (it also runs
 * after `npx prisma migrate reset`).
 *
 * Every record has a fixed ID and is created only if missing, so re-running the seed never
 * duplicates data or overwrites changes made while testing. It refuses to run against
 * anything but a local database.
 */
import { PrismaClient, UserRole, type CustomerFacingStatus, type WorkOrderCondition } from "@prisma/client";
import { ensureInitialStages } from "../src/features/work-orders/initial-stages";

const prisma = new PrismaClient();

function assertLocalDatabase() {
  const url = process.env.DATABASE_URL ?? "";
  const host = (() => {
    try {
      return new URL(url).hostname;
    } catch {
      return "";
    }
  })();
  const isLocal = ["localhost", "127.0.0.1", "::1", "database"].includes(host);
  if (process.env.NODE_ENV === "production" || !isLocal) {
    throw new Error(`Refusing to seed a non-local database (host "${host || "unknown"}"). The seed is for local development only.`);
  }
}

/** Stable IDs for seed records: "seed" namespace + a two-part number. */
function seedId(group: number, item: number) {
  return `5eed0000-0000-4000-8000-${String(group).padStart(4, "0")}${String(item).padStart(8, "0")}`;
}

function daysAgo(days: number, hour = 9) {
  const date = new Date();
  date.setDate(date.getDate() - days);
  date.setHours(hour, 0, 0, 0);
  return date;
}

const users = [
  // The first two match the development sign-in identities in src/services/development-identity.ts.
  { id: seedId(1, 1), identitySubject: "development:service-manager", email: "service.manager@vactech.test", firstName: "Alex", lastName: "Morgan", internalRole: UserRole.VACTECH_MANAGER },
  { id: seedId(1, 2), identitySubject: "development:customer-user", email: "customer.user@vactech.test", firstName: "Jordan", lastName: "Lee", internalRole: null },
  { id: seedId(1, 3), identitySubject: "seed:admin", email: "portal.admin@vactech.test", firstName: "Sam", lastName: "Rivera", internalRole: UserRole.PORTAL_ADMINISTRATOR },
  { id: seedId(1, 4), identitySubject: "seed:technician-1", email: "tech.one@vactech.test", firstName: "Riley", lastName: "Chen", internalRole: UserRole.VACTECH_SERVICE_USER },
  { id: seedId(1, 5), identitySubject: "seed:technician-2", email: "tech.two@vactech.test", firstName: "Casey", lastName: "Patel", internalRole: UserRole.VACTECH_SERVICE_USER },
  { id: seedId(1, 6), identitySubject: "seed:customer-2", email: "maintenance.lead@cascadewafer.test", firstName: "Morgan", lastName: "Diaz", internalRole: null },
] as const;

const companies = [
  { id: seedId(2, 1), name: "Desert Fab Technologies" },
  { id: seedId(2, 2), name: "Cascade Wafer Systems" },
  { id: seedId(2, 3), name: "Example Research Lab" },
];

const locations = [
  { id: seedId(3, 1), companyId: companies[0].id, name: "Chandler Fab 2", city: "Chandler", region: "AZ", country: "USA" },
  { id: seedId(3, 2), companyId: companies[0].id, name: "Tempe R&D", city: "Tempe", region: "AZ", country: "USA" },
  { id: seedId(3, 3), companyId: companies[1].id, name: "Hillsboro Campus", city: "Hillsboro", region: "OR", country: "USA" },
];

const equipment = [
  { id: seedId(4, 1), companyId: companies[0].id, locationId: locations[0].id, productModel: "Edwards iXH610", serialNumber: "EX-IXH-20417", description: "Dry pump, etch chamber 3" },
  { id: seedId(4, 2), companyId: companies[0].id, locationId: locations[0].id, productModel: "Pfeiffer HiPace 700", serialNumber: "EX-HP7-88213", description: "Turbo pump, CVD line" },
  { id: seedId(4, 3), companyId: companies[0].id, locationId: locations[1].id, productModel: "Busch COBRA NC 0100", serialNumber: "EX-CBR-00931", description: null },
  { id: seedId(4, 4), companyId: companies[1].id, locationId: locations[2].id, productModel: "Edwards IL70N", serialNumber: "EX-IL7-55102", description: "Load lock pump" },
  { id: seedId(4, 5), companyId: companies[1].id, locationId: locations[2].id, productModel: "Pfeiffer A 100 L", serialNumber: "EX-A1L-30388", description: null },
  { id: seedId(4, 6), companyId: companies[2].id, locationId: null, productModel: "Edwards nXDS15i", serialNumber: "EX-NXD-71450", description: "Scroll pump, analytical lab" },
];

type SeedWorkOrder = {
  id: string;
  equipmentIndex: number;
  number: string;
  summary: string;
  priority: string | null;
  receivedDaysAgo: number;
  path: { stage: string; daysAgo: number; condition?: WorkOrderCondition }[];
  updates?: { title: string; body: string; daysAgo: number }[];
  findings?: { title: string; body: string; daysAgo: number }[];
};

const workOrders: SeedWorkOrder[] = [
  {
    id: seedId(5, 1), equipmentIndex: 0, number: "50112 AZ", summary: "Pump rebuild. Contaminants: NF3.", priority: "High", receivedDaysAgo: 12,
    path: [{ stage: "RECEIVED", daysAgo: 12 }, { stage: "INITIAL_INSPECTION", daysAgo: 11 }, { stage: "EVALUATION", daysAgo: 9 }, { stage: "REPAIR_IN_PROGRESS", daysAgo: 4 }],
    updates: [{ title: "Pump received", body: "Your pump arrived and passed intake inspection. Photos of its arrival condition are attached.", daysAgo: 12 }, { title: "Rebuild underway", body: "Teardown found worn bearings and seals. A major kit has been installed and reassembly is in progress.", daysAgo: 4 }],
    findings: [{ title: "Bearing noise on arrival", body: "Audible bearing noise at spin-down. Rotor shows light scoring on the inlet stage.", daysAgo: 11 }],
  },
  {
    id: seedId(5, 2), equipmentIndex: 1, number: "50118 AZ", summary: "Turbo pump service, error E-023.", priority: null, receivedDaysAgo: 7,
    path: [{ stage: "RECEIVED", daysAgo: 7 }, { stage: "QUOTE_PREPARATION", daysAgo: 5 }, { stage: "AWAITING_CUSTOMER_APPROVAL", daysAgo: 3, condition: "AWAITING_CUSTOMER" }],
    updates: [{ title: "Quote sent", body: "We sent a repair quote to your purchasing contact. Work continues as soon as it's approved.", daysAgo: 3 }],
  },
  {
    id: seedId(5, 3), equipmentIndex: 2, number: "50121 AZ", summary: "Annual preventive maintenance.", priority: "Normal", receivedDaysAgo: 2,
    path: [{ stage: "RECEIVED", daysAgo: 2 }],
  },
  {
    id: seedId(5, 4), equipmentIndex: 3, number: "50097 OR", summary: "Pump rebuild after seizure.", priority: "High", receivedDaysAgo: 30,
    path: [{ stage: "RECEIVED", daysAgo: 30 }, { stage: "EVALUATION", daysAgo: 27 }, { stage: "REPAIR_IN_PROGRESS", daysAgo: 20 }, { stage: "TESTING", daysAgo: 14 }, { stage: "SHIPPED", daysAgo: 10 }, { stage: "COMPLETED", daysAgo: 8 }],
    updates: [{ title: "Repair complete and shipped", body: "Your pump passed final testing and shipped by ground freight.", daysAgo: 10 }],
    findings: [{ title: "Seized rotor", body: "Rotor seized due to process deposits. Cleaned, replaced bearings and seals, balanced rotor.", daysAgo: 26 }],
  },
  {
    id: seedId(5, 5), equipmentIndex: 4, number: "50115 OR", summary: "Leak rate out of spec.", priority: null, receivedDaysAgo: 9,
    path: [{ stage: "RECEIVED", daysAgo: 9 }, { stage: "REPAIR_AUTHORIZED", daysAgo: 6 }, { stage: "REPAIR_IN_PROGRESS", daysAgo: 5, condition: "WAITING_ON_PARTS" }],
  },
  {
    id: seedId(5, 6), equipmentIndex: 5, number: "50120 AZ", summary: "Warranty review: noise after previous repair.", priority: null, receivedDaysAgo: 3,
    path: [{ stage: "RECEIVED", daysAgo: 3 }, { stage: "INITIAL_INSPECTION", daysAgo: 2, condition: "WARRANTY_REVIEW" }],
  },
];

const accessRequests = [
  { id: seedId(6, 1), firstName: "Taylor", lastName: "Brooks", email: "taylor.brooks@desertfab.test", requestedCompany: "Desert Fab Technologies", message: "I manage pump maintenance for Fab 2 and need to track our repairs." },
  { id: seedId(6, 2), firstName: "Jamie", lastName: "Nguyen", email: "jamie.nguyen@newcustomer.test", requestedCompany: "New Customer Inc.", message: null },
];

async function main() {
  assertLocalDatabase();
  await ensureInitialStages(prisma);
  const stages = new Map((await prisma.serviceStage.findMany()).map((stage) => [stage.code, stage]));
  const stage = (code: string) => {
    const found = stages.get(code);
    if (!found) throw new Error(`Missing service stage ${code}`);
    return found;
  };

  for (const user of users) {
    await prisma.user.upsert({
      where: { identitySubject: user.identitySubject },
      update: {},
      create: { ...user, displayName: `${user.firstName} ${user.lastName}` },
    });
  }
  const userIds = new Map((await prisma.user.findMany({ where: { identitySubject: { in: users.map((user) => user.identitySubject) } } })).map((user) => [user.identitySubject, user.id]));
  const userId = (identitySubject: string) => userIds.get(identitySubject)!;
  const manager = userId("development:service-manager");
  const technicians = [userId("seed:technician-1"), userId("seed:technician-2")];

  for (const company of companies) {
    await prisma.company.upsert({ where: { id: company.id }, update: {}, create: company });
  }
  for (const location of locations) {
    await prisma.location.upsert({ where: { id: location.id }, update: {}, create: location });
  }
  for (const item of equipment) {
    await prisma.equipment.upsert({ where: { id: item.id }, update: {}, create: item });
  }

  const grants = [
    { id: seedId(7, 1), userId: userId("development:customer-user"), companyId: companies[0].id, locationId: null, scope: "COMPANY" as const },
    { id: seedId(7, 2), userId: userId("seed:customer-2"), companyId: companies[1].id, locationId: locations[2].id, scope: "LOCATION" as const },
  ];
  for (const grant of grants) {
    await prisma.userAccess.upsert({ where: { id: grant.id }, update: {}, create: { ...grant, role: UserRole.CUSTOMER_USER } });
  }

  for (const [index, order] of workOrders.entries()) {
    if (await prisma.workOrder.findUnique({ where: { id: order.id }, select: { id: true } })) continue;
    const unit = equipment[order.equipmentIndex];
    const last = order.path[order.path.length - 1];
    const currentStage = stage(last.stage);
    const technician = technicians[index % technicians.length];
    await prisma.$transaction(async (transaction) => {
      await transaction.workOrder.create({
        data: {
          id: order.id,
          workOrderNumber: order.number,
          companyId: unit.companyId,
          locationId: unit.locationId,
          equipmentId: unit.id,
          summary: order.summary,
          priority: order.priority,
          serviceStageId: currentStage.id,
          condition: last.condition ?? "NORMAL",
          customerFacingStatus: currentStage.customerFacingStatus as CustomerFacingStatus,
          receivedAt: daysAgo(order.receivedDaysAgo),
          completedAt: last.stage === "COMPLETED" ? daysAgo(last.daysAgo, 15) : null,
          createdById: manager,
          createdAt: daysAgo(order.receivedDaysAgo),
        },
      });
      for (const [step, entry] of order.path.entries()) {
        await transaction.workOrderStatusHistory.create({
          data: { workOrderId: order.id, serviceStageId: stage(entry.stage).id, condition: entry.condition ?? "NORMAL", changedById: step === 0 ? manager : technician, createdAt: daysAgo(entry.daysAgo, 10 + step) },
        });
        await transaction.auditEvent.create({
          data: { workOrderId: order.id, actorUserId: step === 0 ? manager : technician, eventType: step === 0 ? "work-order.created" : "work-order.status-changed", entityType: "WorkOrder", entityId: order.id, customerVisible: true, createdAt: daysAgo(entry.daysAgo, 10 + step) },
        });
      }
      for (const update of order.updates ?? []) {
        await transaction.serviceUpdate.create({
          data: { workOrderId: order.id, title: update.title, body: update.body, visibility: "CUSTOMER_VISIBLE", createdById: technician, createdAt: daysAgo(update.daysAgo, 14) },
        });
      }
      for (const finding of order.findings ?? []) {
        await transaction.finding.create({
          data: { workOrderId: order.id, title: finding.title, body: finding.body, createdById: technician, createdAt: daysAgo(finding.daysAgo, 13) },
        });
      }
    });
  }

  for (const request of accessRequests) {
    await prisma.accessRequest.upsert({
      where: { id: request.id },
      update: {},
      create: { ...request, name: `${request.firstName} ${request.lastName}` },
    });
  }

  console.log(`Seeded ${users.length} users, ${companies.length} customers, ${equipment.length} units, ${workOrders.length} work orders and ${accessRequests.length} access requests.`);
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
