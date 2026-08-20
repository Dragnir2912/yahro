import React, { useEffect, useState } from "react";
import { Check, ImageUp, Save, X } from "lucide-react";
import { api, type AuthResult } from "@/lib/api";
import { cn } from "@/lib/utils";
import AccessibleDialog from "@/components/ui/accessible-dialog";

type Language = "fr" | "en";
export type ProfileUser = AuthResult["user"];
export type AvatarKey = "sage" | "ocean" | "sunset" | "violet" | "sand" | "rose" | "forest" | "sky";

const avatarOptions: Array<{ key: AvatarKey; className: string }> = [
  { key: "sage", className: "bg-gradient-to-br from-[#dcebc5] to-[#9fbd78] text-[#405626]" },
  { key: "ocean", className: "bg-gradient-to-br from-[#d8edf0] to-[#78a9b3] text-[#285a65]" },
  { key: "sunset", className: "bg-gradient-to-br from-[#f7dfc4] to-[#d98b5f] text-[#713b23]" },
  { key: "violet", className: "bg-gradient-to-br from-[#e9dff1] to-[#a889b7] text-[#563765]" },
  { key: "sand", className: "bg-gradient-to-br from-[#eee5d2] to-[#c2a878] text-[#604c2d]" },
  { key: "rose", className: "bg-gradient-to-br from-[#f3dce1] to-[#cf8b9a] text-[#6b3541]" },
  { key: "forest", className: "bg-gradient-to-br from-[#cde2d4] to-[#5d9270] text-[#244f34]" },
  { key: "sky", className: "bg-gradient-to-br from-[#dce8f5] to-[#7c9fc4] text-[#304e70]" },
];

function initials(profile: Pick<ProfileUser, "nickname">) {
  return (profile.nickname || "Y").split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase();
}

export function ProfileAvatar({ profile, size = "md" }: { profile: ProfileUser; size?: "sm" | "md" | "lg" }) {
  const style = avatarOptions.find((item) => item.key === profile.avatarKey) ?? avatarOptions[0];
  const dimensions = size === "lg" ? "size-20 text-xl rounded-2xl" : size === "sm" ? "size-9 text-xs rounded-xl" : "size-12 text-sm rounded-xl";
  if (profile.profilePhotoData) return <img src={profile.profilePhotoData} alt={profile.nickname} className={cn(dimensions, "object-cover")} />;
  return <span className={cn("grid shrink-0 place-items-center font-extrabold", dimensions, style.className)}>{initials(profile)}</span>;
}

const countries = [
  ["CI", "Côte d'Ivoire"], ["SN", "Sénégal"], ["BJ", "Bénin"], ["TG", "Togo"], ["BF", "Burkina Faso"],
  ["ML", "Mali"], ["NE", "Niger"], ["GN", "Guinée"], ["GH", "Ghana"], ["NG", "Nigeria"], ["CM", "Cameroun"],
  ["CD", "RDC"], ["MA", "Maroc"], ["DZ", "Algérie"], ["TN", "Tunisie"], ["FR", "France"], ["CA", "Canada"],
  ["GA", "Gabon"], ["CG", "Congo"], ["BE", "Belgique"], ["CH", "Suisse"], ["US", "États-Unis"], ["GB", "Royaume-Uni"],
] as const;

