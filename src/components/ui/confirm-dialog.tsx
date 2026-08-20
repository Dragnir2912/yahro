import AccessibleDialog from "@/components/ui/accessible-dialog";

type ConfirmDialogProps = {
  open: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  cancelLabel: string;
  pending?: boolean;
  destructive?: boolean;
  onConfirm: () => void | Promise<void>;
  onClose: () => void;
};

export default function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel,
  cancelLabel,
  pending = false,
  destructive = false,
  onConfirm,
  onClose,
}: ConfirmDialogProps) {
  if (!open) return null;
  return (
    <AccessibleDialog titleId="confirm-dialog-title" descriptionId="confirm-dialog-description" onClose={onClose} overlayClassName="z-[110]" className="sm:max-w-md">
      <h2 id="confirm-dialog-title" className="font-[Manrope_Variable] text-xl font-extrabold">{title}</h2>
      <p id="confirm-dialog-description" className="mt-3 text-sm leading-relaxed text-[var(--yahro-muted)]">{description}</p>
      <div className="mt-6 grid grid-cols-2 gap-3">
        <button type="button" disabled={pending} onClick={onClose} className="min-h-12 rounded-xl border border-[var(--yahro-border)] px-4 text-sm font-bold disabled:opacity-50">{cancelLabel}</button>
        <button type="button" disabled={pending} onClick={() => void onConfirm()} className={destructive ? "min-h-12 rounded-xl bg-[var(--yahro-danger)] px-4 text-sm font-bold text-white disabled:opacity-50" : "min-h-12 rounded-xl bg-[#20211d] px-4 text-sm font-bold text-white disabled:opacity-50 dark:bg-[#dcebc5] dark:text-[#202b13]"}>{confirmLabel}</button>
      </div>
    </AccessibleDialog>
  );
}
