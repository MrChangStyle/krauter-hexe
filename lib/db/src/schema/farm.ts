import {
  type AnyPgColumn,
  boolean,
  date,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  real,
  serial,
  text,
  timestamp,
  unique,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { taskIntervalUnitEnum } from "./tasks";
import { beeColoniesTable } from "./bees";
import { gardenBedsTable } from "./garden";

// "Meine Farm" – the animal module of Little Farming (docs/meine-farm-app.md).
//
// Farm data is PRIVATE: only members of a farm see it – not other users, and
// not the app owner either (unlike the shared plant/insect archive). Every
// farm table carries farm_id, and all access goes through requireFarm()
// (api-server/src/middlewares/requireFarm.ts).
//
// The tables are created at server start by lib/schemaUpgrade.ts – keep both
// in sync (the statements there are generated from this file).

export const FARM_ROLES = ["admin", "caretaker", "guest"] as const;
export type FarmRole = (typeof FARM_ROLES)[number];

// Includes the animal keys the plant module already knows (src/lib/animals.ts
// in the app: poultry, rabbit, guineaPig, cat, horse), so plant toxicity per
// animal can later be matched to a farm animal directly.
export const FARM_SPECIES = [
  "poultry",
  "rabbit",
  "guineaPig",
  "cat",
  "horse",
  "dog",
  "goat",
  "sheep",
  "cattle",
  "pig",
  "alpaca",
  // Geflügel besides chickens (docs/gefluegel.md) – own feed, brood and weather values.
  "goose",
  "duck",
  "turkey",
  "quail",
  // Nandus (Laufvögel, count as poultry) and donkeys (docs/nandu-esel.md).
  "rhea",
  "donkey",
  "other",
] as const;
export type FarmSpecies = (typeof FARM_SPECIES)[number];

export const ANIMAL_SEXES = ["female", "male", "neutered", "unknown"] as const;
export type AnimalSex = (typeof ANIMAL_SEXES)[number];

// Stall tasks. Kept apart from the plant tasks (tasks table): those belong to
// one user and one plant, these to a farm and are shared by its members.
export const FARM_TASK_ACTIONS = [
  "Füttern",
  "Tränken",
  "Ausmisten",
  "Eier sammeln",
  "Entwurmen",
  "Impfen",
  "Klauen-/Hufpflege",
  "Gesundheitskontrolle",
  "Sonstiges",
] as const;
export type FarmTaskAction = (typeof FARM_TASK_ACTIONS)[number];

// Hof-Aufgaben (docs/hof-aufgaben.md): where a task shows besides the Hof list –
// "tiere" in Stall-Aufgaben and Am Stall, "garten" in the Pflanzen-Aufgaben,
// "hof" only in the Hof list.
export const FARM_TASK_AREAS = ["tiere", "garten", "hof"] as const;
export type FarmTaskArea = (typeof FARM_TASK_AREAS)[number];

export const farmRoleEnum = pgEnum("farm_role", FARM_ROLES);
export const farmTaskActionEnum = pgEnum("farm_task_action", FARM_TASK_ACTIONS);
export const farmSpeciesEnum = pgEnum("farm_species", FARM_SPECIES);
export const animalSexEnum = pgEnum("animal_sex", ANIMAL_SEXES);

export const farmsTable = pgTable("farms", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  // Where the farm is, for the weather (rounded to 0.1°, about 10 km – no exact address).
  postalCode: text("postal_code"),
  latitude: doublePrecision("latitude"),
  longitude: doublePrecision("longitude"),
  // Vertretung: what someone looking after the animals needs to know (keys, vet, quirks).
  handoverNote: text("handover_note"),
  // Hof einrichten: the admins closed the setup checklist.
  setupDismissedAt: timestamp("setup_dismissed_at", { withTimezone: true }),
  // Pflichten: the farm's registration number from the veterinary office
  // (Registriernummer nach ViehVerkV), and the last day of an official order
  // to keep poultry indoors (Aufstallungspflicht wegen Geflügelpest).
  holdingNumber: text("holding_number"),
  housingOrderUntil: date("housing_order_until", { mode: "string" }),
  // Pflichten je Bundesland: the Land (code like "BY") – which Tierseuchenkasse,
  // stock day and deadline apply (api-server lib/dutyStates.ts).
  state: text("state"),
  // Demo-Hof with example data (lib/demoData.ts) – "Demo-Daten löschen" removes it whole.
  isDemo: boolean("is_demo").notNull().default(false),
  // Bewirtschaftung (docs/bio.md): conventional | natural | organic | association,
  // the organic control body (e.g. "DE-ÖKO-006") and the start of the conversion.
  farming: text("farming").notNull().default("conventional"),
  organicControlBody: text("organic_control_body"),
  organicSince: date("organic_since", { mode: "string" }),
  // Bio je Bereich (docs/bio.md): areas the farm keeps conventional although
  // it farms naturally or organically, e.g. ["feed"] – keys of ORGANIC_AREAS
  // in api-server lib/farming.ts. Empty = Bio everywhere the level applies.
  organicOff: text("organic_off").array().notNull().default(sql`ARRAY[]::text[]`),
  // Nachhaltigkeit (docs/bio.md, B8): ticked measures, keys of SUSTAINABILITY_KEYS
  // in api-server lib/sustainability.ts – for every level of farming.
  sustainability: text("sustainability").array().notNull().default(sql`ARRAY[]::text[]`),
});

