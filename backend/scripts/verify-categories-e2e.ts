import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import "dotenv/config";
import { createApp } from "../src/app.js";
import { loadConfig } from "../src/config.js";

const config = loadConfig();
const app = await createApp(config);
const password = "A-strong-category-password-2026";
const mailDirectory = path.resolve(process.cwd(), config.devEmailCaptureDirectory);
const databaseName = decodeURIComponent(new URL(config.databaseUrl).pathname).replace(/^\//, "");
if (config.nodeEnv !== "test" && !/(test|e2e)/i.test(databaseName)) {
  throw new Error("Category E2E tests require NODE_ENV=test or a database name containing test or e2e.");
}

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
  expectStatus((await app.inject({ method: "POST", url: "/api/auth/verify-email", payload: { token: decodeURIComponent(token) } })).statusCode, 204, `${label} verification`);
  const login = await app.inject({ method: "POST", url: "/api/auth/login", payload: { email, password } });
  expectStatus(login.statusCode, 200, `${label} login`);
  const accessToken = login.json<{ accessToken: string }>().accessToken;
  return { authorization: { authorization: `Bearer ${accessToken}` } };
}

interface CategoryRow {
  id: string;
  parentId: string | null;
  ownerUserId: string | null;
  type: "INCOME" | "EXPENSE";
  level: number;
  systemKey: string | null;
  isSystem: boolean;
  version: number;
}

try {
  const owner = await registerAndLogin("category-owner");
  const categoryResponse = await app.inject({ method: "GET", url: "/api/categories", headers: owner.authorization });
  expectStatus(categoryResponse.statusCode, 200, "category list");
  const categories = categoryResponse.json<{ data: CategoryRow[] }>().data;
  const families = categories.filter((item) => item.level === 1);
  const posts = categories.filter((item) => item.level === 2);
  if (families.length !== 15 || posts.length < 30) throw new Error(`unexpected default hierarchy: ${families.length} families and ${posts.length} posts`);
  if (families.some((item) => item.parentId !== null || !item.isSystem) || posts.some((item) => !item.parentId)) throw new Error("invalid default hierarchy shape");

  const foodFamily = families.find((item) => item.systemKey === "expense.food");
  if (!foodFamily) throw new Error("food family missing");
  const customPostResponse = await app.inject({
    method: "POST",
    url: "/api/categories",
    headers: owner.authorization,
    payload: { parentId: foodFamily.id, name: "Repas du campus", type: "EXPENSE", color: "#DDA75B", icon: "utensils" },
  });
  expectStatus(customPostResponse.statusCode, 201, "custom post creation");
  const customPost = customPostResponse.json<{ data: CategoryRow }>().data;
  if (customPost.level !== 2 || customPost.isSystem || !customPost.ownerUserId) throw new Error("custom post ownership or level is incorrect");

  const detailResponse = await app.inject({
    method: "POST",
    url: "/api/category-details",
    headers: owner.authorization,
    payload: { categoryId: customPost.id, name: "Déjeuner après les cours" },
  });
  expectStatus(detailResponse.statusCode, 201, "personal detail creation");
  const detail = detailResponse.json<{ data: { id: string; categoryId: string } }>().data;

  const accountResponse = await app.inject({
    method: "POST",
    url: "/api/accounts",
    headers: owner.authorization,
    payload: { name: "Compte de suivi", type: "CHECKING", currency: "XOF", openingBalance: "0", openingBalanceDate: "2026-08-01T00:00:00.000Z", color: "#769450", includeInNetWorth: true },
  });
  expectStatus(accountResponse.statusCode, 201, "tracking account creation");
  const account = accountResponse.json<{ data: { id: string } }>().data;

  const transactionResponse = await app.inject({
    method: "POST",
    url: "/api/transactions",
    headers: owner.authorization,
    payload: {
      accountId: account.id,
      categoryId: customPost.id,
      personalDetailId: detail.id,
      type: "EXPENSE",
      paymentMethod: "MOBILE_MONEY",
      amount: "2500",
      transactionDate: "2026-08-19T12:00:00.000Z",
      description: "Opération déjà réalisée",
      tags: [],
    },
  });
  expectStatus(transactionResponse.statusCode, 201, "classified transaction creation");
  const createdTransaction = transactionResponse.json<{ data: { categoryId: string; personalDetailId: string } }>().data;
  if (createdTransaction.categoryId !== customPost.id || createdTransaction.personalDetailId !== detail.id) throw new Error("three-level classification was not persisted");

  const budgetResponse = await app.inject({
    method: "POST",
    url: "/api/budgets",
    headers: owner.authorization,
    payload: {
      categoryId: customPost.id,
      periodStart: "2026-08-01T00:00:00.000Z",
      periodEnd: "2026-09-01T00:00:00.000Z",
      amount: "50000",
      currency: "XOF",
      frequency: "MONTHLY",
      warningThreshold: 80,
      rolloverEnabled: false,
    },
  });
  expectStatus(budgetResponse.statusCode, 201, "post budget creation");

  const outsider = await registerAndLogin("category-outsider");
  const outsiderDetail = await app.inject({
    method: "POST",
    url: "/api/category-details",
    headers: outsider.authorization,
    payload: { categoryId: customPost.id, name: "Tentative interdite" },
  });
  expectStatus(outsiderDetail.statusCode, 409, "private post isolation");
  const outsiderCategories = await app.inject({ method: "GET", url: "/api/categories", headers: outsider.authorization });
  if (outsiderCategories.json<{ data: CategoryRow[] }>().data.some((item) => item.id === customPost.id)) throw new Error("another user can see a private post");

  process.stdout.write("category_default_hierarchy=ok\n");
  process.stdout.write("category_custom_post_ownership=ok\n");
  process.stdout.write("category_personal_detail_privacy=ok\n");
  process.stdout.write("category_transaction_tracking=ok\n");
  process.stdout.write("category_budget_tracking=ok\n");
} finally {
  await app.close();
}
