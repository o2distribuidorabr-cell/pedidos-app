export default function BrandMark() {
  return (
    <div className="flex items-center gap-3">
      <div className="grid h-10 w-10 place-items-center rounded-2xl bg-blue-600 text-white shadow-sm">
        <span className="font-semibold">O2</span>
      </div>

      <div className="leading-tight">
        <div className="text-sm font-semibold text-blue-700">O2 Distribuidora</div>
        <div className="text-xs text-slate-500">Portal Admin</div>
      </div>
    </div>
  );
}