export default function ProfileEditor({ accessToken, language, profile, onClose, onUpdated }: { accessToken?: string; language: Language; profile: ProfileUser; onClose: () => void; onUpdated: (profile: ProfileUser) => void }) {
  const [firstName, setFirstName] = useState(profile.firstName ?? "");
  const [lastName, setLastName] = useState(profile.lastName ?? "");
  const [nickname, setNickname] = useState(profile.nickname);
  const [countryCode, setCountryCode] = useState(profile.countryCode ?? "CI");
  const [locale, setLocale] = useState(profile.locale === "en" ? "en" : "fr");
  const [timezone, setTimezone] = useState(profile.timezone ?? "Africa/Abidjan");
  const [avatarKey, setAvatarKey] = useState<AvatarKey>((profile.avatarKey as AvatarKey | null) ?? "sage");
  const [photo, setPhoto] = useState<File>();
  const [photoPreview, setPhotoPreview] = useState(profile.profilePhotoData ?? undefined);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = previous; };
  }, []);

  const choosePhoto = (file?: File) => {
    if (!file) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type) || file.size > 2 * 1024 * 1024) {
      setError(language === "fr" ? "Choisissez une image JPEG, PNG ou WebP de 2 Mo maximum." : "Choose a JPEG, PNG or WebP image up to 2 MB.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setPhotoPreview(typeof reader.result === "string" ? reader.result : undefined);
    reader.readAsDataURL(file);
    setPhoto(file);
    setError(undefined);
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!firstName.trim() || !lastName.trim() || !nickname.trim()) return;
    setBusy(true);
    setError(undefined);
    try {
      const displayName = nickname.trim() || firstName.trim();
      let updated: ProfileUser = { ...profile, firstName: firstName.trim(), lastName: lastName.trim(), nickname: displayName, countryCode, locale, timezone, avatarKey: photo ? null : avatarKey, profilePhotoData: photo ? photoPreview : null };
      if (accessToken) {
        updated = (await api.updateProfile(accessToken, { firstName: firstName.trim(), lastName: lastName.trim(), nickname: displayName, countryCode, locale, timezone, ...(photo ? {} : { avatarKey }) })).user;
        if (photo) updated = (await api.uploadProfilePhoto(accessToken, photo)).user;
      }
      onUpdated(updated);
      onClose();
    } catch {
      setError(language === "fr" ? "Impossible d'enregistrer les modifications." : "Unable to save the changes.");
    } finally {
      setBusy(false);
    }
  };

  const previewProfile: ProfileUser = { ...profile, nickname, avatarKey: photo ? null : avatarKey, profilePhotoData: photoPreview ?? null };

  return <AccessibleDialog titleId="profile-dialog-title" descriptionId="profile-dialog-description" onClose={onClose} overlayClassName="z-[95]" className="sm:max-w-2xl"><form onSubmit={(event) => void submit(event)} className="w-full"><div className="mb-6 flex items-start justify-between"><div><h2 id="profile-dialog-title" className="font-[Manrope_Variable] text-xl font-bold">{language === "fr" ? "Modifier mon profil" : "Edit my profile"}</h2><p id="profile-dialog-description" className="mt-1 text-sm text-[var(--yahro-muted)]">{language === "fr" ? "Personnalisez les informations affichées dans Yahro." : "Customize the information displayed in Yahro."}</p></div><button type="button" onClick={onClose} className="yahro-touch-target grid size-12 place-items-center rounded-xl lg:size-10 hover:bg-[#eeeeea] dark:hover:bg-white/7" aria-label={language === "fr" ? "Fermer" : "Close"}><X size={18} /></button></div><div className="flex flex-col gap-5 rounded-2xl bg-[#f5f6f1] p-4 dark:bg-[#191a16] sm:flex-row sm:items-center"><ProfileAvatar profile={previewProfile} size="lg" /><div className="flex-1"><p className="text-sm font-bold">{language === "fr" ? "Photo ou avatar" : "Photo or avatar"}</p><p className="mt-1 text-[11px] text-[var(--yahro-muted)]">JPEG, PNG ou WebP. 2 Mo maximum.</p><label className="mt-3 inline-flex h-12 cursor-pointer items-center gap-2 rounded-xl border border-[#d8d9d2] bg-white px-3 text-xs font-bold dark:border-white/10 dark:bg-white/6"><ImageUp size={15} />{language === "fr" ? "Ajouter une photo" : "Add a photo"}<input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={(event) => choosePhoto(event.target.files?.[0])} /></label></div></div><fieldset className="mt-5"><legend className="text-xs font-bold text-[#66685f] dark:text-[#c3c5bd]">{language === "fr" ? "Ou choisir un avatar" : "Or choose an avatar"}</legend><div className="mt-3 grid grid-cols-4 gap-3 sm:grid-cols-8">{avatarOptions.map((option) => <button key={option.key} type="button" onClick={() => { setAvatarKey(option.key); setPhoto(undefined); setPhotoPreview(undefined); }} className={cn("relative grid aspect-square place-items-center rounded-xl font-extrabold", option.className, !photo && avatarKey === option.key && "ring-2 ring-[#20211d] ring-offset-2 dark:ring-[#dcebc5] dark:ring-offset-[#20211d]")} aria-label={`${language === "fr" ? "Avatar" : "Avatar"} ${option.key}`}>{initials({ nickname })}{!photo && avatarKey === option.key && <span className="absolute -right-1 -top-1 grid size-5 place-items-center rounded-full bg-[#20211d] text-white dark:bg-[#dcebc5] dark:text-[#202b13]"><Check size={11} /></span>}</button>)}</div></fieldset><div className="mt-6 grid gap-4 sm:grid-cols-2"><label className="text-sm font-medium">{language === "fr" ? "Prénom" : "First name"}<input required maxLength={80} value={firstName} onChange={(event) => setFirstName(event.target.value)} className="mt-2 h-11 w-full rounded-xl border border-yahro-border bg-[#fafaf7] px-3 dark:border-white/10 dark:bg-[#181914]" /></label><label className="text-sm font-medium">{language === "fr" ? "Nom" : "Last name"}<input required maxLength={80} value={lastName} onChange={(event) => setLastName(event.target.value)} className="mt-2 h-11 w-full rounded-xl border border-yahro-border bg-[#fafaf7] px-3 dark:border-white/10 dark:bg-[#181914]" /></label><label className="text-sm font-medium sm:col-span-2">{language === "fr" ? "Surnom utilisé dans l'application (facultatif)" : "Nickname used in the app (optional)"}<input maxLength={40} value={nickname} onChange={(event) => setNickname(event.target.value)} className="mt-2 h-11 w-full rounded-xl border border-yahro-border bg-[#fafaf7] px-3 dark:border-white/10 dark:bg-[#181914]" /></label><label className="text-sm font-medium">{language === "fr" ? "Adresse e-mail" : "Email address"}<input value={profile.email} disabled className="mt-2 h-11 w-full rounded-xl border border-yahro-border bg-[#eeeeea] px-3 text-[var(--yahro-muted)] dark:border-white/10 dark:bg-white/5" /></label><label className="text-sm font-medium">{language === "fr" ? "Pays" : "Country"}<select value={countryCode} onChange={(event) => setCountryCode(event.target.value)} className="mt-2 h-11 w-full rounded-xl border border-yahro-border bg-[#fafaf7] px-3 dark:border-white/10 dark:bg-[#181914]">{countries.map(([code, name]) => <option key={code} value={code}>{name}</option>)}</select></label><label className="text-sm font-medium">{language === "fr" ? "Langue" : "Language"}<select value={locale} onChange={(event) => setLocale(event.target.value as "fr" | "en")} className="mt-2 h-11 w-full rounded-xl border border-yahro-border bg-[#fafaf7] px-3 dark:border-white/10 dark:bg-[#181914]"><option value="fr">Français</option><option value="en">English</option></select></label><label className="text-sm font-medium">{language === "fr" ? "Fuseau horaire" : "Timezone"}<select value={timezone} onChange={(event) => setTimezone(event.target.value)} className="mt-2 h-11 w-full rounded-xl border border-yahro-border bg-[#fafaf7] px-3 dark:border-white/10 dark:bg-[#181914]"><option value="Africa/Abidjan">Africa/Abidjan</option><option value="Africa/Dakar">Africa/Dakar</option><option value="Africa/Lagos">Africa/Lagos</option><option value="Africa/Douala">Africa/Douala</option><option value="Africa/Kinshasa">Africa/Kinshasa</option><option value="Africa/Casablanca">Africa/Casablanca</option><option value="Europe/Paris">Europe/Paris</option><option value="America/Toronto">America/Toronto</option></select></label></div>{error && <p className="mt-4 rounded-xl bg-[#f7e9e5] px-4 py-3 text-xs text-[#a05240] dark:bg-[#3b2723] dark:text-[#e9a191]">{error}</p>}<div className="mt-6 flex gap-3"><button type="button" onClick={onClose} className="h-11 flex-1 rounded-xl border border-yahro-border text-sm font-semibold dark:border-white/10">{language === "fr" ? "Annuler" : "Cancel"}</button><button type="submit" disabled={busy || !firstName.trim() || !lastName.trim()} className="inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-[#20211d] text-sm font-semibold text-white disabled:opacity-40 dark:bg-[#dcebc5] dark:text-[#202b13]"><Save size={16} />{busy ? (language === "fr" ? "Enregistrement..." : "Saving...") : (language === "fr" ? "Enregistrer" : "Save")}</button></div></form></AccessibleDialog>;
}
