import { useEffect, useMemo, useState } from "react";
import { ArrowRightLeft, X } from "lucide-react";
import AccessibleDialog from "@/components/ui/accessible-dialog";
import { api, type FinanceAccount } from "@/lib/api";
import { currencyFractionDigits, currencyName, formatCurrencyAmount } from "@/lib/currencies";

type Language = "fr" | "en";

function cleanAmount(value: string, currency: string) {
  if (currencyFractionDigits(currency) === 0) return value.replace(/\D/g, "");
  const normalized = value.replace(",", ".").replace(/[^0-9.]/g, "");
  const [whole, ...decimals] = normalized.split(".");
  return decimals.length ? `${whole}.${decimals.join("").slice(0, currencyFractionDigits(currency))}` : whole;
}

export default function TransferModal({ accessToken, language, onClose, onCreated, onNeedAccounts }: { accessToken: string; language: Language; onClose: () => void; onCreated: () => void; onNeedAccounts: () => void }) {
  const [accounts, setAccounts] = useState<FinanceAccount[]>([]);
  const [sourceAccountId, setSourceAccountId] = useState("");
  const [destinationAccountId, setDestinationAccountId] = useState("");
  const [sourceAmount, setSourceAmount] = useState("");
  const [destinationAmount, setDestinationAmount] = useState("");
  const [transactionDate, setTransactionDate] = useState(new Date().toISOString().slice(0, 10));
  const [description, setDescription] = useState("");
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  useEffect(() => {
    let active = true;
    void api.accounts(accessToken).then((response) => {
      if (!active) return;
      setAccounts(response.data);
      setSourceAccountId(response.data[0]?.id ?? "");
      setDestinationAccountId(response.data[1]?.id ?? "");
    }).catch(() => active && setError(language === "fr" ? "Impossible de charger vos comptes." : "Unable to load your accounts.")).finally(() => active && setLoading(false));
    return () => { active = false; };
  }, [accessToken, language]);

  const sourceAccount = useMemo(() => accounts.find((item) => item.id === sourceAccountId), [accounts, sourceAccountId]);
  const destinationAccount = useMemo(() => accounts.find((item) => item.id === destinationAccountId), [accounts, destinationAccountId]);
  const differentCurrencies = Boolean(sourceAccount && destinationAccount && sourceAccount.currency !== destinationAccount.currency);
  const amountIsValid = Number(sourceAmount) > 0 && (!differentCurrencies || Number(destinationAmount) > 0);
  const canSubmit = accounts.length >= 2 && sourceAccountId !== destinationAccountId && amountIsValid && description.trim().length > 0 && !busy;

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!canSubmit) return;
    setBusy(true);
    setError(undefined);
    try {
      await api.createTransfer(accessToken, {
        sourceAccountId,
        destinationAccountId,
        sourceAmount,
        ...(differentCurrencies ? { destinationAmount } : {}),
        transactionDate: `${transactionDate}T12:00:00.000Z`,
        description: description.trim(),
        ...(notes.trim() ? { notes: notes.trim() } : {}),
      });
      onCreated();
    } catch {
      setError(language === "fr" ? "Le transfert n'a pas pu être enregistré. Vérifiez les montants et les comptes." : "The transfer could not be recorded. Check the amounts and accounts.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <AccessibleDialog titleId="transfer-dialog-title" descriptionId="transfer-dialog-description" onClose={onClose} overlayClassName="z-[90]" className="max-h-[calc(100dvh-1.5rem-env(safe-area-inset-top)-env(safe-area-inset-bottom))] overflow-y-auto sm:max-w-xl">
      <form onSubmit={(event) => void submit(event)}>
        <div className="mb-5 flex items-start justify-between gap-4">
          <div><span className="grid size-10 place-items-center rounded-xl bg-[#e9f1de] text-[#5d7b3d] dark:bg-[#2a3822] dark:text-[#bad896]"><ArrowRightLeft size={19} /></span><h2 id="transfer-dialog-title" className="mt-4 font-[Manrope_Variable] text-xl font-extrabold">{language === "fr" ? "Noter un transfert" : "Record a transfer"}</h2><p id="transfer-dialog-description" className="mt-1 text-sm text-[var(--yahro-muted)]">{language === "fr" ? "Enregistrez un transfert déjà effectué entre deux comptes de suivi." : "Record a transfer already made between two tracking accounts."}</p></div>
          <button type="button" onClick={onClose} className="grid size-11 shrink-0 place-items-center rounded-xl hover:bg-black/5 dark:hover:bg-white/7" aria-label={language === "fr" ? "Fermer" : "Close"}><X size={18} /></button>
        </div>

        {loading ? <div className="h-44 animate-pulse rounded-2xl bg-black/5 dark:bg-white/5" /> : accounts.length < 2 ? <div className="rounded-2xl border border-dashed border-[#d5dacd] p-5 text-center dark:border-white/10"><p className="font-bold">{language === "fr" ? "Deux comptes sont nécessaires" : "Two accounts are required"}</p><p className="mt-2 text-sm text-[var(--yahro-muted)]">{language === "fr" ? "Ajoutez au moins deux comptes de suivi avant de noter un transfert." : "Add at least two tracking accounts before recording a transfer."}</p><button type="button" onClick={onNeedAccounts} className="mt-4 h-11 rounded-xl bg-[#20211d] px-5 text-sm font-bold text-white dark:bg-[#dcebc5] dark:text-[#202b13]">{language === "fr" ? "Gérer les comptes" : "Manage accounts"}</button></div> : <>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="text-sm font-semibold">{language === "fr" ? "Depuis le compte" : "From account"}<select autoFocus value={sourceAccountId} onChange={(event) => { const next = event.target.value; setSourceAccountId(next); if (next === destinationAccountId) setDestinationAccountId(accounts.find((item) => item.id !== next)?.id ?? ""); setSourceAmount(""); setDestinationAmount(""); }} className="mt-2 h-12 w-full rounded-xl border border-yahro-border bg-[#fafaf7] px-3 text-base dark:border-white/10 dark:bg-[#181914] sm:h-11 sm:text-sm">{accounts.map((account) => <option key={account.id} value={account.id}>{account.name} - {currencyName(account.currency, language)}</option>)}</select></label>
            <label className="text-sm font-semibold">{language === "fr" ? "Vers le compte" : "To account"}<select value={destinationAccountId} onChange={(event) => { setDestinationAccountId(event.target.value); setDestinationAmount(""); }} className="mt-2 h-12 w-full rounded-xl border border-yahro-border bg-[#fafaf7] px-3 text-base dark:border-white/10 dark:bg-[#181914] sm:h-11 sm:text-sm">{accounts.filter((account) => account.id !== sourceAccountId).map((account) => <option key={account.id} value={account.id}>{account.name} - {currencyName(account.currency, language)}</option>)}</select></label>
            <label className="text-sm font-semibold">{language === "fr" ? "Montant retiré" : "Amount withdrawn"}<div className="relative mt-2"><input type="text" inputMode="decimal" value={sourceAmount} onChange={(event) => sourceAccount && setSourceAmount(cleanAmount(event.target.value, sourceAccount.currency))} placeholder="0" className="h-12 w-full rounded-xl border border-yahro-border bg-[#fafaf7] px-3 pr-20 text-base dark:border-white/10 dark:bg-[#181914] sm:h-11" /><span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-[var(--yahro-muted)]">{sourceAccount ? currencyName(sourceAccount.currency, language) : ""}</span></div></label>
            {differentCurrencies ? <label className="text-sm font-semibold">{language === "fr" ? "Montant reçu" : "Amount received"}<div className="relative mt-2"><input type="text" inputMode="decimal" value={destinationAmount} onChange={(event) => destinationAccount && setDestinationAmount(cleanAmount(event.target.value, destinationAccount.currency))} placeholder="0" className="h-12 w-full rounded-xl border border-yahro-border bg-[#fafaf7] px-3 pr-20 text-base dark:border-white/10 dark:bg-[#181914] sm:h-11" /><span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-[var(--yahro-muted)]">{destinationAccount ? currencyName(destinationAccount.currency, language) : ""}</span></div></label> : <div className="self-end rounded-xl bg-[#f1f5eb] px-3 py-3 text-xs text-[#52683a] dark:bg-[#273020] dark:text-[#c2d9a5]">{language === "fr" ? `Le compte de destination recevra ${sourceAmount && sourceAccount ? formatCurrencyAmount(sourceAmount, sourceAccount.currency, language) : "le même montant"}.` : `The destination account will receive ${sourceAmount && sourceAccount ? formatCurrencyAmount(sourceAmount, sourceAccount.currency, language) : "the same amount"}.`}</div>}
            <label className="text-sm font-semibold">{language === "fr" ? "Date" : "Date"}<input type="date" value={transactionDate} onChange={(event) => setTransactionDate(event.target.value)} className="mt-2 h-12 w-full rounded-xl border border-yahro-border bg-[#fafaf7] px-3 text-base dark:border-white/10 dark:bg-[#181914] sm:h-11 sm:text-sm" /></label>
            <label className="text-sm font-semibold">{language === "fr" ? "Libellé" : "Label"}<input value={description} onChange={(event) => setDescription(event.target.value)} maxLength={240} placeholder={language === "fr" ? "Ex. Épargne du mois" : "E.g. Monthly savings"} className="mt-2 h-12 w-full rounded-xl border border-yahro-border bg-[#fafaf7] px-3 text-base dark:border-white/10 dark:bg-[#181914] sm:h-11 sm:text-sm" /></label>
          </div>
          <label className="mt-4 block text-sm font-semibold">{language === "fr" ? "Note facultative" : "Optional note"}<textarea value={notes} onChange={(event) => setNotes(event.target.value)} maxLength={4000} rows={2} className="mt-2 w-full resize-y rounded-xl border border-yahro-border bg-[#fafaf7] p-3 text-base dark:border-white/10 dark:bg-[#181914] sm:text-sm" /></label>
          <p className="mt-4 rounded-xl bg-[#f5f6f1] px-4 py-3 text-xs leading-5 text-[var(--yahro-muted)] dark:bg-[#191a16]">{language === "fr" ? "Yahro note ce transfert pour votre suivi. Aucun argent n'est déplacé et aucune banque n'est contactée." : "Yahro records this transfer for tracking. No money is moved and no bank is contacted."}</p>
          {error && <p role="alert" className="mt-4 rounded-xl bg-[#f7e9e5] px-4 py-3 text-sm text-[#a05240] dark:bg-[#3b2723] dark:text-[#efaa99]">{error}</p>}
          <div className="mt-6 flex gap-3"><button type="button" onClick={onClose} className="h-11 flex-1 rounded-xl border border-yahro-border text-sm font-bold dark:border-white/10">{language === "fr" ? "Annuler" : "Cancel"}</button><button type="submit" disabled={!canSubmit} className="h-11 flex-1 rounded-xl bg-[#20211d] text-sm font-bold text-white disabled:opacity-40 dark:bg-[#dcebc5] dark:text-[#202b13]">{busy ? (language === "fr" ? "Enregistrement..." : "Saving...") : (language === "fr" ? "Enregistrer" : "Save")}</button></div>
        </>}
        {error && accounts.length < 2 && <p role="alert" className="mt-4 rounded-xl bg-[#f7e9e5] px-4 py-3 text-sm text-[#a05240] dark:bg-[#3b2723] dark:text-[#efaa99]">{error}</p>}
      </form>
    </AccessibleDialog>
  );
}
