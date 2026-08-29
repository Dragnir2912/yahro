import * as React from "react";
import { AnimatePresence, motion, useReducedMotion, type Transition } from "framer-motion";
import { cn } from "@/lib/utils";

export interface ProgressiveFluxPhase {
  at: number;
  label: string;
}

export interface ProgressiveFluxLoaderProps {
  value?: number;
  phases?: ProgressiveFluxPhase[];
  duration?: number;
  loop?: boolean;
  showLabel?: boolean;
  gradient?: string;
  onComplete?: () => void;
  className?: string;
  barClassName?: string;
  textClassName?: string;
  ariaLabel?: string;
}

const DEFAULT_PHASES: ProgressiveFluxPhase[] = [
  { at: 0, label: "Démarrage" },
  { at: 25, label: "Chargement" },
  { at: 55, label: "Préparation" },
  { at: 80, label: "Presque prêt" },
  { at: 100, label: "Terminé" },
];

const FLUX_FROM = "var(--flux-from, #5f7f3b)";
const FLUX_TO = "var(--flux-to, #dcebc5)";
const FLUX_MID = `color-mix(in oklab, ${FLUX_FROM}, ${FLUX_TO})`;
const DEFAULT_GRADIENT = `linear-gradient(90deg, ${FLUX_FROM} 0%, ${FLUX_MID} 35%, ${FLUX_TO} 55%, ${FLUX_MID} 78%, ${FLUX_FROM} 100%)`;
const BAR_SHADOW = `0 0 18px color-mix(in oklab, ${FLUX_FROM} 48%, transparent), 0 0 30px color-mix(in oklab, ${FLUX_TO} 30%, transparent), inset 0 1.5px 0 rgba(255, 255, 255, 0.45), inset 0 -2px 3px rgba(45, 69, 25, 0.28)`;
const SHEEN_GRADIENT = "linear-gradient(90deg, transparent 0%, rgba(255, 255, 255, 0.55) 50%, transparent 100%)";
const Z_TRANSITION: Transition = { duration: 0.9, ease: [0.22, 1, 0.36, 1] };
const LETTER_TRANSITION: Transition = { duration: 0.45, ease: [0.22, 1, 0.36, 1] };

function pickLabel(value: number, sortedPhases: ProgressiveFluxPhase[]) {
  let active = sortedPhases[0]?.label ?? "";
  for (const phase of sortedPhases) if (value >= phase.at) active = phase.label;
  return active;
}

function FluxLabel({ label, reduced, className }: { label: string; reduced: boolean; className?: string }) {
  const base = cn("absolute inset-0 flex items-center justify-center text-center font-[Manrope_Variable] text-lg font-extrabold tracking-[-.03em] text-[var(--yahro-muted)] sm:text-xl", className);
  if (reduced) return <div aria-hidden className={base}>{label}</div>;
  return (
    <AnimatePresence mode="wait">
      <motion.div key={label} aria-hidden className={base} style={{ transformStyle: "preserve-3d" }} initial={{ opacity: 0, z: -300, scale: 0.72, filter: "blur(12px)" }} animate={{ opacity: [0, 1, 1, 1], z: [-300, 45, -6, 0], scale: [0.72, 1.06, 0.99, 1], filter: ["blur(12px)", "blur(0px)", "blur(0px)", "blur(0px)"] }} exit={{ opacity: 0, z: 180, scale: 1.25, filter: "blur(8px)", transition: { duration: 0.4, ease: [0.7, 0, 0.84, 0] } }} transition={Z_TRANSITION}>
        <span className="inline-flex">
          {label.split("").map((char, index) => <motion.span key={`${label}-${index}`} className="inline-block" initial={{ opacity: 0, y: 10, filter: "blur(7px)" }} animate={{ opacity: 1, y: 0, filter: "blur(0px)" }} transition={{ ...LETTER_TRANSITION, delay: 0.15 + index * 0.025 }}>{char === " " ? "\u00a0" : char}</motion.span>)}
        </span>
      </motion.div>
    </AnimatePresence>
  );
}

