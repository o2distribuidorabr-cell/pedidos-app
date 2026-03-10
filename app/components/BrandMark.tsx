"use client";

type BrandMarkProps = {
  compact?: boolean;
  isAdmin?: boolean;
  mobileOnly?: boolean;
};

export default function BrandMark({
  compact = false,
  isAdmin = false,
  mobileOnly = false,
}: BrandMarkProps) {
  return (
    <div className="flex items-center gap-3">
      <div className="relative grid h-11 w-11 shrink-0 place-items-center rounded-[18px] bg-cyan-600 text-white shadow-[0_12px_28px_rgba(8,145,178,0.28)]">
        <span className="text-sm font-semibold tracking-tight">O2</span>
      </div>

      {!compact ? (
        <div className={mobileOnly ? "hidden sm:block leading-tight" : "leading-tight"}>
          <div className="text-sm font-semibold tracking-[-0.02em] text-slate-900">
            O2 Distribuidora
          </div>
          <div className="mt-0.5 text-xs text-slate-500">
            {isAdmin ? "Portal administrativo" : "Portal do cliente"}
          </div>
        </div>
      ) : null}
    </div>
  );
}