import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowRight, ArrowRightLeft, History } from "lucide-react";
import { api, type FinanceAccount, type FinanceTransaction } from "@/lib/api";
import { formatCurrencyAmount } from "@/lib/currencies";

type Language = "fr" | "en";
type Cursor = { beforeDate: string; beforeId: string } | null;

interface TransferGroup {
  id: string;
  description: string;
  transactionDate: string;
  source?: FinanceTransaction;
  destination?: FinanceTransaction;
}

export default function TransferHistory({ accessToken, language, revision = 0 }: { accessToken: string; language: Language; revision?: number }) {
  const [accounts, setAccounts] = useState<FinanceAccount[]>([]);
  const [transactions, setTransactions] = useState<FinanceTransaction[]>([]);
  const [cursor, setCursor] = useState<Cursor>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string>();

  const load = useCallback(async () => {
    setLoading(true);
    setError(undefined);
    try {
      const [accountResponse, transferResponse] = await Promise.all([
        api.accounts(accessToken),
        api.transactions(accessToken, { type: "TRANSFER", limit: 100 }),
      ]);
      setAccounts(accountResponse.data);
      setTransactions(transferResponse.data);
      setCursor(transferResponse.nextCursor);
    } catch {
      setError(language === "fr" ? "Impossible de charger l'historique des transferts." : "Unable to load transfer history.");
    } finally {
      setLoading(false);
    }
  }, [accessToken, language]);

  useEffect(() => {
    const timer = window.setTimeout(() => { void load(); }, 0);
    return () => window.clearTimeout(timer);
  }, [load, revision]);

  const accountMap = useMemo(() => new Map(accounts.map((account) => [account.id, account])), [accounts]);
  const transfers = useMemo(() => {
    const groups = new Map<string, TransferGroup>();
    for (const transaction of transactions) {
      if (!transaction.transferGroupId) continue;
      const group = groups.get(transaction.transferGroupId) ?? {
        id: transaction.transferGroupId,
        description: transaction.description,
        transactionDate: transaction.transactionDate,
      };
      if (Number(transaction.amount) < 0) group.source = transaction;
      else group.destination = transaction;
      groups.set(group.id, group);
    }
    return [...groups.values()].sort((a, b) => new Date(b.transactionDate).getTime() - new Date(a.transactionDate).getTime());
  }, [transactions]);

  const loadMore = async () => {
    if (!cursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const response = await api.transactions(accessToken, { type: "TRANSFER", limit: 100, beforeDate: cursor.beforeDate, beforeId: cursor.beforeId });
      setTransactions((current) => {
        const existing = new Set(current.map((item) => item.id));
        return [...current, ...response.data.filter((item) => !existing.has(item.id))];
      });
      setCursor(response.nextCursor);
    } catch {
      setError(language === "fr" ? "Impossible de charger les transferts précédents." : "Unable to load earlier transfers.");
    } finally {
      setLoadingMore(false);
    }
  };

  return (
    <section className="mt-6 animate-fade-up rounded-2xl border border-yahro-border bg-white p-4 dark:border-white/8 dark:bg-[#20211d] sm:p-6" aria-labelledby="transfer-history-title">
      <div className="flex items-start gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-[#e8f0de] text-[#628040] dark:bg-[#2a3822] dark:text-[#bad896]"><History size={18} /></span>
        <div><h2 id="transfer-history-title" className="font-[Manrope_Variable] text-lg font-extrabold">{language === "fr" ? "Historique des transferts" : "Transfer history"}</h2><p className="mt-1 text-xs leading-5 text-[var(--yahro-muted)]">{language === "fr" ? "Les transferts que vous avez notés entre vos comptes de suivi." : "Transfers you recorded between your tracking accounts."}</p></div>
      </div>

      {error && <div role="alert" className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-[#f7e9e5] px-4 py-3 text-sm text-[#a05240] dark:bg-[#3b2723] dark:text-[#efaa99]"><span>{error}</span><button type="button" onClick={() => void load()} className="min-h-11 rounded-xl px-3 font-bold">{language === "fr" ? "Réessayer" : "Retry"}</button></div>}
      {loading ? <div className="mt-5 h-32 animate-pulse rounded-xl bg-black/5 dark:bg-white/5" /> : transfers.length === 0 ? <div className="mt-5 rounded-xl border border-dashed border-[#d8ddd0] px-4 py-8 text-center dark:border-white/10"><ArrowRightLeft size={22} className="mx-auto text-[#789653]" /><p className="mt-3 text-sm font-bold">{language === "fr" ? "Aucun transfert noté" : "No recorded transfer"}</p><p className="mt-1 text-xs text-[var(--yahro-muted)]">{language === "fr" ? "Votre prochain transfert apparaîtra ici." : "Your next transfer will appear here."}</p></div> : <div className="mt-5 divide-y divide-[#ecece7] dark:divide-white/7">{transfers.map((transfer) => {
        const sourceAccount = transfer.source ? accountMap.get(transfer.source.accountId) : undefined;
        const destinationAccount = transfer.destination ? accountMap.get(transfer.destination.accountId) : undefined;
        return <article key={transfer.id} className="grid gap-3 py-4 first:pt-0 last:pb-0 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"><div className="min-w-0"><p className="truncate text-sm font-bold">{transfer.description}</p><div className="mt-2 flex min-w-0 items-center gap-2 text-xs text-[var(--yahro-muted)]"><span className="truncate">{sourceAccount?.name ?? (language === "fr" ? "Compte source" : "Source account")}</span><ArrowRight size={14} className="shrink-0 text-[#71904c]" /><span className="truncate">{destinationAccount?.name ?? (language === "fr" ? "Compte destination" : "Destination account")}</span></div></div><div className="sm:text-right"><p className="yahro-money text-sm font-extrabold">{transfer.source ? formatCurrencyAmount(Math.abs(Number(transfer.source.amount)), transfer.source.currency, language) : "-"}{transfer.destination && transfer.source?.currency !== transfer.destination.currency ? ` -> ${formatCurrencyAmount(transfer.destination.amount, transfer.destination.currency, language)}` : ""}</p><p className="mt-1 text-[10px] text-[var(--yahro-muted)]">{new Intl.DateTimeFormat(language === "fr" ? "fr-FR" : "en-US", { dateStyle: "medium" }).format(new Date(transfer.transactionDate))}</p></div></article>;
      })}</div>}
      {cursor && !loading && <button type="button" onClick={() => void loadMore()} disabled={loadingMore} className="mt-5 h-11 w-full rounded-xl border border-yahro-border text-sm font-bold disabled:opacity-50 dark:border-white/10">{loadingMore ? (language === "fr" ? "Chargement..." : "Loading...") : (language === "fr" ? "Afficher les transferts précédents" : "Show earlier transfers")}</button>}
    </section>
  );
}
