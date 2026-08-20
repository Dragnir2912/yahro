import type { PaymentMethod } from "@/lib/api";

export function paymentMethodLabel(method: PaymentMethod, language: "fr" | "en") {
  const values: Record<PaymentMethod, [string, string]> = {
    CASH: ["Espèces", "Cash"],
    BANK_TRANSFER: ["Virement bancaire", "Bank transfer"],
    BANK_CARD: ["Carte bancaire", "Bank card"],
    MOBILE_MONEY: ["Mobile Money", "Mobile Money"],
    DIGITAL_WALLET: ["Portefeuille numérique", "Digital wallet"],
    DIRECT_DEBIT: ["Prélèvement bancaire", "Direct debit"],
    CHECK: ["Chèque", "Check"],
    OTHER: ["Autre moyen", "Other method"],
  };
  return values[method][language === "fr" ? 0 : 1];
}
