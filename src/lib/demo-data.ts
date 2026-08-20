import type { PaymentMethod } from "@/lib/api";

export const demoCashFlow = [
  { month: "Mar", income: 3200, expenses: 2180 },
  { month: "Avr", income: 3600, expenses: 2420 },
  { month: "Mai", income: 3400, expenses: 2800 },
  { month: "Juin", income: 4200, expenses: 2640 },
  { month: "Juil", income: 3900, expenses: 3020 },
  { month: "Août", income: 4520, expenses: 2840 },
];

export const demoBudgetCategories = [
  { label: "Logement", labelEn: "Housing", amount: 920, total: 1200 },
  { label: "Alimentation", labelEn: "Food", amount: 486, total: 700 },
  { label: "Transport", labelEn: "Transport", amount: 288, total: 500 },
  { label: "Loisirs", labelEn: "Leisure", amount: 164, total: 400 },
];

export type DemoTransaction = {
  id: number;
  merchant: string;
  category: string;
  categoryEn: string;
  amount: number;
  kind: "expense" | "income";
  paymentMethod: PaymentMethod;
  date: "today" | "yesterday";
  icon: string;
  iconStyle: string;
};

export const demoTransactions: DemoTransaction[] = [
  { id: 1, merchant: "Carrefour Market", category: "Courses", categoryEn: "Groceries", amount: 84.3, kind: "expense", paymentMethod: "BANK_CARD", date: "today", icon: "shopping-bag", iconStyle: "bg-[#f1eadc] text-[#9b6c29] dark:bg-[#3c3020] dark:text-[#e7bb78]" },
  { id: 2, merchant: "Salaire - ENSEA", category: "Revenu", categoryEn: "Income", amount: 2450, kind: "income", paymentMethod: "BANK_TRANSFER", date: "today", icon: "banknote", iconStyle: "bg-[#e4efdb] text-[#547238] dark:bg-[#26351e] dark:text-[#a9cd83]" },
  { id: 3, merchant: "Orange Énergie", category: "Factures", categoryEn: "Bills", amount: 62.4, kind: "expense", paymentMethod: "MOBILE_MONEY", date: "yesterday", icon: "zap", iconStyle: "bg-[#f1eadc] text-[#a1722b] dark:bg-[#3c3020] dark:text-[#e7bb78]" },
  { id: 4, merchant: "La Terrasse", category: "Restaurant", categoryEn: "Dining", amount: 37.8, kind: "expense", paymentMethod: "CASH", date: "yesterday", icon: "utensils", iconStyle: "bg-[#ece6ef] text-[#86678a] dark:bg-[#352839] dark:text-[#c6a1cd]" },
];
