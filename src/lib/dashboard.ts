import type { DashboardData } from "@/lib/api";

type Language = "fr" | "en";

export type MonthlyCashFlow = {
  month: string;
  income: number;
  expenses: number;
};

export function aggregateMonthlyCashFlow(
  items: DashboardData["cashflow"],
  currency: string,
  language: Language,
  monthCount: number,
  referenceDate = new Date(),
): MonthlyCashFlow[] {
  const locale = language === "fr" ? "fr-FR" : "en-US";
  const formatter = new Intl.DateTimeFormat(locale, { month: "short", year: "2-digit", timeZone: "UTC" });
  const buckets = new Map<string, MonthlyCashFlow>();

  for (let offset = monthCount - 1; offset >= 0; offset -= 1) {
    const date = new Date(Date.UTC(referenceDate.getUTCFullYear(), referenceDate.getUTCMonth() - offset, 1));
    const key = `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
    buckets.set(key, { month: formatter.format(date), income: 0, expenses: 0 });
  }

  for (const item of items) {
    if (item.currency !== currency) continue;
    const date = new Date(item.day);
    if (Number.isNaN(date.getTime())) continue;
    const key = `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
    const bucket = buckets.get(key);
    if (!bucket) continue;
    bucket.income += Number(item.income);
    bucket.expenses += Number(item.expense);
  }

  return [...buckets.values()];
}