export function ProgressiveFluxLoader({ value, phases = DEFAULT_PHASES, duration = 12, loop = true, showLabel = true, gradient = DEFAULT_GRADIENT, onComplete, className, barClassName, textClassName, ariaLabel = "Chargement" }: ProgressiveFluxLoaderProps) {
  const reduced = Boolean(useReducedMotion());
  const isControlled = typeof value === "number";
  const [internal, setInternal] = React.useState(0);
  const onCompleteRef = React.useRef(onComplete);
  const completedRef = React.useRef(false);

  React.useEffect(() => { onCompleteRef.current = onComplete; });
  React.useEffect(() => {
    if (isControlled) return;
    let frame = 0;
    let timer = 0;
    let start: number | null = null;
    const totalMs = Math.max(500, duration * 1000);
    const tick = (timestamp: number) => {
      if (start === null) start = timestamp;
      const percentage = Math.min(100, ((timestamp - start) / totalMs) * 100);
      setInternal(percentage);
      if (percentage >= 100) {
        if (!completedRef.current) { completedRef.current = true; onCompleteRef.current?.(); }
        if (loop) timer = window.setTimeout(() => { start = null; completedRef.current = false; setInternal(0); frame = requestAnimationFrame(tick); }, 500);
        return;
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => { cancelAnimationFrame(frame); clearTimeout(timer); };
  }, [duration, isControlled, loop]);

  const raw = isControlled ? value : internal;
  const current = Number.isFinite(raw) ? Math.min(100, Math.max(0, raw!)) : 0;
  React.useEffect(() => {
    if (!isControlled) return;
    if (current >= 100 && !completedRef.current) { completedRef.current = true; onCompleteRef.current?.(); }
    else if (current < 100) completedRef.current = false;
  }, [current, isControlled]);

  const sortedPhases = React.useMemo(() => [...phases].sort((a, b) => a.at - b.at), [phases]);
  const label = React.useMemo(() => pickLabel(current, sortedPhases), [current, sortedPhases]);
  const rounded = Math.round(current);

  return (
    <div className={cn("mx-auto flex w-full max-w-md flex-col items-center gap-5", className)}>
      {showLabel && <div className="relative h-9 w-full select-none" style={reduced ? undefined : { perspective: "1000px" }}><FluxLabel label={label} reduced={reduced} className={textClassName} /></div>}
      <div className={cn("relative h-4 w-full overflow-hidden rounded-full bg-[#e3e7dc] shadow-[inset_0_2px_3px_rgba(40,48,32,.12),inset_0_-1px_2px_rgba(255,255,255,.75)] dark:bg-white/10 dark:shadow-[inset_0_2px_3px_rgba(0,0,0,.42),inset_0_-1px_2px_rgba(255,255,255,.05)]", barClassName)} role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={rounded} aria-valuetext={label ? `${rounded}% - ${label}` : `${rounded}%`} aria-label={ariaLabel}>
        <motion.div className="relative h-full rounded-full" style={{ background: gradient, boxShadow: BAR_SHADOW }} initial={false} animate={{ width: `${current}%` }} transition={reduced ? { duration: 0 } : { duration: 0.5, ease: [0.22, 1, 0.36, 1] }}>
          {!reduced && <motion.span aria-hidden className="pointer-events-none absolute inset-y-0 left-0 w-1/2 rounded-full" style={{ background: SHEEN_GRADIENT, mixBlendMode: "screen" }} animate={{ x: ["-110%", "210%"] }} transition={{ duration: 1.6, ease: "linear", repeat: Infinity }} />}
        </motion.div>
      </div>
      <span className="text-xs tabular-nums text-[var(--yahro-muted)]" aria-hidden>{rounded}%</span>
    </div>
  );
}

export default ProgressiveFluxLoader;
