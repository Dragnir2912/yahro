import { useEffect, useState, type FormEvent } from "react";
import { Archive, ArrowRightLeft, Banknote, RefreshCw, Save } from "lucide-react";
import { api, ApiError, type CustomExchangeRate } from "@/lib/api";
import { currencyFractionDigits, currencyName, supportedCurrencies } from "@/lib/currencies";
import ConfirmDialog from "@/components/ui/confirm-dialog";

type Language = "fr" | "en";

function messageFor(error: unknown, language: Language) {
  if (error instanceof ApiError && error.code === "RATE_UNAVAILABLE") return language === "fr" ? "Aucun taux officiel n'est disponible pour cette paire." : "No official rate is available for this pair.";
  if (error instanceof ApiError && error.code === "RATE_PROVIDER_UNAVAILABLE") return language === "fr" ? "La source officielle est temporairement indisponible." : "The official source is temporarily unavailable.";
  return language === "fr" ? "L'opération n'a pas pu être terminée." : "The operation could not be completed.";
}

export default function CurrencyTools({ accessToken, language, defaultCurrency, onDefaultCurrencyChange }: { accessToken: string; language: Language; defaultCurrency: string; onDefaultCurrencyChange: (currency: string) => void }) {
  const [profileCurrency, setProfileCurrency] = useState(defaultCurrency);
  const [amount, setAmount] = useState("1");
  const [base, setBase] = useState(defaultCurrency);
  const [quote, setQuote] = useState(defaultCurrency === "EUR" ? "USD" : "EUR");
  const [result, setResult] = useState<{ convertedAmount: string; rate: string; source: string; rateDate: string; custom: boolean } | null>(null);
  const [customRates, setCustomRates] = useState<CustomExchangeRate[]>([]);
  const [customBase, setCustomBase] = useState(defaultCurrency);
  const [customQuote, setCustomQuote] = useState(defaultCurrency === "EUR" ? "USD" : "EUR");
  const [customRate, setCustomRate] = useState("");
  const [customLabel, setCustomLabel] = useState("");
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState<{ error: boolean; text: string } | null>(null);
  const [archiveTarget, setArchiveTarget] = useState<CustomExchangeRate>();

  useEffect(() => {
    let active = true;
    api.customExchangeRates(accessToken).then((response) => { if (active) setCustomRates(response.data); }).catch(() => undefined);
    return () => { active = false; };
  }, [accessToken]);

  const convert = async (event: FormEvent) => {
    event.preventDefault();
    setPending(true);
    setNotice(null);
    try {
      setResult(await api.convertCurrency(accessToken, base, quote, amount.replace(",", ".")));
    } catch (error) {
      setResult(null);
      setNotice({ error: true, text: messageFor(error, language) });
    } finally {
      setPending(false);
    }
  };

  const saveDefaultCurrency = async () => {
    setPending(true);
    setNotice(null);
    try {
      await api.updateProfile(accessToken, { defaultCurrency: profileCurrency });
      onDefaultCurrencyChange(profileCurrency);
      setNotice({ error: false, text: language === "fr" ? "Devise principale mise à jour." : "Main currency updated." });
    } catch (error) {
      setNotice({ error: true, text: messageFor(error, language) });
    } finally {
      setPending(false);
    }
  };

  const createCustomRate = async (event: FormEvent) => {
    event.preventDefault();
    setPending(true);
    setNotice(null);
    try {
      const created = await api.createCustomExchangeRate(accessToken, { baseCurrency: customBase, quoteCurrency: customQuote, rate: customRate.replace(",", "."), label: customLabel || undefined });
      setCustomRates((current) => [created, ...current.filter((rate) => !(rate.baseCurrency === created.baseCurrency && rate.quoteCurrency === created.quoteCurrency && rate.active))]);
      setCustomRate("");
      setCustomLabel("");
      setNotice({ error: false, text: language === "fr" ? "Taux personnalisé enregistré et prioritaire." : "Custom rate saved and now takes priority." });
    } catch (error) {
      setNotice({ error: true, text: messageFor(error, language) });
    } finally {
      setPending(false);
    }
  };

  const archiveRate = async (rate: CustomExchangeRate) => {
    setPending(true);
    try {
      await api.archiveCustomExchangeRate(accessToken, rate.id);
      setCustomRates((current) => current.filter((item) => item.id !== rate.id));
      setArchiveTarget(undefined);
    } catch (error) {
      setNotice({ error: true, text: messageFor(error, language) });
    } finally {
      setPending(false);
    }
  };

  return (
    <section className="mb-5 rounded-2xl border border-yahro-border bg-white p-5 dark:border-white/8 dark:bg-[#20211d] sm:p-6">
      <div className="mb-5 flex items-start gap-3"><span className="grid size-10 shrink-0 place-items-center rounded-xl bg-[#e7f0da] text-[#5b7839] dark:bg-[#2c3b22] dark:text-[#b8d793]"><ArrowRightLeft size={18} /></span><div><h2 className="font-[Manrope_Variable] font-bold">{language === "fr" ? "Devises et taux de change" : "Currencies and exchange rates"}</h2><p className="mt-1 text-xs leading-relaxed text-[var(--yahro-muted)] dark:text-[var(--yahro-muted)]">{language === "fr" ? "Taux de référence datés, avec priorité explicite aux taux personnalisés." : "Dated reference rates, with explicit priority given to custom rates."}</p></div></div>

      <div className="grid gap-4 xl:grid-cols-2">
        <div className="rounded-2xl bg-[#f5f6f1] p-4 dark:bg-[#191a16]">
          <h3 className="mb-3 flex items-center gap-2 text-sm font-bold"><Banknote size={16} />{language === "fr" ? "Devise principale" : "Main currency"}</h3>
          <div className="flex gap-2"><select value={profileCurrency} onChange={(event) => setProfileCurrency(event.target.value)} className="field flex-1">{supportedCurrencies.map((currency) => <option key={currency} value={currency}>{currencyName(currency, language)}</option>)}</select><button type="button" disabled={pending || profileCurrency === defaultCurrency} onClick={() => void saveDefaultCurrency()} className="inline-flex h-11 items-center gap-2 rounded-xl bg-[#20211d] px-4 text-xs font-bold text-white disabled:opacity-40 dark:bg-[#dcebc5] dark:text-[#202b13]"><Save size={15} />{language === "fr" ? "Enregistrer" : "Save"}</button></div>
          <p className="mt-2 text-[11px] text-[var(--yahro-muted)]">{language === "fr" ? "La devise du pays est proposée automatiquement lors de l'inscription. Ce choix reste modifiable." : "The country's currency is suggested during registration. You can still change it."}</p>
        </div>

        <form onSubmit={convert} className="rounded-2xl bg-[#f5f6f1] p-4 dark:bg-[#191a16]">
          <h3 className="mb-3 flex items-center gap-2 text-sm font-bold"><RefreshCw size={16} />{language === "fr" ? "Convertisseur" : "Converter"}</h3>
          <div className="grid gap-2 sm:grid-cols-3"><input required inputMode="decimal" pattern="[0-9]+([.,][0-9]+)?" value={amount} onChange={(event) => setAmount(currencyFractionDigits(base) === 0 ? event.target.value.replace(/\D/g, "") : event.target.value.replace(",", ".").replace(/[^0-9.]/g, ""))} className="field" /><select value={base} onChange={(event) => setBase(event.target.value)} className="field">{supportedCurrencies.map((currency) => <option key={currency} value={currency}>{currencyName(currency, language)}</option>)}</select><select value={quote} onChange={(event) => setQuote(event.target.value)} className="field">{supportedCurrencies.map((currency) => <option key={currency} value={currency}>{currencyName(currency, language)}</option>)}</select></div>
          <button disabled={pending || base === quote} type="submit" className="mt-3 h-10 w-full rounded-xl bg-[#e1eccf] text-xs font-bold text-[#49632e] disabled:opacity-40 dark:bg-[#2d3b24] dark:text-[#c8e0a9]">{language === "fr" ? "Convertir" : "Convert"}</button>
          {result && <div className="mt-3 rounded-xl bg-white px-3 py-3 dark:bg-white/5"><p className="font-[Manrope_Variable] text-lg font-extrabold">{new Intl.NumberFormat(language === "fr" ? "fr-FR" : "en-US", { maximumFractionDigits: 4 }).format(Number(result.convertedAmount))} {currencyName(quote, language)}</p><p className="mt-1 text-[10px] text-[var(--yahro-muted)]">1 {currencyName(base, language)} = {Number(result.rate).toPrecision(8)} {currencyName(quote, language)} - {result.custom ? (language === "fr" ? "Taux personnalisé" : "Custom rate") : result.source} - {new Date(result.rateDate).toLocaleDateString(language === "fr" ? "fr-FR" : "en-US")}</p></div>}
        </form>
      </div>

      <form onSubmit={createCustomRate} className="mt-4 rounded-2xl border border-[#e2e3dc] p-4 dark:border-white/8">
        <h3 className="text-sm font-bold">{language === "fr" ? "Ajouter un taux personnalisé" : "Add a custom rate"}</h3>
        <p className="mt-1 text-[11px] text-[var(--yahro-muted)]">{language === "fr" ? "Exemple: 1 USD vaut 590 XOF chez votre organisme. Ce taux remplacera la référence officielle uniquement pour cette paire." : "Example: 1 USD is worth 590 XOF at your provider. This rate will replace the official reference only for this pair."}</p>
        <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-[1.2fr_1.2fr_1fr_1.3fr_auto]"><select value={customBase} onChange={(event) => setCustomBase(event.target.value)} className="field">{supportedCurrencies.map((currency) => <option key={currency} value={currency}>{currencyName(currency, language)}</option>)}</select><select value={customQuote} onChange={(event) => setCustomQuote(event.target.value)} className="field">{supportedCurrencies.map((currency) => <option key={currency} value={currency}>{currencyName(currency, language)}</option>)}</select><input required inputMode="decimal" placeholder={language === "fr" ? "Taux" : "Rate"} value={customRate} onChange={(event) => setCustomRate(event.target.value)} className="field" /><input maxLength={120} placeholder={language === "fr" ? "Nom de l'organisme" : "Provider name"} value={customLabel} onChange={(event) => setCustomLabel(event.target.value)} className="field" /><button disabled={pending || customBase === customQuote} className="h-11 rounded-xl bg-[#20211d] px-4 text-xs font-bold text-white disabled:opacity-40 dark:bg-[#dcebc5] dark:text-[#202b13]">{language === "fr" ? "Ajouter" : "Add"}</button></div>
      </form>

      {notice && <p role="status" className={`mt-3 rounded-xl px-3 py-2 text-xs ${notice.error ? "bg-[#f8e9e5] text-[#a6503f] dark:bg-[#402824] dark:text-[#eda18f]" : "bg-[#e8f1da] text-[#4f6b30] dark:bg-[#293820] dark:text-[#bddc97]"}`}>{notice.text}</p>}
      {customRates.length > 0 && <div className="mt-4 space-y-2">{customRates.map((rate) => <div key={rate.id} className="flex items-center justify-between gap-3 rounded-xl bg-[#f5f6f1] px-3 py-2.5 dark:bg-[#191a16]"><div><p className="text-xs font-bold">1 {currencyName(rate.baseCurrency, language)} = {rate.rate} {currencyName(rate.quoteCurrency, language)}</p><p className="mt-0.5 text-[10px] text-[var(--yahro-muted)]">{rate.label || (language === "fr" ? "Taux personnalisé" : "Custom rate")}</p></div><button type="button" disabled={pending} onClick={() => setArchiveTarget(rate)} className="yahro-touch-target grid size-12 place-items-center rounded-xl text-[#a15a4a] hover:bg-[#f3e4df] lg:size-10 dark:hover:bg-[#3b2925]" aria-label={language === "fr" ? "Archiver" : "Archive"}><Archive size={15} /></button></div>)}</div>}
      <ConfirmDialog open={Boolean(archiveTarget)} title={language === "fr" ? "Archiver ce taux personnalisé ?" : "Archive this custom rate?"} description={language === "fr" ? "Le taux officiel sera de nouveau utilisé pour cette paire de devises." : "The official rate will be used again for this currency pair."} confirmLabel={language === "fr" ? "Archiver" : "Archive"} cancelLabel={language === "fr" ? "Annuler" : "Cancel"} pending={pending} onClose={() => setArchiveTarget(undefined)} onConfirm={async () => { if (archiveTarget) await archiveRate(archiveTarget); }} />
    </section>
  );
}
