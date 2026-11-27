import { annotationRows, renderAnnotatedPNG } from "@/lib/annotations";
import type { Detection } from "@/lib/engine/types";
import { STATUS_LABEL } from "./colors";

export interface ReportInput {
  fileName: string;
  width: number;
  height: number;
  model: string | null;
  threshold: number;
  counts: {
    total: number;
    auto: number;
    manual: number;
    confirmed: number;
    edited: number;
    rejected: number;
    pending: number;
  };
}

const esc = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]!,
  );

/** Opens a printable report; the browser's print dialog saves it as PDF. */
export async function openPrintableReport(
  win: Window,
  file: File,
  dets: Detection[],
  r: ReportInput,
) {
  const png = await renderAnnotatedPNG(file, dets, {
    confidenceThreshold: r.threshold,
    allowDownscale: true,
  });
  const img = await new Promise<string>((ok) => {
    const fr = new FileReader();
    fr.onload = () => ok(String(fr.result));
    fr.readAsDataURL(png);
  });
  const rows = annotationRows(dets, r.threshold)
    .filter((x) => x.visible || x.counted)
    .map(
      ({ d, index }) =>
        `<tr><td>${index}</td><td>${esc(d.label)}</td><td>${esc(STATUS_LABEL[d.status] ?? d.status)}</td><td>${d.source === "manual" ? "Manual" : "IA"}</td><td>${d.confidence != null ? (d.confidence * 100).toFixed(0) + "%" : "—"}</td><td>${Math.round(d.x)}, ${Math.round(d.y)}</td><td>${Math.round(d.w)}×${Math.round(d.h)}</td></tr>`,
    )
    .join("");
  const c = r.counts;
  const date = new Date().toLocaleString("pt-BR");
  win.document
    .write(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Relatório — ${esc(r.fileName)}</title>
<style>body{font-family:"IBM Plex Sans",Arial,sans-serif;color:#111;margin:24px}h1{font-size:20px;margin:0}small{color:#555}
.k{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin:16px 0}.k div{border:1px solid #ccc;border-radius:6px;padding:8px}.k b{display:block;font-size:22px}
img{max-width:100%;border:1px solid #ccc}table{width:100%;border-collapse:collapse;font-size:11px;margin-top:16px}td,th{border:1px solid #ddd;padding:3px 5px;text-align:left}
@media print{button{display:none}}</style></head><body>
<button onclick="print()" style="float:right;padding:8px 14px">Salvar como PDF</button>
<h1>Rivulídeos AI — Relatório de contagem</h1>
<small>${esc(r.fileName)} · ${r.width}×${r.height}px · Modelo: ${esc(r.model ?? "somente marcação manual")} · Gerado em ${esc(date)}</small>
<div class="k"><div><b>${c.total}</b>Ovos na contagem final</div><div><b>${c.auto}</b>Detectados pela IA e revisados</div><div><b>${c.manual}</b>Marcados manualmente</div><div><b>${c.pending}</b>Pendentes de revisão</div></div>
<img src="${img}" alt="Fotografia anotada">
<table><thead><tr><th>Nº</th><th>Classe</th><th>Status</th><th>Origem</th><th>Confiança</th><th>Posição (x, y)</th><th>Tamanho</th></tr></thead><tbody>${rows}</tbody></table>
<p><small>Rejeitadas: ${c.rejected}. Coordenadas em pixels da imagem original. Processamento feito no navegador; a foto não foi enviada a servidores.</small></p>
<script>window.onload=()=>setTimeout(()=>print(),300)</script></body></html>`);
  win.document.close();
}
