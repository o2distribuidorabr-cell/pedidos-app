"use client";

import { useRouter } from "next/navigation";
import FiscalRuleFormPage from "../_components/FiscalRuleFormPage";

export default function AdmNovaRegraFiscalPage() {
  const router = useRouter();

  return (
    <FiscalRuleFormPage
      mode="create"
      ruleId={null}
      onSaved={(id) => router.push(`/adm/regras-fiscais/${id}`)}
    />
  );
}