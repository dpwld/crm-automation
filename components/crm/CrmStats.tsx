"use client";

import { Building2, AlertTriangle, DollarSign } from "lucide-react";
import { StatCard } from "@/components/ds/data/StatCard";
import type { Company } from "@/types/domain";


export function CrmStats({ companies }: { companies: Company[] }) {
  const open = companies.filter((c) => c.stage !== "won" && c.stage !== "lost");
  const attention = companies.filter(
    (c) => c.importance === "high" && (c.stage === "in_review" || c.stage === "spec"),
  );
  const pipeline = companies
    .filter((c) => c.stage !== "lost")
    .reduce((sum, c) => sum + (c.value ?? 0), 0);

  return (
    <div className="crm-stats" style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 16, marginBottom: 12 }}>
      <StatCard label="Open companies" value={open.length} icon={<Building2 size={18} />} note="excludes won · lost" />
      <StatCard
        label="Needs attention"
        value={attention.length}
        icon={<AlertTriangle size={18} />}
        deltaDirection={attention.length ? "down" : "flat"}
        note="high · in review / spec"
      />
      <StatCard
        label="Pipeline value"
        value={"$" + Math.round(pipeline / 1000) + "K"}
        icon={<DollarSign size={18} />}
        note="sum, excludes lost"
      />
    </div>
  );
}
