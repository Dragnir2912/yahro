import { lazy, Suspense, useEffect, useState } from "react";
import AccountActionPage from "@/components/account-action-page";
import LegalPage from "@/components/legal-page";
import LandingPage, { type LandingLanguage } from "@/components/landing-page";
import Ghost404Page from "@/components/ui/ghost-404-page-1";
import { api, ApiError, onUnauthorized, type AuthResult } from "@/lib/api";
import { setPageMetadata } from "@/lib/page-metadata";
import type { ProfileUser } from "@/components/profile-settings";

const BudgetDashboard = lazy(() => import("@/components/ui/saa-s-template"));

type Session =
  | { kind: "demo"; language: LandingLanguage }
  | { kind: "authenticated"; language: LandingLanguage; accessToken: string; accessTokenExpiresAt: number; user: AuthResult["user"] };

function currentLanguage(): LandingLanguage {
  return window.localStorage.getItem("yahro-language") === "en" ? "en" : "fr";
}

export default function App() {
  const [path, setPath] = useState(() => window.location.pathname);
  const [accountRequest] = useState(() => {
    const token = new URLSearchParams(window.location.search).get("token") ?? "";
    const accountAction: "verify-email" | "reset-password" | null =
      path === "/verify-email" ? "verify-email" : path === "/reset-password" ? "reset-password" : null;
    if (accountAction && token) window.history.replaceState({}, "", path);
    return { accountAction, token };
  });
  const { accountAction, token } = accountRequest;
  const [session, setSession] = useState<Session | null>(null);
  const [restoring, setRestoring] = useState(() => path === "/" && !accountAction);

  useEffect(() => {
    const updatePath = () => {
      const nextPath = window.location.pathname;
      if (nextPath === path) return;
      if (nextPath === "/") setRestoring(true);
      setPath(nextPath);
    };
    window.addEventListener("popstate", updatePath);
    return () => window.removeEventListener("popstate", updatePath);
  }, [path]);

  useEffect(() => {
    if (accountAction || path !== "/") return;
    let active = true;
    api
      .refresh()
      .then(async ({ accessToken, expiresIn }) => {
        const profile = await api.me(accessToken);
        if (active) {
          const language = profile.user.locale === "en" ? "en" : "fr";
          setSession({ kind: "authenticated", language, accessToken, accessTokenExpiresAt: Date.now() + expiresIn * 1000, user: profile.user });
        }
      })
      .catch(() => undefined)
      .finally(() => active && setRestoring(false));
    return () => {
      active = false;
    };
  }, [accountAction, path]);

  const authenticatedSession = session?.kind === "authenticated" ? session : null;
  useEffect(() => {
    if (!authenticatedSession) return;
    let active = true;

    const renew = async () => {
      try {
        const result = await api.refresh();
        if (!active) return;
        setSession((current) => current?.kind === "authenticated" ? {
          ...current,
          accessToken: result.accessToken,
          accessTokenExpiresAt: Date.now() + result.expiresIn * 1000,
        } : current);
      } catch (error) {
        if (active && error instanceof ApiError && error.status === 401) setSession(null);
      }
    };

    const delay = Math.max(15_000, authenticatedSession.accessTokenExpiresAt - Date.now() - 3 * 60 * 1000);
    const timer = window.setTimeout(() => { void renew(); }, delay);
    const stopUnauthorized = onUnauthorized(() => { void renew(); });
    const handleVisibility = () => {
      if (document.visibilityState === "visible" && authenticatedSession.accessTokenExpiresAt - Date.now() < 3 * 60 * 1000) {
        void renew();
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      active = false;
      window.clearTimeout(timer);
      stopUnauthorized();
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [authenticatedSession]);

  useEffect(() => {
    if (path !== "/" || !session) return;
    setPageMetadata(
      session.language === "fr" ? "Tableau de bord | Yahro" : "Dashboard | Yahro",
      session.language === "fr" ? "Votre espace personnel de suivi budgétaire Yahro." : "Your personal Yahro budget tracking space.",
    );
  }, [path, session]);

  const navigateHome = () => {
    window.history.pushState({}, "", "/");
    setRestoring(true);
    setPath("/");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  if (accountAction && token) {
    return (
      <AccountActionPage
        language={currentLanguage()}
        action={accountAction}
        token={token}
        onDone={() => {
          window.history.replaceState({}, "", "/");
          window.location.reload();
        }}
      />
    );
  }

  if (path === "/confidentialite" || path === "/privacy") {
    return <LegalPage kind="privacy" onHome={navigateHome} />;
  }

  if (path === "/conditions" || path === "/terms") {
    return <LegalPage kind="terms" onHome={navigateHome} />;
  }

  if (path !== "/") {
    return <Ghost404Page onHome={navigateHome} />;
  }

  if (restoring) {
    return <div className="grid min-h-screen place-items-center bg-[#f7f7f3] text-sm text-[var(--yahro-muted)] dark:bg-[#080a07] dark:text-[#a5a79f]">Yahro...</div>;
  }

  if (!session) {
    return (
      <LandingPage
        onDemo={(language) => setSession({ kind: "demo", language })}
        onAuthenticated={(language, result) => setSession({ kind: "authenticated", language, accessToken: result.accessToken, accessTokenExpiresAt: Date.now() + result.expiresIn * 1000, user: result.user })}
      />
    );
  }

  const logout = async () => {
    if (session.kind === "authenticated") await api.logout().catch(() => undefined);
    setSession(null);
  };

  const demoProfile: ProfileUser = {
    id: "demo-user",
    email: "ariel@example.com",
    firstName: "Ariël",
    lastName: "Hermas Yapi",
    nickname: "Ariël",
    avatarKey: "sage",
    profilePhotoData: null,
    countryCode: "CI",
    locale: session.language,
    timezone: "Africa/Abidjan",
    defaultCurrency: "XOF",
  };

  return (
    <Suspense fallback={<div className="grid min-h-screen place-items-center bg-[#f7f7f3] text-sm text-[var(--yahro-muted)] dark:bg-[#080a07] dark:text-[#a5a79f]">Yahro...</div>}>
      <BudgetDashboard
        initialLanguage={session.language}
        onLogout={logout}
        profile={session.kind === "authenticated" ? session.user : demoProfile}
        onProfileUpdated={(user) => {
          if (session.kind === "authenticated") setSession({ ...session, user });
        }}
        accessToken={session.kind === "authenticated" ? session.accessToken : undefined}
        defaultCurrency={session.kind === "authenticated" ? (session.user.defaultCurrency ?? "XOF") : "XOF"}
      />
    </Suspense>
  );
}