export const farmMembershipsTable = pgTable(
  "farm_memberships",
  {
    id: serial("id").primaryKey(),
    farmId: integer("farm_id")
      .notNull()
      .references(() => farmsTable.id, { onDelete: "cascade" }),
    // Text like every other user reference; account deletion handles it
    // (accountDeletion.ts – a farm without members goes with its last one).
    userId: text("user_id").notNull(),
    role: farmRoleEnum("role").notNull().default("caretaker"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    // Vertretung: last day of access (Berlin date); null = no end. Expired
    // memberships count as gone and are removed by the minute cron.
    accessUntil: date("access_until", { mode: "string" }),
    // Modul-Freigaben (docs/team.md): the farm modules this member may use;
    // null = all. Admins always have all. Checked in requireFarm.
    modules: jsonb("modules").$type<string[]>(),
  },
  (table) => [
    unique("farm_memberships_user_farm_unique").on(table.userId, table.farmId),
    index("farm_memberships_farm_idx").on(table.farmId),
  ],
);

export const herdsTable = pgTable(
  "herds",
  {
    id: serial("id").primaryKey(),
    farmId: integer("farm_id")
      .notNull()
      .references(() => farmsTable.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    species: farmSpeciesEnum("species").notNull(),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    // Platz-Check (Bio, docs/bio.md): stall floor and outdoor run of the group, m².
    stallM2: doublePrecision("stall_m2"),
    runM2: doublePrecision("run_m2"),
  },
  (table) => [index("herds_farm_idx").on(table.farmId)],
);

export const farmAnimalsTable = pgTable(
  "farm_animals",
  {
    id: serial("id").primaryKey(),
    farmId: integer("farm_id")
      .notNull()
      .references(() => farmsTable.id, { onDelete: "cascade" }),
    herdId: integer("herd_id").references(() => herdsTable.id, { onDelete: "set null" }),
    name: text("name").notNull(),
    species: farmSpeciesEnum("species").notNull(),
    breed: text("breed"),
    birthDate: date("birth_date", { mode: "string" }),
    sex: animalSexEnum("sex").notNull().default("unknown"),
    // Ring / ear tag – optional (not every animal has one yet); unique within
    // a farm when given, so the vet export can rely on it.
    registrationNumber: text("registration_number"),
    // Cloudinary URL. Nullable: uploads are non-fatal, like plant scans.
    imageUrl: text("image_url"),
    notes: text("notes"),
    // Set instead of deleting, so the medical history stays exportable.
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    // Zucht: the parents, when they are animals of the same farm (lib/breeding.ts).
    motherId: integer("mother_id").references((): AnyPgColumn => farmAnimalsTable.id, { onDelete: "set null" }),
    fatherId: integer("father_id").references((): AnyPgColumn => farmAnimalsTable.id, { onDelete: "set null" }),
  },
  (table) => [
    unique("farm_animals_farm_registration_unique").on(table.farmId, table.registrationNumber),
    index("farm_animals_farm_idx").on(table.farmId),
  ],
);

// Arzneimittel-Vorrat: medicines on the farm, with batch, expiry and the
// withdrawal periods from the package insert. Used up or thrown away → archived
// (the health records keep pointing at it).
export const medicinesTable = pgTable(
  "medicines",
  {
    id: serial("id").primaryKey(),
    farmId: integer("farm_id")
      .notNull()
      .references(() => farmsTable.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    activeIngredient: text("active_ingredient"),
    // "ml", "g", "Stück", … – the unit of amount and dose.
    unit: text("unit").notNull(),
    amount: doublePrecision("amount").notNull(),
    batch: text("batch"),
    expiresOn: date("expires_on", { mode: "string" }),
    withdrawalMeatDays: integer("withdrawal_meat_days"),
    withdrawalMilkDays: integer("withdrawal_milk_days"),
    withdrawalEggsDays: integer("withdrawal_eggs_days"),
    vet: text("vet"),
    receivedOn: date("received_on", { mode: "string" }),
    notes: text("notes"),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("medicines_farm_idx").on(table.farmId)],
);

export const medicalRecordsTable = pgTable(
  "medical_records",
  {
    id: serial("id").primaryKey(),
    farmId: integer("farm_id")
      .notNull()
      .references(() => farmsTable.id, { onDelete: "cascade" }),
    animalId: integer("animal_id")
      .notNull()
      .references(() => farmAnimalsTable.id, { onDelete: "cascade" }),
    date: date("date", { mode: "string" }).notNull(),
    diagnosis: text("diagnosis").notNull(),
    treatment: text("treatment"),
    medication: text("medication"),
    // Wartezeit for food-producing animals (days until milk/eggs/meat are
    // usable again).
    withdrawalPeriodDays: integer("withdrawal_period_days"),
    // Last day of a treatment over several days; the Wartezeit counts from
    // it (null: a single day, counted from date).
    treatmentUntil: date("treatment_until", { mode: "string" }),
    vet: text("vet"),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    // From the Arzneimittel-Vorrat: which medicine, how much was given (in its
    // unit, taken off the stock) and its batch – what the Bestandsbuch needs.
    medicineId: integer("medicine_id").references(() => medicinesTable.id, { onDelete: "set null" }),
    dose: doublePrecision("dose"),
    batch: text("batch"),
    // Bio (docs/bio.md): what kind of remedy – "chemical" (chemisch-synthetisch
    // allopathisch, counts towards the organic limit), "natural"
    // (Naturheilverfahren), "vaccine", "antiparasitic"; null = not said.
    remedyKind: text("remedy_kind"),
    // Entered on an organic farm: the Wartezeit is doubled, at least 2 days
    // (withdrawalPeriodDays stays the legal one).
    organic: boolean("organic").notNull().default(false),
  },
  (table) => [index("medical_records_farm_animal_idx").on(table.farmId, table.animalId)],
);

export const weightLogsTable = pgTable(
  "weight_logs",
  {
    id: serial("id").primaryKey(),
    farmId: integer("farm_id")
      .notNull()
      .references(() => farmsTable.id, { onDelete: "cascade" }),
    animalId: integer("animal_id")
      .notNull()
      .references(() => farmAnimalsTable.id, { onDelete: "cascade" }),
    date: date("date", { mode: "string" }).notNull(),
    weightKg: doublePrecision("weight_kg").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("weight_logs_farm_animal_idx").on(table.farmId, table.animalId)],
);

export const foodLogsTable = pgTable(
  "food_logs",
  {
    id: serial("id").primaryKey(),
    farmId: integer("farm_id")
      .notNull()
      .references(() => farmsTable.id, { onDelete: "cascade" }),
    animalId: integer("animal_id").references(() => farmAnimalsTable.id, { onDelete: "set null" }),
    herdId: integer("herd_id").references(() => herdsTable.id, { onDelete: "set null" }),
    date: date("date", { mode: "string" }).notNull(),
    imageUrl: text("image_url"),
    // AI nutrient analysis (step 5), stored as returned after validation.
    analysis: jsonb("analysis"),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("food_logs_farm_idx").on(table.farmId)],
);

export const farmTasksTable = pgTable(
  "farm_tasks",
  {
    id: serial("id").primaryKey(),
    farmId: integer("farm_id")
      .notNull()
      .references(() => farmsTable.id, { onDelete: "cascade" }),
    // At most one of the two; neither means the whole farm.
    animalId: integer("animal_id").references(() => farmAnimalsTable.id, { onDelete: "cascade" }),
    herdId: integer("herd_id").references(() => herdsTable.id, { onDelete: "cascade" }),
    actionType: farmTaskActionEnum("action_type").notNull(),
    // Hof-Aufgaben: own wording ("Teichpumpe kontrollieren"); null = the action type.
    title: text("title"),
    area: text("area").$type<FarmTaskArea>().notNull().default("tiere"),
    notes: text("notes"),
    // First due day (Berlin); null = one interval after creation, as before.
    startsOn: date("starts_on", { mode: "string" }),
    // false = once: due on startsOn, done for good when ticked off.
    repeats: boolean("repeats").notNull().default(true),
    // For one member; null = for everyone on the farm.
    assigneeId: text("assignee_id"),
    lastCompletedBy: text("last_completed_by"),
    // The completion before today's, so a tick of today can be taken back.
    prevCompletedAt: timestamp("prev_completed_at", { withTimezone: true }),
    // Same schedule model as the plant tasks: every <value> <unit>, reminder
    // at a Berlin wall-clock time (HH:MM), sent by the same cron.
    intervalValue: integer("interval_value").notNull(),
    intervalUnit: taskIntervalUnitEnum("interval_unit").notNull(),
    // Hof-Aufgaben: fixed weekdays instead of the interval (1 = Montag … 7 =
    // Sonntag, docs/hof-aufgaben.md); null = every <interval>.
    weekdays: jsonb("weekdays").$type<number[]>(),
    reminderTime: text("reminder_time").notNull(),
    isActive: boolean("is_active").notNull().default(true),
    lastCompletedAt: timestamp("last_completed_at", { withTimezone: true }),
    lastNotifiedAt: timestamp("last_notified_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("farm_tasks_farm_idx").on(table.farmId)],
);

// Comments on a Hof-Aufgabe ("Wir brauchen neue Eierkartons").
export const farmTaskCommentsTable = pgTable(
  "farm_task_comments",
  {
    id: serial("id").primaryKey(),
    farmId: integer("farm_id")
      .notNull()
      .references(() => farmsTable.id, { onDelete: "cascade" }),
    taskId: integer("task_id")
      .notNull()
      .references(() => farmTasksTable.id, { onDelete: "cascade" }),
    userId: text("user_id").notNull(),
    body: text("body").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("farm_task_comments_task_idx").on(table.farmId, table.taskId)],
);

// "Haltungs-Wiki": general AI husbandry notes per species. Not farm data –
// the same for every farm, generated once per species and then served from
// here (cache), so no farm_id.
export const husbandryGuidesTable = pgTable("husbandry_guides", {
  species: farmSpeciesEnum("species").primaryKey(),
  content: jsonb("content").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const camerasTable = pgTable(
  "cameras",
  {
    id: serial("id").primaryKey(),
    farmId: integer("farm_id")
      .notNull()
      .references(() => farmsTable.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    // sha256 of the camera's secret; the secret itself is shown only once.
    secretHash: text("secret_hash").notNull().unique(),
    relayUrl: text("relay_url"),
    cooldownSeconds: integer("cooldown_seconds").notNull().default(300),
    lastTriggeredAt: timestamp("last_triggered_at", { withTimezone: true }),
    // AI checks today (Berlin day in ai_day): the daily limits count here,
    // not in camera_events, which keep only the newest photos.
    aiDay: date("ai_day", { mode: "string" }),
    aiCount: integer("ai_count").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("cameras_farm_idx").on(table.farmId)],
);

export const cameraEventsTable = pgTable(
  "camera_events",
  {
    id: serial("id").primaryKey(),
    farmId: integer("farm_id")
      .notNull()
      .references(() => farmsTable.id, { onDelete: "cascade" }),
    cameraId: integer("camera_id")
      .notNull()
      .references(() => camerasTable.id, { onDelete: "cascade" }),
    imageUrl: text("image_url"),
    predatorDetected: boolean("predator_detected").notNull(),
    species: text("species"),
    confidence: real("confidence"),
    relayTriggered: boolean("relay_triggered").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("camera_events_farm_created_idx").on(table.farmId, table.createdAt)],
);

export type Farm = typeof farmsTable.$inferSelect;
export type FarmMembership = typeof farmMembershipsTable.$inferSelect;
export type FarmAnimal = typeof farmAnimalsTable.$inferSelect;
export type FarmTask = typeof farmTasksTable.$inferSelect;

// Pflichten (lib/farmDuties.ts): which duty a farm has ticked off – once
// ("once", e.g. the registration) or per year ("2027", the stock report as
// of 1 January).
export const farmDutyChecksTable = pgTable(
  "farm_duty_checks",
  {
    id: serial("id").primaryKey(),
    farmId: integer("farm_id")
      .notNull()
      .references(() => farmsTable.id, { onDelete: "cascade" }),
    dutyKey: text("duty_key").notNull(),
    period: text("period").notNull(),
    doneOn: date("done_on", { mode: "string" }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [unique("farm_duty_checks_farm_duty_period_unique").on(table.farmId, table.dutyKey, table.period)],
);

// Zucht (lib/breeding.ts): a mating or a clutch of eggs set to hatch, from the
// day of mating / setting to the birth or hatch. Expected dates and the steps
// on the way are computed from `duration_days`, not stored.
export const breedingRecordsTable = pgTable(
  "breeding_records",
  {
    id: serial("id").primaryKey(),
    farmId: integer("farm_id")
      .notNull()
      .references(() => farmsTable.id, { onDelete: "cascade" }),
    species: farmSpeciesEnum("species").notNull(),
    motherId: integer("mother_id").references(() => farmAnimalsTable.id, { onDelete: "set null" }),
    fatherId: integer("father_id").references(() => farmAnimalsTable.id, { onDelete: "set null" }),
    // A sire from elsewhere (Deckbock, Leihhahn).
    fatherName: text("father_name"),
    startedOn: date("started_on", { mode: "string" }).notNull(),
    durationDays: integer("duration_days").notNull(),
    // Eggs set (poultry only).
    eggCount: integer("egg_count"),
    // running | born | failed
    status: text("status").notNull().default("running"),
    endedOn: date("ended_on", { mode: "string" }),
    bornAlive: integer("born_alive"),
    bornDead: integer("born_dead"),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("breeding_records_farm_idx").on(table.farmId)],
);

// Zucht – Brunstkalender (lib/breedingCycle.ts): a heat seen on a female; the
// next one is computed from the species' cycle.
export const heatRecordsTable = pgTable(
  "heat_records",
  {
    id: serial("id").primaryKey(),
    farmId: integer("farm_id")
      .notNull()
      .references(() => farmsTable.id, { onDelete: "cascade" }),
    animalId: integer("animal_id")
      .notNull()
      .references(() => farmAnimalsTable.id, { onDelete: "cascade" }),
    observedOn: date("observed_on", { mode: "string" }).notNull(),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("heat_records_animal_idx").on(table.animalId, table.observedOn)],
);

// Ertrag & Bilanz (lib/farmYields.ts): what the animals gave – eggs, milk,
// meat, wool – one row per entry. The garden's harvests are in harvest_logs.
export const FARM_PRODUCTS = ["eggs", "milk", "meat", "wool", "honey"] as const;
export type FarmProduct = (typeof FARM_PRODUCTS)[number];

export const farmYieldsTable = pgTable(
  "farm_yields",
  {
    id: serial("id").primaryKey(),
    farmId: integer("farm_id")
      .notNull()
      .references(() => farmsTable.id, { onDelete: "cascade" }),
    product: text("product").notNull(),
    herdId: integer("herd_id").references(() => herdsTable.id, { onDelete: "set null" }),
    animalId: integer("animal_id").references(() => farmAnimalsTable.id, { onDelete: "set null" }),
    date: date("date", { mode: "string" }).notNull(),
    amount: doublePrecision("amount").notNull(),
    note: text("note"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    // Set by "Am Stall" (docs/stall.md): an entry sent twice from the offline
    // queue is stored once.
    clientId: text("client_id"),
    // Honey: the colony it came from (docs/bienen.md).
    colonyId: integer("colony_id").references((): AnyPgColumn => beeColoniesTable.id, { onDelete: "set null" }),
    // Bio (docs/bio.md, B7): entered while the farm was organic – fixed then.
    organic: boolean("organic").notNull().default(false),
  },
  (table) => [
    index("farm_yields_farm_date_idx").on(table.farmId, table.date),
    uniqueIndex("farm_yields_farm_client_unique").on(table.farmId, table.clientId).where(sql`${table.clientId} IS NOT NULL`),
  ],
);

// The farm's own prices for the value of its yields (€ per unit), overriding
// the defaults in lib/farmYields.ts. Key: "product:eggs", "crop:tomate".
export const farmPricesTable = pgTable(
  "farm_prices",
  {
    farmId: integer("farm_id")
      .notNull()
      .references(() => farmsTable.id, { onDelete: "cascade" }),
    key: text("key").notNull(),
    eur: doublePrecision("eur").notNull(),
  },
  (table) => [primaryKey({ columns: [table.farmId, table.key] })],
);

// Ertrag & Bilanz: what the farm spent (feed, vet, bedding, seed, soil and
// fertiliser, water, animals, equipment, other), so the year's value can be
// set against its costs.
export const EXPENSE_CATEGORIES = ["feed", "vet", "bedding", "seeds", "soil", "water", "animals", "equipment", "other"] as const;
export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number];
/** Garden-Wirtschaftlichkeit: these count for the garden unless said otherwise. */
export const GARDEN_EXPENSE_CATEGORIES: readonly ExpenseCategory[] = ["seeds", "soil", "water"];

export const farmExpensesTable = pgTable(
  "farm_expenses",
  {
    id: serial("id").primaryKey(),
    farmId: integer("farm_id")
      .notNull()
      .references(() => farmsTable.id, { onDelete: "cascade" }),
    date: date("date", { mode: "string" }).notNull(),
    category: text("category").notNull(),
    amountEur: doublePrecision("amount_eur").notNull(),
    // Garten-Wirtschaftlichkeit: a garden cost, optionally for one bed.
    garden: boolean("garden").notNull().default(false),
    bedId: integer("bed_id").references(() => gardenBedsTable.id, { onDelete: "set null" }),
    note: text("note"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("farm_expenses_farm_date_idx").on(table.farmId, table.date)],
);

// Ertrag & Bilanz: what the farm sold and got for it. `product` is
// "product:eggs" or "crop:tomate" when it is one of the farm's yields (its
// shop value then leaves the self-supply), null for anything else.
export const farmSalesTable = pgTable(
  "farm_sales",
  {
    id: serial("id").primaryKey(),
    farmId: integer("farm_id")
      .notNull()
      .references(() => farmsTable.id, { onDelete: "cascade" }),
    date: date("date", { mode: "string" }).notNull(),
    product: text("product"),
    label: text("label").notNull(),
    amount: doublePrecision("amount"),
    revenueEur: doublePrecision("revenue_eur").notNull(),
    note: text("note"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("farm_sales_farm_date_idx").on(table.farmId, table.date)],
);

// Farm & Team: the farm's important contacts – vet, team, Vertretung, the
// farmer, family, authorities, suppliers. Every member reads them (the
// Vertretung needs the vet's number), admins keep them.
export const FARM_CONTACT_KINDS = ["self", "team", "substitute", "vet", "family", "emergency", "authority", "supplier", "other"] as const;
export type FarmContactKind = (typeof FARM_CONTACT_KINDS)[number];

export const farmContactsTable = pgTable(
  "farm_contacts",
  {
    id: serial("id").primaryKey(),
    farmId: integer("farm_id")
      .notNull()
      .references(() => farmsTable.id, { onDelete: "cascade" }),
    // One of FARM_CONTACT_KINDS (checked by the server).
    kind: text("kind").notNull(),
    name: text("name").notNull(),
    // What they do here, e.g. "Hoftierarzt Großtiere", "Melkerin, Mo–Fr".
    role: text("role"),
    phone: text("phone"),
    email: text("email"),
    note: text("note"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("farm_contacts_farm_idx").on(table.farmId)],
);
