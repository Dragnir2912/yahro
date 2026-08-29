const configuredApiUrl = (import.meta.env.VITE_API_URL as string | undefined)?.trim().replace(/\/$/, "");
// Development requests go through Vite's same-origin proxy. This keeps the
// Strict refresh cookie valid whether the browser uses localhost or 127.0.0.1.
const API_URL = import.meta.env.DEV ? "" : configuredApiUrl || "";

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
  }
}

type UnauthorizedHandler = () => void;
const unauthorizedHandlers = new Set<UnauthorizedHandler>();
let refreshInFlight: Promise<{ accessToken: string; expiresIn: number }> | null = null;

export function onUnauthorized(handler: UnauthorizedHandler) {
  unauthorizedHandlers.add(handler);
  return () => unauthorizedHandlers.delete(handler);
}

interface RequestOptions {
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  body?: unknown;
  accessToken?: string;
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const multipart = typeof FormData !== "undefined" && options.body instanceof FormData;
  const response = await fetch(`${API_URL}${path}`, {
    method: options.method ?? "GET",
    credentials: "include",
    headers: {
      Accept: "application/json",
      ...(options.body === undefined || multipart ? {} : { "Content-Type": "application/json" }),
      ...(options.accessToken ? { Authorization: `Bearer ${options.accessToken}` } : {}),
    },
    ...(options.body === undefined ? {} : { body: multipart ? options.body as FormData : JSON.stringify(options.body) }),
  });

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { code?: string; message?: string } | null;
    if (response.status === 401 && options.accessToken) {
      unauthorizedHandlers.forEach((handler) => handler());
    }
    throw new ApiError(response.status, payload?.code ?? "REQUEST_ERROR", payload?.message ?? "Request failed");
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

export interface AuthResult {
  accessToken: string;
  expiresIn: number;
  user: { id: string; email: string; firstName?: string; lastName?: string; nickname: string; avatarKey?: string | null; profilePhotoData?: string | null; countryCode?: string | null; locale?: string; timezone?: string; defaultCurrency?: string };
  tenant: { id: string; role: "OWNER" | "ADMIN" | "MEMBER" | "VIEWER" };
}

export interface MfaRequiredResult {
  mfaRequired: true;
  mfaToken: string;
  expiresIn: number;
}

export type ProjectKind = "PROJECT" | "ACTIVITY";
export type ProjectStatus = "PLANNED" | "ACTIVE" | "PAUSED" | "COMPLETED" | "CANCELLED";
export type BudgetFrequency = "ONE_TIME" | "WEEKLY" | "BIWEEKLY" | "MONTHLY" | "QUARTERLY" | "SEMIANNUAL" | "ANNUAL";
export type PaymentMethod = "CASH" | "BANK_TRANSFER" | "BANK_CARD" | "MOBILE_MONEY" | "DIGITAL_WALLET" | "DIRECT_DEBIT" | "CHECK" | "OTHER";
export type CategoryType = "INCOME" | "EXPENSE";
export type AccountType = "CHECKING" | "SAVINGS" | "CASH" | "MOBILE_MONEY" | "CREDIT_CARD" | "INVESTMENT" | "DEBT" | "OTHER";
export type TransactionType = "INCOME" | "EXPENSE" | "TRANSFER";

export interface FinanceAccount {
  id: string;
  name: string;
  type: AccountType;
  currency: string;
  openingBalance: string;
  openingBalanceDate: string;
  color: string | null;
  icon: string | null;
  includeInNetWorth: boolean;
  version: number;
}

export interface FinanceTransaction {
  id: string;
  accountId: string;
  categoryId: string | null;
  personalDetailId: string | null;
  transferGroupId: string | null;
  createdById: string;
  type: TransactionType;
  paymentMethod: PaymentMethod;
  amount: string;
  currency: string;
  transactionDate: string;
  merchant: string | null;
  description: string;
  notes: string | null;
  tags: string[];
  isVerified: boolean;
  version: number;
}

export interface AccountTransfer {
  transferGroupId: string;
  source: FinanceTransaction;
  destination: FinanceTransaction;
}

export interface DashboardData {
  range: { from: string; to: string };
  totals: Array<{ currency: string; type: TransactionType; amount: string }>;
  previousTotals: Array<{ currency: string; type: TransactionType; amount: string }>;
  accountBalances: Array<{ id: string; name: string; type: AccountType; currency: string; includeInNetWorth: boolean; balance: string }>;
  spendingByCategory: Array<{ categoryId: string; name: string; color: string | null; currency: string; amount: string }>;
  budgetProgress: BudgetProgress[];
  cashflow: Array<{ day: string; currency: string; income: string; expense: string }>;
}

export interface FinanceCategory {
  id: string;
  parentId: string | null;
  ownerUserId: string | null;
  name: string;
  type: CategoryType;
  level: 1 | 2;
  systemKey: string | null;
  sortOrder: number;
  color: string | null;
  icon: string | null;
  isSystem: boolean;
  version: number;
}

export interface PersonalCategoryDetail {
  id: string;
  categoryId: string;
  name: string;
  version: number;
  createdAt: string;
}

export interface FinanceBudget {
  id: string;
  categoryId: string;
  periodStart: string;
  periodEnd: string;
  amount: string;
  currency: string;
  frequency: BudgetFrequency;
  warningThreshold: number;
  rolloverEnabled: boolean;
  notes: string | null;
  version: number;
}

export interface BudgetProgress {
  id: string;
  categoryId: string;
  categoryName: string;
  color: string | null;
  amount: string;
  currency: string;
  warningThreshold: number;
  spent: string;
}

export interface BudgetProject {
  id: string;
  kind: ProjectKind;
  name: string;
  description: string | null;
  status: ProjectStatus;
  totalBudget: string;
  spentAmount: string;
  expenseCount: number;
  currency: string;
  budgetFrequency: BudgetFrequency;
  lifetimeSpentAmount: string;
  cashSpentAmount: string;
  electronicSpentAmount: string;
  startDate: string;
  endDate: string | null;
  warningThreshold: number;
  color: string;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface ProjectExpense {
  id: string;
  budgetLineId: string | null;
  description: string;
  amount: string;
  paymentMethod: PaymentMethod;
  spentAt: string;
  notes: string | null;
  version: number;
  createdAt: string;
}

export interface ProjectBudgetLine {
  id: string;
  projectId: string;
  name: string;
  plannedAmount: string;
  actualAmount: string;
  lifetimeActualAmount: string;
  expenseCount: number;
  notes: string | null;
  sortOrder: number;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface ProjectInput {
  kind: ProjectKind;
  name: string;
  description?: string;
  status?: ProjectStatus;
  totalBudget: string;
  currency: string;
  budgetFrequency: BudgetFrequency;
  startDate: string;
  endDate?: string | null;
  warningThreshold?: number;
  color?: string;
}

export interface CustomExchangeRate {
  id: string;
  baseCurrency: string;
  quoteCurrency: string;
  rate: string;
  label: string | null;
  validFrom: string;
  validUntil: string | null;
  active: boolean;
  version: number;
}

export const api = {
  register(input: { email: string; password: string; passwordConfirmation: string; firstName: string; lastName: string; nickname: string; countryCode: string; locale: "fr" | "en"; timezone: string; currency: string; acceptTerms: true; acceptPrivacy: true }) {
    return request<{ message: string }>("/api/auth/register", { method: "POST", body: input });
  },
  login(email: string, password: string) {
    return request<AuthResult | MfaRequiredResult>("/api/auth/login", { method: "POST", body: { email, password } });
  },
  verifyMfa(mfaToken: string, code: string) {
    return request<{ accessToken: string; expiresIn: number }>("/api/auth/mfa/verify", { method: "POST", body: { mfaToken, code } });
  },
  refresh() {
    refreshInFlight ??= request<{ accessToken: string; expiresIn: number }>("/api/auth/refresh", { method: "POST" })
      .catch(async (error: unknown) => {
        if (!(error instanceof ApiError) || error.code !== "REFRESH_RETRY") throw error;
        await new Promise((resolve) => setTimeout(resolve, 250));
        return request<{ accessToken: string; expiresIn: number }>("/api/auth/refresh", { method: "POST" });
      })
      .finally(() => { refreshInFlight = null; });
    return refreshInFlight;
  },
  me(accessToken: string) {
    return request<{ user: AuthResult["user"] & { firstName: string; lastName: string; nickname: string; avatarKey: string | null; profilePhotoData: string | null; countryCode: string | null; locale: string; timezone: string; defaultCurrency: string }; tenant: AuthResult["tenant"] }>(
      "/api/auth/me",
      { accessToken },
    );
  },
  updateProfile(accessToken: string, input: { firstName?: string; lastName?: string; nickname?: string; avatarKey?: "sage" | "ocean" | "sunset" | "violet" | "sand" | "rose" | "forest" | "sky" | null; countryCode?: string; defaultCurrency?: string; locale?: string; timezone?: string }) {
    return request<{ user: AuthResult["user"] }>("/api/auth/me", { method: "PATCH", accessToken, body: input });
  },
  uploadProfilePhoto(accessToken: string, photo: File) {
    const body = new FormData();
    body.append("photo", photo);
    return request<{ user: AuthResult["user"] }>("/api/auth/me/photo", { method: "POST", accessToken, body });
  },
  logout() {
    return request<void>("/api/auth/logout", { method: "POST" });
  },
  verifyEmail(token: string) {
    return request<void>("/api/auth/verify-email", { method: "POST", body: { token } });
  },
  resendVerification(email: string) {
    return request<{ message: string }>("/api/auth/resend-verification", { method: "POST", body: { email } });
  },
  requestPasswordReset(email: string) {
    return request<{ message: string }>("/api/auth/request-password-reset", { method: "POST", body: { email } });
  },
  resetPassword(token: string, password: string) {
    return request<void>("/api/auth/reset-password", { method: "POST", body: { token, password } });
  },
  mfaStatus(accessToken: string) {
    return request<{ enabled: boolean; enabledAt: string | null; recoveryCodesRemaining: number }>("/api/auth/mfa", { accessToken });
  },
  startMfaSetup(accessToken: string, currentPassword: string) {
    return request<{ secret: string; otpAuthUri: string; algorithm: string; digits: number; period: number }>("/api/auth/mfa/setup", {
      method: "POST",
      accessToken,
      body: { currentPassword },
    });
  },
  confirmMfa(accessToken: string, code: string) {
    return request<{ recoveryCodes: string[] }>("/api/auth/mfa/confirm", { method: "POST", accessToken, body: { code } });
  },
  disableMfa(accessToken: string, currentPassword: string, code: string) {
    return request<void>("/api/auth/mfa/disable", { method: "POST", accessToken, body: { currentPassword, code } });
  },
  accounts(accessToken: string) {
    return request<{ data: FinanceAccount[] }>("/api/accounts", { accessToken });
  },
  createAccount(accessToken: string, input: { name: string; type: AccountType; currency: string; openingBalance: string; openingBalanceDate: string; color?: string; icon?: string; includeInNetWorth?: boolean }) {
    return request<{ data: FinanceAccount }>("/api/accounts", { method: "POST", accessToken, body: input });
  },
  updateAccount(accessToken: string, id: string, input: Partial<{ name: string; color: string; icon: string; includeInNetWorth: boolean }> & { version: number }) {
    return request<{ data: FinanceAccount }>(`/api/accounts/${encodeURIComponent(id)}`, { method: "PATCH", accessToken, body: input });
  },
  archiveAccount(accessToken: string, id: string) {
    return request<void>(`/api/accounts/${encodeURIComponent(id)}`, { method: "DELETE", accessToken });
  },
  transactions(accessToken: string, filters: Partial<{ accountId: string; categoryId: string; type: TransactionType; from: string; to: string; limit: number }> = {}) {
    const query = new URLSearchParams();
    Object.entries(filters).forEach(([key, value]) => value !== undefined && query.set(key, String(value)));
    const suffix = query.size ? `?${query}` : "";
    return request<{ data: FinanceTransaction[]; nextCursor: { beforeDate: string; beforeId: string } | null }>(`/api/transactions${suffix}`, { accessToken });
  },
  createTransaction(accessToken: string, input: { accountId: string; categoryId?: string; personalDetailId?: string; type: "INCOME" | "EXPENSE"; paymentMethod: PaymentMethod; amount: string; transactionDate: string; merchant?: string; description: string; notes?: string; tags?: string[] }) {
    return request<{ data: FinanceTransaction }>("/api/transactions", { method: "POST", accessToken, body: input });
  },
  createTransfer(accessToken: string, input: { sourceAccountId: string; destinationAccountId: string; sourceAmount: string; destinationAmount?: string; transactionDate: string; description: string; notes?: string }) {
    return request<{ data: AccountTransfer }>("/api/transfers", { method: "POST", accessToken, body: input });
  },
  updateTransaction(accessToken: string, id: string, input: Partial<{ categoryId: string; personalDetailId: string | null; paymentMethod: PaymentMethod; amount: string; transactionDate: string; merchant: string; description: string; notes: string; tags: string[] }> & { version: number }) {
    return request<{ data: FinanceTransaction }>(`/api/transactions/${encodeURIComponent(id)}`, { method: "PATCH", accessToken, body: input });
  },
  deleteTransaction(accessToken: string, id: string) {
    return request<void>(`/api/transactions/${encodeURIComponent(id)}`, { method: "DELETE", accessToken });
  },
  restoreTransaction(accessToken: string, id: string) {
    return request<{ data: FinanceTransaction }>(`/api/transactions/${encodeURIComponent(id)}/restore`, { method: "POST", accessToken });
  },
  categories(accessToken: string) {
    return request<{ data: FinanceCategory[] }>("/api/categories", { accessToken });
  },
  createCategory(accessToken: string, input: { parentId: string; name: string; type: CategoryType; color?: string; icon?: string }) {
    return request<{ data: FinanceCategory }>("/api/categories", { method: "POST", accessToken, body: input });
  },
  updateCategory(accessToken: string, id: string, input: Partial<{ parentId: string; name: string; color: string; icon: string | null }> & { version: number }) {
    return request<{ data: FinanceCategory }>(`/api/categories/${encodeURIComponent(id)}`, { method: "PATCH", accessToken, body: input });
  },
  archiveCategory(accessToken: string, id: string) {
    return request<void>(`/api/categories/${encodeURIComponent(id)}`, { method: "DELETE", accessToken });
  },
  categoryDetails(accessToken: string, categoryId?: string) {
    const query = categoryId ? `?${new URLSearchParams({ categoryId })}` : "";
    return request<{ data: PersonalCategoryDetail[] }>(`/api/category-details${query}`, { accessToken });
  },
  createCategoryDetail(accessToken: string, input: { categoryId: string; name: string }) {
    return request<{ data: PersonalCategoryDetail }>("/api/category-details", { method: "POST", accessToken, body: input });
  },
  updateCategoryDetail(accessToken: string, id: string, input: { name: string; version: number }) {
    return request<{ data: PersonalCategoryDetail }>(`/api/category-details/${encodeURIComponent(id)}`, { method: "PATCH", accessToken, body: input });
  },
  archiveCategoryDetail(accessToken: string, id: string) {
    return request<void>(`/api/category-details/${encodeURIComponent(id)}`, { method: "DELETE", accessToken });
  },
  budgets(accessToken: string, from: string, to: string) {
    const query = new URLSearchParams({ from, to });
    return request<{ data: FinanceBudget[] }>(`/api/budgets?${query}`, { accessToken });
  },
  createBudget(accessToken: string, input: { categoryId: string; periodStart: string; periodEnd: string; amount: string; currency: string; frequency: BudgetFrequency; warningThreshold?: number; rolloverEnabled?: boolean; notes?: string }) {
    return request<{ data: FinanceBudget }>("/api/budgets", { method: "POST", accessToken, body: input });
  },
  updateBudget(accessToken: string, id: string, input: Partial<{ amount: string; frequency: BudgetFrequency; warningThreshold: number; rolloverEnabled: boolean; notes: string }> & { version: number }) {
    return request<{ data: FinanceBudget }>(`/api/budgets/${encodeURIComponent(id)}`, { method: "PATCH", accessToken, body: input });
  },
  archiveBudget(accessToken: string, id: string) {
    return request<void>(`/api/budgets/${encodeURIComponent(id)}`, { method: "DELETE", accessToken });
  },
  dashboard(accessToken: string, from?: string, to?: string) {
    const query = new URLSearchParams();
    if (from) query.set("from", from);
    if (to) query.set("to", to);
    const suffix = query.size ? `?${query}` : "";
    return request<DashboardData>(`/api/dashboard${suffix}`, { accessToken });
  },
  projects(accessToken: string) {
    return request<{ data: BudgetProject[] }>("/api/projects", { accessToken });
  },
  createProject(accessToken: string, input: ProjectInput) {
    return request<BudgetProject>("/api/projects", { method: "POST", accessToken, body: input });
  },
  updateProject(accessToken: string, id: string, input: Partial<ProjectInput> & { version: number }) {
    return request<BudgetProject>(`/api/projects/${encodeURIComponent(id)}`, { method: "PATCH", accessToken, body: input });
  },
  archiveProject(accessToken: string, id: string) {
    return request<void>(`/api/projects/${encodeURIComponent(id)}`, { method: "DELETE", accessToken });
  },
  projectExpenses(accessToken: string, projectId: string) {
    return request<{ data: ProjectExpense[] }>(`/api/projects/${encodeURIComponent(projectId)}/expenses`, { accessToken });
  },
  projectBudgetLines(accessToken: string, projectId: string) {
    return request<{ data: ProjectBudgetLine[] }>(`/api/projects/${encodeURIComponent(projectId)}/budget-lines`, { accessToken });
  },
  createProjectBudgetLine(accessToken: string, projectId: string, input: { name: string; plannedAmount: string; notes?: string; sortOrder?: number }) {
    return request<ProjectBudgetLine>(`/api/projects/${encodeURIComponent(projectId)}/budget-lines`, { method: "POST", accessToken, body: input });
  },
  updateProjectBudgetLine(accessToken: string, projectId: string, lineId: string, input: Partial<{ name: string; plannedAmount: string; notes: string | null; sortOrder: number }> & { version: number }) {
    return request<ProjectBudgetLine>(`/api/projects/${encodeURIComponent(projectId)}/budget-lines/${encodeURIComponent(lineId)}`, { method: "PATCH", accessToken, body: input });
  },
  archiveProjectBudgetLine(accessToken: string, projectId: string, lineId: string) {
    return request<void>(`/api/projects/${encodeURIComponent(projectId)}/budget-lines/${encodeURIComponent(lineId)}`, { method: "DELETE", accessToken });
  },
  createProjectExpense(accessToken: string, projectId: string, input: { budgetLineId?: string | null; description: string; amount: string; paymentMethod: PaymentMethod; spentAt: string; notes?: string }) {
    return request<ProjectExpense>(`/api/projects/${encodeURIComponent(projectId)}/expenses`, { method: "POST", accessToken, body: input });
  },
  updateProjectExpense(accessToken: string, projectId: string, expenseId: string, input: Partial<{ budgetLineId: string | null; description: string; amount: string; paymentMethod: PaymentMethod; spentAt: string; notes: string | null }> & { version: number }) {
    return request<ProjectExpense>(`/api/projects/${encodeURIComponent(projectId)}/expenses/${encodeURIComponent(expenseId)}`, { method: "PATCH", accessToken, body: input });
  },
  deleteProjectExpense(accessToken: string, projectId: string, expenseId: string) {
    return request<void>(`/api/projects/${encodeURIComponent(projectId)}/expenses/${encodeURIComponent(expenseId)}`, { method: "DELETE", accessToken });
  },
  convertCurrency(accessToken: string, base: string, quote: string, amount: string) {
    const query = new URLSearchParams({ base, quote, amount });
    return request<{ base: string; quote: string; amount: string; rate: string; convertedAmount: string; source: string; rateDate: string; custom: boolean }>(`/api/currencies/convert?${query}`, { accessToken });
  },
  customExchangeRates(accessToken: string) {
    return request<{ data: CustomExchangeRate[] }>("/api/currencies/custom-rates", { accessToken });
  },
  createCustomExchangeRate(accessToken: string, input: { baseCurrency: string; quoteCurrency: string; rate: string; label?: string; validFrom?: string; validUntil?: string | null }) {
    return request<CustomExchangeRate>("/api/currencies/custom-rates", { method: "POST", accessToken, body: input });
  },
  archiveCustomExchangeRate(accessToken: string, id: string) {
    return request<void>(`/api/currencies/custom-rates/${encodeURIComponent(id)}`, { method: "DELETE", accessToken });
  },
};
