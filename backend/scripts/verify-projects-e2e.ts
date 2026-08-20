import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import "dotenv/config";
import postgres from "postgres";
import { createApp } from "../src/app.js";
import { loadConfig } from "../src/config.js";

const config = loadConfig();
const seedSql = postgres(config.databaseUrl, { max: 1, onnotice: () => undefined });
const rateDate = new Date();
await seedSql`
  insert into public.official_exchange_rates
    (base_currency, quote_currency, rate, rate_date, source, fetched_at)
  values ('EUR', 'XOF', 655.957, ${rateDate}, 'BCEAO_FIXED_PARITY', ${rateDate})
  on conflict (base_currency, quote_currency, rate_date, source)
  do update set rate = excluded.rate, fetched_at = excluded.fetched_at
`;
await seedSql.end();
const app = await createApp(config);
const password = "A-strong-project-password-2026";
const mailDirectory = path.resolve(process.cwd(), config.devEmailCaptureDirectory);

function expectStatus(actual: number, expected: number, label: string) {
  if (actual !== expected) throw new Error(`${label}: expected HTTP ${expected}, received ${actual}`);
}

async function registerAndLogin(label: string) {
  const email = `${label}-${crypto.randomUUID()}@example.test`;
  const registration = await app.inject({
    method: "POST",
    url: "/api/auth/register",
    payload: {
      email,
      password,
      passwordConfirmation: password,
      firstName: label,
      lastName: "E2E",
      nickname: label,
      countryCode: "CI",
      locale: "fr",
      timezone: "Africa/Abidjan",
      currency: "XOF",
      acceptTerms: true,
      acceptPrivacy: true,
    },
  });
  expectStatus(registration.statusCode, 202, `${label} registration`);
  const mailFiles = (await readdir(mailDirectory)).sort();
  const mail = JSON.parse(await readFile(path.join(mailDirectory, mailFiles.at(-1)!), "utf8")) as { text: string };
  const token = mail.text.match(/[?&]token=([^\s]+)/)?.[1];
  if (!token) throw new Error(`${label}: verification token missing`);
  const verification = await app.inject({ method: "POST", url: "/api/auth/verify-email", payload: { token: decodeURIComponent(token) } });
  expectStatus(verification.statusCode, 204, `${label} verification`);
  const login = await app.inject({ method: "POST", url: "/api/auth/login", payload: { email, password } });
  expectStatus(login.statusCode, 200, `${label} login`);
  const accessToken = login.json<{ accessToken: string }>().accessToken;
  return { email, authorization: { authorization: `Bearer ${accessToken}` } };
}

