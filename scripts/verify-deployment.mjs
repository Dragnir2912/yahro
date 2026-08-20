const frontendUrl = process.env.DEPLOYMENT_FRONTEND_URL?.replace(/\/$/, "");
const apiUrl = process.env.DEPLOYMENT_API_URL?.replace(/\/$/, "");

if (!frontendUrl || !apiUrl) {
  throw new Error("DEPLOYMENT_FRONTEND_URL and DEPLOYMENT_API_URL are required");
}

const checks = [];
const check = (condition, label) => {
  if (!condition) throw new Error(`Deployment check failed: ${label}`);
  checks.push(label);
};

async function fetchChecked(url, init) {
  return fetch(url, { ...init, redirect: "manual", signal: AbortSignal.timeout(10_000) });
}

const live = await fetchChecked(`${apiUrl}/health/live`);
check(live.status === 200 && (await live.json()).status === "ok", "API liveness");

const ready = await fetchChecked(`${apiUrl}/health/ready`);
check(ready.status === 200 && (await ready.json()).status === "ready", "API readiness and database connectivity");
check(Boolean(ready.headers.get("strict-transport-security")), "API HSTS header");
check(ready.headers.get("x-content-type-options") === "nosniff", "API nosniff header");

const unauthorized = await fetchChecked(`${apiUrl}/api/auth/me`, { headers: { Origin: frontendUrl } });
check(unauthorized.status === 401, "protected route rejects anonymous access");
check(unauthorized.headers.get("access-control-allow-origin") === frontendUrl, "explicit CORS origin");

const missing = await fetchChecked(`${apiUrl}/api/deployment-check-missing`);
check(missing.status === 404, "API unknown route handling");

const frontend = await fetchChecked(frontendUrl);
const html = await frontend.text();
check(frontend.status === 200 && html.includes("Yahro"), "frontend availability");
check(Boolean(frontend.headers.get("content-security-policy")), "frontend CSP header");
check(frontend.headers.get("x-content-type-options") === "nosniff", "frontend nosniff header");

process.stdout.write(`${checks.length} deployment checks passed.\n`);
