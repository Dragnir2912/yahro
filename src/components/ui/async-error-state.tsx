type AsyncErrorStateProps = {
  message: string;
  retryLabel: string;
  onRetry: () => void | Promise<void>;
};

export default function AsyncErrorState({ message, retryLabel, onRetry }: AsyncErrorStateProps) {
  return (
    <div role="alert" className="flex min-h-32 flex-col items-center justify-center gap-3 rounded-2xl border border-[#e8cdc6] bg-[#fbeeea] p-5 text-center dark:border-[#5a3a33] dark:bg-[#2e1f1b]">
      <p className="text-sm text-[#8f4634] dark:text-[#e9a695]">{message}</p>
      <button type="button" onClick={() => void onRetry()} className="min-h-11 rounded-xl border border-[#d9b3aa] px-4 text-sm font-bold text-[#8f4634] hover:bg-[#f5ded8] dark:border-[#6d453c] dark:text-[#e9a695]">{retryLabel}</button>
    </div>
  );
}
