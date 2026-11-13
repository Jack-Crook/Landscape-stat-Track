export const JOB_STATUSES = ["quoted", "in_progress", "completed", "invoiced", "paid"] as const;
export type JobStatus = (typeof JOB_STATUSES)[number];

export const JOB_STATUS_LABELS: Record<string, string> = {
  quoted: "Quoted",
  in_progress: "In progress",
  completed: "Completed",
  invoiced: "Invoiced",
  paid: "Paid",
};

/** Tone names map to pill styles in components/kit/pill.tsx. */
export type Tone = "gray" | "blue" | "green" | "orange" | "red" | "purple" | "teal" | "yellow";

export const JOB_STATUS_TONES: Record<string, Tone> = {
  quoted: "yellow",
  in_progress: "blue",
  completed: "teal",
  invoiced: "purple",
  paid: "green",
};

export const QUOTE_STATUSES = ["draft", "sent", "accepted", "declined", "no_response"] as const;

export const QUOTE_STATUS_LABELS: Record<string, string> = {
  draft: "Draft",
  sent: "Sent",
  accepted: "Accepted",
  declined: "Declined",
  no_response: "No response",
};

export const QUOTE_STATUS_TONES: Record<string, Tone> = {
  draft: "gray",
  sent: "blue",
  accepted: "green",
  declined: "red",
  no_response: "yellow",
};

export const INVOICE_STATUS_LABELS: Record<string, string> = {
  draft: "Draft",
  sent: "Awaiting payment",
  paid: "Paid",
  void: "Void",
};

export const INVOICE_STATUS_TONES: Record<string, Tone> = {
  draft: "gray",
  sent: "blue",
  paid: "green",
  void: "red",
};

export const COST_TYPES = ["materials", "labour", "travel", "other"] as const;

export const COST_TYPE_LABELS: Record<string, string> = {
  materials: "Materials",
  labour: "Labour",
  travel: "Travel",
  other: "Other",
};

/**
 * Expense categories used for receipt items. The receipt scanner is told to pick
 * one of these keys per line, so they double as the analytics dimensions.
 * `deductible: false` marks spending that is usually not a business deduction.
 */
export const EXPENSE_CATEGORIES = [
  { key: "materials", label: "Materials", hint: "Soil, mulch, sand, gravel, pavers, timber, sleepers, concrete" },
  { key: "plants", label: "Plants & turf", hint: "Plants, trees, seedlings, seed, turf rolls" },
  { key: "tools", label: "Tools", hint: "Shovels, rakes, wheelbarrows, power tools, hand tools" },
  { key: "machinery", label: "Machinery parts & repairs", hint: "Mower blades, trimmer line, oil, filters, servicing" },
  { key: "equipment_hire", label: "Equipment hire", hint: "Excavator, bobcat, trailer, skip bin hire" },
  { key: "fuel", label: "Fuel", hint: "Petrol, diesel, 2-stroke" },
  { key: "vehicle", label: "Vehicle", hint: "Rego, servicing, tyres, tolls, parking" },
  { key: "chemicals", label: "Fertiliser & chemicals", hint: "Fertiliser, herbicide, pesticide, wetting agent" },
  { key: "irrigation", label: "Irrigation & plumbing", hint: "Pipe, fittings, drippers, timers, valves" },
  { key: "safety", label: "Safety & PPE", hint: "Gloves, boots, glasses, ear muffs, hi-vis" },
  { key: "consumables", label: "Consumables", hint: "Bags, ties, stakes, tape, screws, batteries" },
  { key: "waste", label: "Waste & tip fees", hint: "Green waste, tip fees, skip collection" },
  { key: "subcontractor", label: "Subcontractors", hint: "Contract labour, other trades" },
  { key: "office", label: "Office & phone", hint: "Phone, software, printing, stationery, advertising" },
  { key: "insurance", label: "Insurance & licences", hint: "Public liability, licences, memberships" },
  { key: "food", label: "Food & drink", hint: "Meals, coffee (usually not deductible)", deductible: false },
  { key: "other", label: "Other", hint: "Anything else" },
] as const satisfies ReadonlyArray<{ key: string; label: string; hint: string; deductible?: boolean }>;

export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number]["key"];

export const EXPENSE_CATEGORY_KEYS = EXPENSE_CATEGORIES.map((c) => c.key) as [ExpenseCategory, ...ExpenseCategory[]];

export const EXPENSE_CATEGORY_LABELS: Record<string, string> = Object.fromEntries(
  EXPENSE_CATEGORIES.map((c) => [c.key, c.label])
);

export function isDeductibleCategory(key: string | null | undefined): boolean {
  const c = EXPENSE_CATEGORIES.find((x) => x.key === key);
  return !c || !("deductible" in c) || c.deductible !== false;
}

/** Starter job categories for a landscaping business; orgs can add their own. */
export const DEFAULT_JOB_CATEGORIES = [
  "Lawn mowing",
  "Garden maintenance",
  "Landscape construction",
  "Paving",
  "Retaining walls",
  "Turf laying",
  "Irrigation",
  "Hedging & pruning",
  "Planting",
  "Green waste removal",
  "Design",
  "Other",
];

export const RECURRENCE_LABELS: Record<string, string> = {
  weekly: "Weekly",
  fortnightly: "Fortnightly",
  monthly: "Monthly",
};

export const PAYMENT_METHODS = ["card", "cash", "eftpos", "bank_transfer", "account", "other"] as const;
export const PAYMENT_METHOD_LABELS: Record<string, string> = {
  card: "Card",
  cash: "Cash",
  eftpos: "EFTPOS",
  bank_transfer: "Bank transfer",
  account: "Trade account",
  other: "Other",
};

export const DEFAULT_TAX_RATE = 0.1; // 10% AU GST
export const DEFAULT_MILEAGE_RATE = 0.88; // ATO cents-per-km rate (2024–25 and 2025–26)
export const AU_FINANCIAL_YEAR_START_MONTH = 7; // July
