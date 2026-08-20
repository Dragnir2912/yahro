export type DashboardFeature =
  | "overview"
  | "transactions"
  | "budgets"
  | "categories"
  | "projects"
  | "accounts"
  | "analytics"
  | "settings";

export type FeatureAvailability = "available" | "demo-preview" | "account-required" | "coming-soon";

const demoAvailability: Record<DashboardFeature, FeatureAvailability> = {
  overview: "available",
  transactions: "demo-preview",
  budgets: "available",
  categories: "available",
  projects: "available",
  accounts: "demo-preview",
  analytics: "demo-preview",
  settings: "account-required",
};

export function featureAvailability(feature: DashboardFeature, authenticated: boolean): FeatureAvailability {
  return authenticated ? "available" : demoAvailability[feature];
}

export const quickActionAvailability = {
  transfer: "coming-soon",
  import: "coming-soon",
  export: "coming-soon",
  addAccount: "account-required",
} as const satisfies Record<string, FeatureAvailability>;
