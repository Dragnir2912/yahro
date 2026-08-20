import React, { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";

const focusableSelector = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

type AccessibleDialogProps = {
  children: React.ReactNode;
  titleId: string;
  descriptionId?: string;
  onClose: () => void;
  className?: string;
  overlayClassName?: string;
  closeOnBackdrop?: boolean;
};

export default function AccessibleDialog({
  children,
  titleId,
  descriptionId,
  onClose,
  className,
  overlayClassName,
  closeOnBackdrop = false,
}: AccessibleDialogProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const frame = window.requestAnimationFrame(() => {
      const preferred = panelRef.current?.querySelector<HTMLElement>("[data-autofocus]");
      const firstField = panelRef.current?.querySelector<HTMLElement>("input:not([type='hidden']):not([type='file']):not([disabled]), select:not([disabled]), textarea:not([disabled])");
      const first = panelRef.current?.querySelector<HTMLElement>(focusableSelector);
      (preferred ?? firstField ?? first ?? panelRef.current)?.focus();
    });

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onCloseRef.current();
        return;
      }
      if (event.key !== "Tab" || !panelRef.current) return;

      const focusable = Array.from(panelRef.current.querySelectorAll<HTMLElement>(focusableSelector))
        .filter((element) => element.offsetParent !== null);
      if (focusable.length === 0) {
        event.preventDefault();
        panelRef.current.focus();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      window.cancelAnimationFrame(frame);
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;
      previousFocus?.focus();
    };
  }, []);

  return createPortal(
    <div
      className={cn(
        "yahro-scrollbar-hidden fixed inset-0 z-[90] flex min-h-[100dvh] items-end justify-center overflow-y-auto bg-black/40 px-[env(safe-area-inset-left)] pb-[env(safe-area-inset-bottom)] pt-[env(safe-area-inset-top)] backdrop-blur-[2px] sm:items-center sm:p-6",
        overlayClassName,
      )}
      onMouseDown={(event) => {
        if (closeOnBackdrop && event.currentTarget === event.target) onClose();
      }}
      role="presentation"
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        tabIndex={-1}
        className={cn(
          "yahro-scrollbar-hidden max-h-[calc(100dvh-env(safe-area-inset-top)-env(safe-area-inset-bottom))] w-full overflow-y-auto overscroll-contain rounded-t-[28px] border border-[#dfdfd9] bg-white p-6 text-[var(--yahro-text)] shadow-2xl dark:border-white/10 dark:bg-[#20211d] sm:max-h-[min(94dvh,900px)] sm:rounded-[24px]",
          className,
        )}
      >
        {children}
      </div>
    </div>,
    document.body,
  );
}
