import { useState } from "react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { engine, type EngineState } from "@/lib/engine/DetectionEngine";
import { YOLOAdapter, type YOLOConfig } from "@/lib/engine/YOLOAdapter";
import type { ExecutionProvider } from "@/lib/engine/types";

export interface AppSettings { markerSize: number; theme: "light" | "dark" }

interface Props {
  open: boolean; onOpenChange: (o: boolean) => void;
  settings: AppSettings; onSettings: (s: AppSettings) => void;
  engineState: EngineState; onEngineState: (s: EngineState) => void; conf: number;
}

const sel = "h-9 w-full rounded-md border bg-background px-2 text-sm";

export function SettingsDialog({ open, onOpenChange, settings, onSettings, engineState, onEngineState, conf }: Props) {
  const [file, setFile] = useState<File | null>(null);
  const [cfg, setCfg] = useState<Partial<YOLOConfig>>({ inputName: "images", numClasses: 1, iouThreshold: 0.45 });
  const [provider, setProvider] = useState<ExecutionProvider>("wasm");
  const gpu = typeof navigator !== "undefined" && "gpu" in navigator;

  const load = async () => {
    if (!file) return;
    const adapter = new YOLOAdapter({ ...cfg, confThreshold: Math.min(conf, 0.05), iouThreshold: cfg.iouThreshold ?? 0.45 } as YOLOConfig);
    const err = adapter.validateConfig();
    if (err) { toast.error(err); return; }
    onEngineState({ kind: "loading", name: file.name });
    try {
      await engine.load(await file.arrayBuffer(), file.name, adapter, provider);
      onEngineState(engine.state); toast.success("Modelo carregado");
    } catch (e) { onEngineState({ kind: "error", message: (e as Error).message }); toast.error(`Falha ao carregar: ${(e as Error).message}`); }
  };

  const num = (k: keyof YOLOConfig) => ({ value: (cfg[k] as number | undefined) ?? "", onChange: (e: React.ChangeEvent<HTMLInputElement>) => setCfg({ ...cfg, [k]: e.target.value === "" ? undefined : Number(e.target.value) }) });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader><DialogTitle>Configurações</DialogTitle><DialogDescription>Preferências de trabalho e modelo de detecção.</DialogDescription></DialogHeader>
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div><Label>Tema</Label>
            <select className={sel} value={settings.theme} onChange={(e) => onSettings({ ...settings, theme: e.target.value as AppSettings["theme"] })}><option value="light">Claro</option><option value="dark">Escuro</option></select></div>
          <div><Label>Tamanho da marcação por clique (px)</Label>
            <Input type="number" min={2} max={2000} value={settings.markerSize} onChange={(e) => onSettings({ ...settings, markerSize: Math.max(2, Number(e.target.value) || 24) })} /></div>
        </div>

        <div className="mt-2 space-y-3 rounded-md border p-3 text-sm">
          <div className="flex items-center justify-between"><p className="font-medium">Modelo YOLO11 (ONNX)</p>
            <span className="text-xs text-muted-foreground">{engineState.kind === "ready" ? `Ativo: ${engineState.name}` : engineState.kind === "loading" ? "Carregando…" : engineState.kind === "error" ? "Erro" : "Nenhum modelo"}</span></div>
          {engineState.kind === "error" && <p className="text-xs text-destructive">{engineState.message}</p>}
          <p className="text-xs text-muted-foreground">O modelo é carregado sob demanda, executado localmente no navegador e nunca enviado a servidores. Informe os parâmetros exatos da exportação — nenhum valor é presumido.</p>
          <div><Label>Arquivo .onnx</Label><Input type="file" accept=".onnx" onChange={(e) => setFile(e.target.files?.[0] ?? null)} /></div>
          <div className="grid grid-cols-2 gap-2">
            <div><Label>Largura de entrada</Label><Input type="number" placeholder="ex.: imgsz" {...num("inputWidth")} /></div>
            <div><Label>Altura de entrada</Label><Input type="number" placeholder="ex.: imgsz" {...num("inputHeight")} /></div>
            <div><Label>Nº de classes</Label><Input type="number" min={1} {...num("numClasses")} /></div>
            <div><Label>Limiar IoU (NMS)</Label><Input type="number" step={0.05} {...num("iouThreshold")} /></div>
            <div><Label>Nome do tensor de entrada</Label><Input value={cfg.inputName ?? ""} onChange={(e) => setCfg({ ...cfg, inputName: e.target.value })} /></div>
            <div><Label>Formato da saída</Label>
              <select className={sel} value={cfg.outputLayout ?? ""} onChange={(e) => setCfg({ ...cfg, outputLayout: (e.target.value || undefined) as YOLOConfig["outputLayout"] } as Partial<YOLOConfig>)}>
                <option value="">Selecionar…</option><option value="channels_first">[1, 4+nc, N]</option><option value="rows">[1, N, 4+nc]</option></select></div>
            <div><Label>Execução</Label>
              <select className={sel} value={provider} onChange={(e) => setProvider(e.target.value as ExecutionProvider)}>
                <option value="wasm">WebAssembly</option><option value="webgpu" disabled={!gpu}>WebGPU{gpu ? "" : " (indisponível)"}</option></select></div>
          </div>
          <div className="flex gap-2">
            <Button size="sm" disabled={!file || engineState.kind === "loading"} onClick={load}>Carregar modelo</Button>
            {engineState.kind === "ready" && <Button size="sm" variant="outline" onClick={async () => { await engine.unload(); onEngineState(engine.state); }}>Liberar modelo</Button>}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
