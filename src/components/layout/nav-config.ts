import {
  BarChart3,
  Briefcase,
  Camera,
  FileText,
  Home,
  Landmark,
  LayoutGrid,
  Lightbulb,
  Receipt,
  ScrollText,
  ShoppingCart,
  Users,
} from "lucide-react";

export type Item = { href: string; label: string; icon: React.ComponentType<{ className?: string; strokeWidth?: number }> };

export const GROUPS: { title?: string; items: Item[] }[] = [
  {
    items: [
      { href: "/", label: "Home", icon: Home },
      { href: "/jobs", label: "Jobs", icon: Briefcase },
      { href: "/quotes", label: "Quotes", icon: FileText },
      { href: "/invoices", label: "Invoices", icon: ScrollText },
      { href: "/clients", label: "Clients", icon: Users },
    ],
  },
  {
    title: "Money",
    items: [
      { href: "/receipts", label: "Receipts", icon: Receipt },
      { href: "/spending", label: "Spending", icon: ShoppingCart },
      { href: "/reports", label: "Profit & loss", icon: BarChart3 },
      { href: "/tax", label: "Tax & GST", icon: Landmark },
      { href: "/insights", label: "Insights", icon: Lightbulb },
    ],
  },
];

export const TABS: Item[] = [
  { href: "/", label: "Home", icon: Home },
  { href: "/jobs", label: "Jobs", icon: Briefcase },
  { href: "/receipts/scan", label: "Scan", icon: Camera },
  { href: "/spending", label: "Spending", icon: ShoppingCart },
  { href: "/more", label: "More", icon: LayoutGrid },
];

export const MORE_LINKS = GROUPS.flatMap((g) => g.items).filter((i) => !["/", "/jobs", "/spending"].includes(i.href));
