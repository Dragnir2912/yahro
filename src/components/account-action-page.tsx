import { useEffect, useState } from "react";
import { ArrowLeft, CheckCircle2, LoaderCircle, ShieldCheck } from "lucide-react";
import { api, ApiError } from "@/lib/api";
import type { LandingLanguage } from "@/components/landing-page";
import { setPageMetadata } from "@/lib/page-metadata";

interface AccountActionPageProps {
  language: LandingLanguage;
  action: "verify-email" | "reset-password";
  token: string;
  onDone: () => void;
}

export default function AccountActionPage({ language, action, token, onDone }: AccountActionPageProps) {
  const isFrench = language === "fr";
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">(action === "verify-email" ? "loading" : "idle");
  const [message, setMessage] = useState("");

  useEffect(() => {
    const title = action === "verify-email"
      ? isFrench ? "Confirmation de l'adresse | Yahro" : "Email confirmation | Yahro"
      : isFrench ? "Nouveau mot de passe | Yahro" : "New password | Yahro";
    const description = isFrench ? "Sécurisez et validez l'accès à votre compte Yahro." : "Secure and validate access to your Yahro account.";
    setPageMetadata(title, description);
  }, [action, isFrench]);

  useEffect(() => {
    if (action !== "verify-email") return;
    api
      .verifyEmail(token)
      .then(() => {
        setStatus("success");
        setMessage(isFrench ? "Votre adresse email est confirmée. Vous pouvez maintenant vous connecter." : "Your email is confirmed. You can now sign in.");
      })
      .catch((error: unknown) => {
        setStatus("error");
        setMessage(error instanceof ApiError && error.code === "INVALID_OR_EXPIRED_TOKEN"
          ? isFrench ? "Ce lien est invalide ou expiré." : "This link is invalid or expired."
          : isFrench ? "La confirmation a échoué. Réessayez plus tard." : "Confirmation failed. Please try again later.");
      });
  }, [action, isFrench, token]);

  const submitReset = async (event: React.FormEvent) => {
    event.preventDefault();
    setStatus("loading");
    setMessage("");
    try {
      await api.resetPassword(token, password);
      setStatus("success");
      setMessage(isFrench ? "Votre mot de passe a été modifié. Toutes les anciennes sessions sont fermées." : "Your password was changed. All previous sessions are signed out.");
    } catch (error) {
      setStatus("error");
      setMessage(error instanceof ApiError && error.code === "INVALID_OR_EXPIRED_TOKEN"
        ? isFrench ? "Ce lien est invalide ou expiré." : "This link is invalid or expired."
        : isFrench ? "La réinitialisation a échoué." : "Password reset failed.");
    }
  };

  return (
    <main className="grid min-h-screen place-items-center bg-[#f7f7f3] p-5 text-[#191a16] dark:bg-[#080a07] dark:text-[#f4f4ef]">
      <section className="w-full max-w-md rounded-[26px] border border-black/8 bg-white p-7 shadow-2xl dark:border-white/10 dark:bg-[#1d1e1a] sm:p-9">
        <div className="mb-7 flex items-center gap-3">
          <span className="grid size-11 place-items-center rounded-2xl bg-[#e8f1da] text-[#527132] dark:bg-[#293820] dark:text-[#b8d793]"><ShieldCheck size={22} /></span>
          <div><p className="font-[Manrope_Variable] text-lg font-extrabold">Yahro</p><p className="text-xs text-[var(--yahro-muted)]">{isFrench ? "Sécurité du compte" : "Account security"}</p></div>
        </div>

        <h1 className="font-[Manrope_Variable] text-2xl font-extrabold tracking-[-.04em]">
          {action === "verify-email" ? isFrench ? "Confirmation de l'adresse" : "Email confirmation" : isFrench ? "Nouveau mot de passe" : "New password"}
        </h1>

        {action === "reset-password" && status !== "success" && (
          <form className="mt-6" onSubmit={submitReset}>
            <label className="block text-xs font-semibold">
              {isFrench ? "Mot de passe, 12 caractères minimum" : "Password, 12 characters minimum"}
              <input type="password" required minLength={12} maxLength={128} value={password} onChange={(event) => setPassword(event.target.value)} className="mt-2 h-11 w-full rounded-xl border border-black/10 bg-white px-3 text-sm dark:border-white/10 dark:bg-[#171813]" />
            </label>
            <button disabled={status === "loading"} className="mt-5 flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-[#20211d] text-sm font-bold text-white disabled:opacity-60 dark:bg-[#dcebc5] dark:text-[#202b13]">
              {status === "loading" && <LoaderCircle size={16} className="animate-spin" />}{isFrench ? "Enregistrer" : "Save password"}
            </button>
          </form>
        )}

        {action === "verify-email" && status === "loading" && <p className="mt-6 flex items-center gap-2 text-sm text-[var(--yahro-muted)]"><LoaderCircle size={17} className="animate-spin" />{isFrench ? "Vérification en cours..." : "Verifying..."}</p>}
        {message && <p role="status" className={`mt-6 rounded-xl px-4 py-3 text-sm ${status === "success" ? "bg-[#e8f1da] text-[#527132] dark:bg-[#293820] dark:text-[#b8d793]" : "bg-[#f5e5e1] text-[#a25140] dark:bg-[#412925] dark:text-[#e49a89]"}`}>{status === "success" && <CheckCircle2 size={16} className="mr-2 inline" />}{message}</p>}
        <button type="button" onClick={onDone} className="mt-6 flex items-center gap-2 text-sm font-bold text-[#668744]"><ArrowLeft size={16} />{isFrench ? "Retour à l'accueil" : "Back to home"}</button>
      </section>
    </main>
  );
}
