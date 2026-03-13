"use client";

import { useParams, useRouter } from "next/navigation";
import FiscalRuleFormPage from "../_components/FiscalRuleFormPage";

export default function AdmEditarRegraFiscalPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();

  return (
    <FiscalRuleFormPage
      mode="edit"
      ruleId={params?.id || null}
      onSaved={(id) => router.push(`/adm/regras-fiscais/${id}`)}
    />
  );
}