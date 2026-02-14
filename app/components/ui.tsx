import Link from "next/link";
import React from "react";

export function PageHeader({
  title,
  subtitle,
  right,
}: {
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
      <div>
        <h1 className="text-lg md:text-xl font-semibold text-slate-900">{title}</h1>
        {subtitle ? <p className="mt-1 text-sm text-slate-500">{subtitle}</p> : null}
      </div>
      {right ? <div className="flex items-center gap-2">{right}</div> : null}
    </div>
  );
}

export function Card({
  children,
  title,
  subtitle,
  right,
}: {
  children: React.ReactNode;
  title?: string;
  subtitle?: string;
  right?: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
      {title || subtitle || right ? (
        <div className="flex items-start justify-between gap-3 border-b border-slate-200 px-4 py-4 md:px-6">
          <div>
            {title ? <div className="text-sm font-semibold text-slate-900">{title}</div> : null}
            {subtitle ? <div className="mt-1 text-xs text-slate-500">{subtitle}</div> : null}
          </div>
          {right ? <div className="flex items-center gap-2">{right}</div> : null}
        </div>
      ) : null}
      <div className="p-4 md:p-6">{children}</div>
    </div>
  );
}

export function StatCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="text-xs font-semibold text-slate-500">{label}</div>
      <div className="mt-2 text-2xl font-semibold text-slate-900">{value}</div>
      {hint ? <div className="mt-1 text-xs text-slate-500">{hint}</div> : null}
    </div>
  );
}

export function Button({
  children,
  href,
  variant = "primary",
  type = "button",
  onClick,
  disabled,
}: {
  children: React.ReactNode;
  href?: string;
  variant?: "primary" | "secondary" | "ghost" | "danger";
  type?: "button" | "submit";
  onClick?: () => void;
  disabled?: boolean;
}) {
  const cls =
    variant === "primary"
      ? "bg-blue-600 text-white hover:bg-blue-700"
      : variant === "secondary"
      ? "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
      : variant === "danger"
      ? "bg-red-600 text-white hover:bg-red-700"
      : "text-slate-700 hover:bg-slate-100";

  const base =
    "inline-flex items-center justify-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold shadow-sm transition disabled:opacity-60 disabled:cursor-not-allowed";

  if (href) {
    return (
      <Link href={href} className={`${base} ${cls}`}>
        {children}
      </Link>
    );
  }

  return (
    <button type={type} onClick={onClick} disabled={disabled} className={`${base} ${cls}`}>
      {children}
    </button>
  );
}

export function Input({
  label,
  placeholder,
  value,
  onChange,
  type = "text",
}: {
  label?: string;
  placeholder?: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
}) {
  return (
    <label className="block">
      {label ? <div className="mb-1 text-xs font-semibold text-slate-600">{label}</div> : null}
      <input
        type={type}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-100"
      />
    </label>
  );
}

export function Select({
  label,
  value,
  onChange,
  options,
}: {
  label?: string;
  value: string;
  onChange: (v: string) => void;
  options?: { value: string; label: string }[]; // ✅ opcional
}) {
  const safeOptions = Array.isArray(options) ? options : []; // ✅ evita undefined.map

  return (
    <label className="block">
      {label ? <div className="mb-1 text-xs font-semibold text-slate-600">{label}</div> : null}
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-100"
      >
        {safeOptions.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

export function Badge({
  children,
  tone = "neutral",
}: {
  children: React.ReactNode;
  tone?: "neutral" | "blue" | "green" | "yellow" | "red";
}) {
  const cls =
    tone === "blue"
      ? "bg-blue-50 text-blue-700 border-blue-100"
      : tone === "green"
      ? "bg-green-50 text-green-700 border-green-100"
      : tone === "yellow"
      ? "bg-amber-50 text-amber-700 border-amber-100"
      : tone === "red"
      ? "bg-red-50 text-red-700 border-red-100"
      : "bg-slate-50 text-slate-700 border-slate-200";

  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold ${cls}`}>
      {children}
    </span>
  );
}

export function Table({ headers, rows }: { headers: string[]; rows: React.ReactNode[][] }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200">
      <table className="w-full text-left text-sm">
        <thead className="bg-slate-50">
          <tr>
            {headers.map((h) => (
              <th key={h} className="px-4 py-3 text-xs font-semibold text-slate-600">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="bg-white">
          {rows.length === 0 ? (
            <tr>
              <td colSpan={headers.length} className="px-4 py-8 text-center text-sm text-slate-500">
                Sem dados.
              </td>
            </tr>
          ) : (
            rows.map((r, idx) => (
              <tr key={idx} className="border-t border-slate-200">
                {r.map((cell, cidx) => (
                  <td key={cidx} className="px-4 py-3 text-slate-900">
                    {cell}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}