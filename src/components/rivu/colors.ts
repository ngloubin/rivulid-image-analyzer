import type { Detection } from "@/lib/engine/types";
export function colorFor(d: Pick<Detection, "source" | "status">) {
  if (d.status === "rejected") return "var(--det-rejected)";
  if (d.status === "edited") return "var(--det-edited)";
  if (d.source === "manual") return "var(--det-manual)";
  return d.status === "confirmed" ? "var(--det-confirmed)" : "var(--det-pending)";
}
export const STATUS_LABEL: Record<Detection["status"], string> = {
  pending: "Pendente",
  confirmed: "Confirmada",
  edited: "Editada",
  rejected: "Rejeitada",
};
