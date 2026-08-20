import { useEffect, useState } from "react";
import { Check, Copy, KeyRound, LoaderCircle, ShieldCheck, ShieldOff } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { api, ApiError } from "@/lib/api";
import type { LandingLanguage } from "@/components/landing-page";

interface MfaSettingsProps {
  accessToken: string;
  language: LandingLanguage;
  onSessionEnded: () => void;
}

export default function MfaSettings({ accessToken, language, onSessionEnded }: MfaSettingsProps) {
  const fr = language === "fr";
  const [status, setStatus] = useState<{ enabled: boolean; enabledAt: string | null; recoveryCodesRemaining: number } | null>(null);
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [setup, setSetup] = useState<{ secret: string; otpAuthUri: string } | null>(null);
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([]);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    api.mfaStatus(accessToken).then(setStatus).catch(() => setMessage(fr ? "Impossible de charger les paramètres de sécurité." : "Security settings could not be loaded."));
  }, [accessToken, fr]);

  const startSetup = async () => {
    setPending(true);
    setMessage("");
    try {
      const result = await api.startMfaSetup(accessToken, password);
      setSetup(result);
      setPassword("");
    } catch (error) {
      setMessage(error instanceof ApiError && error.code === "INVALID_CREDENTIALS"
        ? fr ? "Mot de passe incorrect." : "Incorrect password."
        : fr ? "L'activation a échoué." : "Setup failed.");
    } finally {
      setPending(false);
    }
  };

  const confirm = async () => {
    setPending(true);
    setMessage("");
    try {
      const result = await api.confirmMfa(accessToken, code);
      setRecoveryCodes(result.recoveryCodes);
      setSetup(null);
      setCode("");
      setStatus({ enabled: true, enabledAt: new Date().toISOString(), recoveryCodesRemaining: result.recoveryCodes.length });
    } catch {
      setMessage(fr ? "Le code est incorrect, expiré ou déjà utilisé." : "The code is invalid, expired or already used.");
    } finally {
      setPending(false);
    }
  };

  const disable = async () => {
    setPending(true);
    setMessage("");
    try {
      await api.disableMfa(accessToken, password, code);
      onSessionEnded();
    } catch {
      setMessage(fr ? "Le mot de passe ou le code OTP est incorrect." : "The password or OTP code is invalid.");
      setPending(false);
    }
  };

  const copyRecoveryCodes = async () => {
    await navigator.clipboard.writeText(recoveryCodes.join("\n"));
    setMessage(fr ? "Codes copiés. Conservez-les hors ligne." : "Codes copied. Store them offline.");
  };

  if (!status) return <div className="flex items-center gap-2 text-sm text-[var(--yahro-muted)]"><LoaderCircle size={16} className="animate-spin" />{fr ? "Chargement..." : "Loading..."}</div>;

  return (
    <section className="mx-auto max-w-3xl rounded-2xl border border-[#dfdfd9] bg-white p-5 dark:border-white/8 dark:bg-[#20211d] sm:p-7">
      <div className="flex items-start gap-3">
        <span className="yahro-touch-target grid size-12 place-items-center rounded-xl lg:size-10 bg-[#e8f1da] text-[#527132] dark:bg-[#293820] dark:text-[#b8d793]"><ShieldCheck size={20} /></span>
        <div><h2 className="font-[Manrope_Variable] text-lg font-bold">{fr ? "Double authentification" : "Two-factor authentication"}</h2><p className="mt-1 text-sm text-[var(--yahro-muted)]">{status.enabled ? fr ? "Votre compte est protégé par un code OTP." : "Your account is protected by an OTP code." : fr ? "Ajoutez une application d'authentification à votre compte." : "Add an authenticator app to your account."}</p></div>
        <span className={`ml-auto rounded-full px-2.5 py-1 text-[11px] font-bold ${status.enabled ? "bg-[#e8f1da] text-[#527132] dark:bg-[#293820] dark:text-[#b8d793]" : "bg-[#f1eee8] text-[#806d51] dark:bg-[#373229] dark:text-[#d2b98f]"}`}>{status.enabled ? fr ? "Active" : "Enabled" : fr ? "Inactive" : "Disabled"}</span>
      </div>

      {recoveryCodes.length > 0 ? (
        <div className="mt-6 rounded-2xl border border-[#d7e4c5] bg-[#f4f8ed] p-5 dark:border-[#3d512d] dark:bg-[#25301f]">
          <h3 className="font-bold">{fr ? "Enregistrez vos codes de récupération" : "Save your recovery codes"}</h3>
          <p className="mt-2 text-xs leading-relaxed text-[#6f7169] dark:text-[#b7b9b1]">{fr ? "Chaque code ne fonctionne qu'une fois. Ils ne seront plus affichés après avoir quitté cet écran." : "Each code works once. They will not be shown again after you leave this screen."}</p>
          <div className="mt-4 grid grid-cols-2 gap-2 rounded-xl bg-white p-4 font-mono text-xs dark:bg-[#171813]">{recoveryCodes.map((item) => <span key={item}>{item}</span>)}</div>
          <button type="button" onClick={copyRecoveryCodes} className="mt-4 flex h-10 items-center gap-2 rounded-xl bg-[#20211d] px-4 text-xs font-bold text-white dark:bg-[#dcebc5] dark:text-[#202b13]"><Copy size={14} />{fr ? "Copier les codes" : "Copy codes"}</button>
        </div>
      ) : setup ? (
        <div className="mt-6 grid gap-6 sm:grid-cols-[190px_1fr]">
          <div className="grid place-items-center rounded-2xl bg-white p-4"><QRCodeSVG value={setup.otpAuthUri} size={158} level="M" marginSize={1} /></div>
          <div>
            <h3 className="font-bold">{fr ? "Scannez le QR code" : "Scan the QR code"}</h3>
            <p className="mt-2 text-xs leading-relaxed text-[var(--yahro-muted)]">{fr ? "Utilisez une application compatible TOTP, puis saisissez le code à 6 chiffres." : "Use a TOTP-compatible app, then enter the 6-digit code."}</p>
            <div className="mt-3 break-all rounded-xl bg-[#f1f1ed] p-3 font-mono text-xs dark:bg-[#171813]">{setup.secret}</div>
            <label className="mt-4 block text-xs font-semibold">{fr ? "Code OTP" : "OTP code"}<input value={code} onChange={(event) => setCode(event.target.value)} inputMode="numeric" autoComplete="one-time-code" minLength={6} maxLength={6} className="mt-2 h-11 w-full rounded-xl border border-[#dfdfd9] bg-white px-3 text-center font-mono text-lg tracking-[.2em] dark:border-white/10 dark:bg-[#171813]" /></label>
            <button type="button" disabled={pending || code.length !== 6} onClick={confirm} className="mt-4 flex h-10 items-center gap-2 rounded-xl bg-[#20211d] px-4 text-xs font-bold text-white disabled:opacity-50 dark:bg-[#dcebc5] dark:text-[#202b13]"><Check size={14} />{fr ? "Confirmer l'activation" : "Confirm activation"}</button>
          </div>
        </div>
      ) : status.enabled ? (
        <div className="mt-6 rounded-2xl border border-[#eaded8] p-5 dark:border-[#4b302b]">
          <h3 className="flex items-center gap-2 font-bold text-[#9d4e3e] dark:text-[#e49a89]"><ShieldOff size={17} />{fr ? "Désactiver la protection" : "Disable protection"}</h3>
          <p className="mt-2 text-xs text-[var(--yahro-muted)]">{fr ? `${status.recoveryCodesRemaining} codes de récupération disponibles. La désactivation fermera toutes vos sessions.` : `${status.recoveryCodesRemaining} recovery codes available. Disabling will sign out every session.`}</p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2"><input type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder={fr ? "Mot de passe actuel" : "Current password"} className="h-11 rounded-xl border border-[#dfdfd9] bg-white px-3 text-sm dark:border-white/10 dark:bg-[#171813]" /><input value={code} onChange={(event) => setCode(event.target.value)} placeholder={fr ? "Code OTP ou récupération" : "OTP or recovery code"} className="h-11 rounded-xl border border-[#dfdfd9] bg-white px-3 text-sm dark:border-white/10 dark:bg-[#171813]" /></div>
          <button type="button" disabled={pending || !password || code.length < 6} onClick={disable} className="mt-4 flex h-10 items-center gap-2 rounded-xl bg-[#a65443] px-4 text-xs font-bold text-white disabled:opacity-50"><ShieldOff size={14} />{fr ? "Désactiver et fermer les sessions" : "Disable and sign out"}</button>
        </div>
      ) : (
        <div className="mt-6">
          <label className="block max-w-sm text-xs font-semibold">{fr ? "Confirmez votre mot de passe" : "Confirm your password"}<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} className="mt-2 h-11 w-full rounded-xl border border-[#dfdfd9] bg-white px-3 text-sm dark:border-white/10 dark:bg-[#171813]" /></label>
          <button type="button" disabled={pending || !password} onClick={startSetup} className="mt-4 flex h-10 items-center gap-2 rounded-xl bg-[#20211d] px-4 text-xs font-bold text-white disabled:opacity-50 dark:bg-[#dcebc5] dark:text-[#202b13]"><KeyRound size={14} />{fr ? "Configurer une application OTP" : "Set up an OTP app"}</button>
        </div>
      )}

      {message && <p role="status" className="mt-4 rounded-xl bg-[#f1f1ed] px-3 py-2 text-xs text-[#6f7169] dark:bg-[#171813] dark:text-[#b7b9b1]">{message}</p>}
    </section>
  );
}
