"use client";

import React from "react";

/* ----------------------------- utils ----------------------------- */

function cn(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

function safeOnChangeValue(
  onChange?: ((v: string) => void) | undefined,
  e?: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
) {
  if (!onChange || !e) return;
  onChange(e.target.value);
}

/* ----------------------------- PageHeader ----------------------------- */

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
      <div className="min-w-0">
        <div className="text-lg font-semibold text-slate-900">{title}</div>
        {subtitle ? <div className="mt-1 text-sm text-slate-600">{subtitle}</div> : null}
      </div>
      {right ? <div className="flex items-center justify-end gap-2">{right}</div> : null}
    </div>
  );
}

/* ----------------------------- Card ----------------------------- */

export function Card({
  title,
  children,
  className,
}: {
  title?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("rounded-2xl border border-slate-200 bg-white shadow-sm", className)}>
      {title ? (
        <div className="border-b border-slate-200 px-4 py-3 md:px-6">
          <div className="text-sm font-semibold text-slate-900">{title}</div>
        </div>
      ) : null}
      <div className={cn("p-4 md:p-6", title ? "" : "")}>{children}</div>
    </div>
  );
}

/* ----------------------------- Button ----------------------------- */

type ButtonVariant = "primary" | "secondary" | "danger" | "ghost";

export function Button({
  children,
  className,
  variant = "primary",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
}) {
  const base =
    "inline-flex items-center justify-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold shadow-sm transition disabled:opacity-50 disabled:cursor-not-allowed";

  const styles: Record<ButtonVariant, string> = {
    primary: "bg-slate-900 text-white hover:bg-slate-800",
    secondary: "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50",
    danger: "bg-red-600 text-white hover:bg-red-700",
    ghost: "bg-transparent text-slate-700 hover:bg-slate-100",
  };

  return (
    <button className={cn(base, styles[variant], className)} {...props}>
      {children}
    </button>
  );
}

/* ----------------------------- Badge ----------------------------- */

export type BadgeTone = "neutral" | "slate" | "blue" | "green" | "yellow" | "red";

export function Badge({
  children,
  tone = "neutral",
  className,
}: {
  children: React.ReactNode;
  tone?: BadgeTone;
  className?: string;
}) {
  const base = "inline-flex items-center rounded-xl px-2.5 py-1 text-xs font-semibold";

  const tones: Record<BadgeTone, string> = {
    neutral: "bg-slate-100 text-slate-700",
    slate: "bg-slate-100 text-slate-700",
    blue: "bg-blue-50 text-blue-700",
    green: "bg-green-50 text-green-700",
    yellow: "bg-amber-50 text-amber-800",
    red: "bg-red-50 text-red-700",
  };

  return <span className={cn(base, tones[tone], className)}>{children}</span>;
}

/* ----------------------------- Input ----------------------------- */
/**
 * Aceita props nativas (type, maxLength, inputMode, etc).
 * Se você passar onChange como (v:string)=>void, ele funciona.
 */
export function Input({
  label,
  value,
  onChange,
  className,
  ...rest
}: Omit<React.InputHTMLAttributes<HTMLInputElement>, "onChange" | "value"> & {
  label?: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="grid gap-1">
      {label ? <div className="text-xs font-semibold text-slate-600">{label}</div> : null}
      <input
        value={value}
        onChange={(e) => safeOnChangeValue(onChange, e)}
        className={cn(
          "h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none",
          className
        )}
        {...rest}
      />
    </div>
  );
}

/* ----------------------------- Select ----------------------------- */

export function Select({
  label,
  value,
  onChange,
  options,
  className,
  ...rest
}: Omit<React.SelectHTMLAttributes<HTMLSelectElement>, "onChange" | "value"> & {
  label?: string;
  value: string;
  onChange: (v: string) => void;
  options: Array<{ value: string; label: string }>;
}) {
  return (
    <div className="grid gap-1">
      {label ? <div className="text-xs font-semibold text-slate-600">{label}</div> : null}
      <select
        value={value}
        onChange={(e) => safeOnChangeValue(onChange, e)}
        className={cn(
          "h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none",
          className
        )}
        {...rest}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}

/* ----------------------------- DataTable ----------------------------- */

export function DataTable({
  headers,
  rows,
  onRowClick,
}: {
  headers: string[];
  rows: React.ReactNode[][];
  onRowClick?: (idx: number) => void;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-separate border-spacing-0">
        <thead>
          <tr className="text-left text-xs text-slate-600">
            {headers.map((h) => (
              <th
                key={h}
                className="whitespace-nowrap border-b border-slate-200 bg-slate-50 px-3 py-2"
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>

        <tbody>
          {rows.map((r, idx) => (
            <tr
              key={idx}
              className={cn(
                "hover:bg-slate-50",
                onRowClick ? "cursor-pointer" : ""
              )}
              onClick={onRowClick ? () => onRowClick(idx) : undefined}
            >
              {r.map((cell, cIdx) => (
                <td key={cIdx} className="whitespace-nowrap border-b border-slate-100 px-3 py-3">
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * ✅ Compatibilidade: permite importar "Table" sem quebrar build
 * Ex.: import { Table } from "@/app/components/ui";
 */
export const Table = DataTable;