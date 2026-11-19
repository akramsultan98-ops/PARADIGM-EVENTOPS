import Image from "next/image";
import { BRAND } from "@/config/brand";
import { cn } from "@/lib/utils";

/** Approved Paradigm logo (white). Use only on navy/dark surfaces; proportions are locked. */
export function ParadigmLogo({ height = 56, className, priority }: { height?: number; className?: string; priority?: boolean }) {
  const width = Math.round(height * BRAND.logo.aspect);
  return <Image src={BRAND.logo.fullWhite} alt={BRAND.organization} width={width} height={height} priority={priority} className={cn("select-none object-contain", className)} style={{ width, height }} />;
}

export function ParadigmCrest({ height = 32, className }: { height?: number; className?: string }) {
  const width = Math.round(height * BRAND.logo.crestAspect);
  return <Image src={BRAND.logo.crestWhite} alt="Paradigm" width={width} height={height} loading="eager" unoptimized className={cn("select-none object-contain", className)} style={{ width, height }} />;
}

/** Product lockup: crest + product name, for the navigation shell */
export function ProductLockup({ collapsed }: { collapsed?: boolean }) {
  return (
    <div className="flex items-center gap-3">
      <ParadigmCrest height={34} />
      {!collapsed && (
        <div className="min-w-0 leading-tight">
          <div className="font-display text-[13px] font-bold tracking-[0.18em] text-white">PARADIGM</div>
          <div className="font-display text-[10px] font-semibold tracking-[0.32em] text-brand-cyan">EVENTOPS</div>
        </div>
      )}
    </div>
  );
}
