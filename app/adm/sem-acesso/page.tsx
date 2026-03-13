"use client";

import { useRouter } from "next/navigation";
import { PageHeader, Card } from "@/app/components/ui";

function SecondaryActionButton({
  children,
  onClick,
}: {
  children: React.ReactNode;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex h-11 items-center justify-center rounded-[18px] px-4 text-sm font-semibold transition border border-slate-200 bg-white text-slate-700 shadow-[0_6px_18px_rgba(15,23,42,0.05)] hover:bg-slate-50"
    >
      {children}
    </button>
  );
}

export default function AdmSemAcessoPage() {
  const router = useRouter();

  return (
    <div className="space-y-6">
      <PageHeader
        title="Sem acesso"
        subtitle="Seu usuário não tem permissão para acessar esta página."
        right={
          <div className="flex gap-2">
            <SecondaryActionButton onClick={() => router.push("/adm/dashboard")}>
              Ir para dashboard
            </SecondaryActionButton>
          </div>
        }
      />

      <Card>
        <div className="space-y-3">
          <div className="text-sm font-semibold text-slate-900">
            Acesso bloqueado
          </div>
          <div className="text-sm text-slate-600">
            Esta rota exige uma permissão que não está liberada para o seu usuário.
          </div>
        </div>
      </Card>
    </div>
  );
}