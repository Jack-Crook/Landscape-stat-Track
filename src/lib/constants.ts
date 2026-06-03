export const JOB_STATUS_LABELS: Record<string, string> = {
  quoted: "Quoted",
  in_progress: "In Progress",
  completed: "Completed",
  invoiced: "Invoiced",
  paid: "Paid",
};

export const JOB_STATUS_COLORS: Record<string, string> = {
  quoted: "bg-yellow-100 text-yellow-800",
  in_progress: "bg-blue-100 text-blue-800",
  completed: "bg-green-100 text-green-800",
  invoiced: "bg-purple-100 text-purple-800",
  paid: "bg-emerald-100 text-emerald-800",
};

export const QUOTE_STATUS_LABELS: Record<string, string> = {
  draft: "Draft",
  sent: "Sent",
  accepted: "Accepted",
  declined: "Declined",
  no_response: "No Response",
};

export const QUOTE_STATUS_COLORS: Record<string, string> = {
  draft: "bg-gray-100 text-gray-700",
  sent: "bg-blue-100 text-blue-800",
  accepted: "bg-green-100 text-green-800",
  declined: "bg-red-100 text-red-800",
  no_response: "bg-yellow-100 text-yellow-800",
};

export const COST_TYPE_LABELS: Record<string, string> = {
  materials: "Materials",
  labour: "Labour",
  travel: "Travel",
  other: "Other",
};

export const DEFAULT_TAX_RATE = 0.1; // 10% AU GST
export const DEFAULT_MILEAGE_RATE = 0.88; // ATO rate per km (2024–25)

export const AU_FINANCIAL_YEAR_START_MONTH = 7; // July