try {
  const owner = await registerAndLogin("project-owner");
  const spentAt = new Date();
  const startDate = new Date(spentAt.getTime() - 30 * 24 * 60 * 60 * 1000);
  const endDate = new Date(spentAt.getTime() + 30 * 24 * 60 * 60 * 1000);
  const projectResponse = await app.inject({
    method: "POST",
    url: "/api/projects",
    headers: owner.authorization,
    payload: {
      kind: "PROJECT",
      name: "Projet E2E",
      description: "Validation du suivi flexible",
      status: "ACTIVE",
      totalBudget: "1000",
      currency: "XOF",
      budgetFrequency: "WEEKLY",
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString(),
      warningThreshold: 80,
      color: "#769450",
    },
  });
  expectStatus(projectResponse.statusCode, 201, "project creation");
  const project = projectResponse.json<{ id: string }>();

  const plannedLines = [] as Array<{ id: string; name: string }>;
  for (const line of [
    { name: "Transport", plannedAmount: "400", sortOrder: 0 },
    { name: "Hébergement", plannedAmount: "600", sortOrder: 1 },
  ]) {
    const response = await app.inject({
      method: "POST",
      url: `/api/projects/${project.id}/budget-lines`,
      headers: owner.authorization,
      payload: line,
    });
    expectStatus(response.statusCode, 201, `planned line ${line.name}`);
    plannedLines.push(response.json<{ id: string; name: string }>());
  }

  for (const expense of [
    { description: "Achat en espèces", amount: "100", paymentMethod: "CASH", budgetLineId: plannedLines[0]!.id },
    { description: "Paiement mobile", amount: "200", paymentMethod: "MOBILE_MONEY", budgetLineId: plannedLines[1]!.id },
  ]) {
    const response = await app.inject({
      method: "POST",
      url: `/api/projects/${project.id}/expenses`,
      headers: owner.authorization,
      payload: { ...expense, spentAt: spentAt.toISOString() },
    });
    expectStatus(response.statusCode, 201, expense.description);
  }

  const projects = await app.inject({ method: "GET", url: "/api/projects", headers: owner.authorization });
  expectStatus(projects.statusCode, 200, "project list");
  const tracked = projects.json<{ data: Array<{ id: string; budgetFrequency: string; spentAmount: string; cashSpentAmount: string; electronicSpentAmount: string }> }>().data.find((item) => item.id === project.id);
  if (!tracked || tracked.budgetFrequency !== "WEEKLY" || Number(tracked.spentAmount) !== 300 || Number(tracked.cashSpentAmount) !== 100 || Number(tracked.electronicSpentAmount) !== 200) {
    throw new Error(`project budget or payment method totals are incorrect: ${JSON.stringify(tracked)}`);
  }

  const expenses = await app.inject({ method: "GET", url: `/api/projects/${project.id}/expenses`, headers: owner.authorization });
  expectStatus(expenses.statusCode, 200, "expense list");
  const methods = expenses.json<{ data: Array<{ paymentMethod: string }> }>().data.map((item) => item.paymentMethod).sort();
  if (methods.join(",") !== "CASH,MOBILE_MONEY") throw new Error("payment methods were not persisted");

  const budgetLines = await app.inject({ method: "GET", url: `/api/projects/${project.id}/budget-lines`, headers: owner.authorization });
  expectStatus(budgetLines.statusCode, 200, "budget line list");
  const trackedLines = budgetLines.json<{ data: Array<{ name: string; plannedAmount: string; actualAmount: string; lifetimeActualAmount: string }> }>().data;
  if (trackedLines.length !== 2 || Number(trackedLines[0]?.plannedAmount) !== 400 || Number(trackedLines[0]?.actualAmount) !== 100 || Number(trackedLines[1]?.actualAmount) !== 200) {
    throw new Error(`planned and actual budget lines are incorrect: ${JSON.stringify(trackedLines)}`);
  }

  const officialConversion = await app.inject({ method: "GET", url: "/api/currencies/convert?base=EUR&quote=XOF&amount=1", headers: owner.authorization });
  expectStatus(officialConversion.statusCode, 200, "official fixed-parity conversion");
  const officialConverted = officialConversion.json<{ convertedAmount: string; custom: boolean }>();
  if (Number(officialConverted.convertedAmount) !== 655.957 || officialConverted.custom) throw new Error("official fixed parity was not used");

  const customRate = await app.inject({
    method: "POST",
    url: "/api/currencies/custom-rates",
    headers: owner.authorization,
    payload: { baseCurrency: "USD", quoteCurrency: "XOF", rate: "600", label: "Organisme E2E" },
  });
  expectStatus(customRate.statusCode, 201, "custom exchange rate");
  const conversion = await app.inject({ method: "GET", url: "/api/currencies/convert?base=USD&quote=XOF&amount=2", headers: owner.authorization });
  expectStatus(conversion.statusCode, 200, "custom conversion");
  const converted = conversion.json<{ convertedAmount: string; custom: boolean }>();
  if (Number(converted.convertedAmount) !== 1200 || !converted.custom) throw new Error("custom exchange rate was not prioritized");

  const currencyUpdate = await app.inject({ method: "PATCH", url: "/api/auth/me", headers: owner.authorization, payload: { defaultCurrency: "USD" } });
  expectStatus(currencyUpdate.statusCode, 200, "default currency update");
  const profile = await app.inject({ method: "GET", url: "/api/auth/me", headers: owner.authorization });
  if (profile.json<{ user: { defaultCurrency: string } }>().user.defaultCurrency !== "USD") throw new Error("default currency was not updated");

  const outsider = await registerAndLogin("project-outsider");
  const forbiddenExpenses = await app.inject({ method: "GET", url: `/api/projects/${project.id}/expenses`, headers: outsider.authorization });
  expectStatus(forbiddenExpenses.statusCode, 404, "private project isolation");
  const forbiddenBudgetLines = await app.inject({ method: "GET", url: `/api/projects/${project.id}/budget-lines`, headers: outsider.authorization });
  expectStatus(forbiddenBudgetLines.statusCode, 404, "private budget line isolation");
  const outsiderProjects = await app.inject({ method: "GET", url: "/api/projects", headers: outsider.authorization });
  if (outsiderProjects.json<{ data: unknown[] }>().data.length !== 0) throw new Error("another user could see private projects");

  process.stdout.write("project_budget_frequency=ok\n");
  process.stdout.write("project_period_tracking=ok\n");
  process.stdout.write("project_payment_methods=ok\n");
  process.stdout.write("project_planned_actual_lines=ok\n");
  process.stdout.write("project_owner_isolation=ok\n");
  process.stdout.write("custom_exchange_rate_priority=ok\n");
  process.stdout.write("official_exchange_rate_provider=ok\n");
  process.stdout.write("default_currency_override=ok\n");
} finally {
  await app.close();
}
