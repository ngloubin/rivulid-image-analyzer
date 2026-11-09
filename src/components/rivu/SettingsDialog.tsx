import { useState } from "react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { engine, type EngineState } from "@/lib/engine/DetectionEngine";
import type { ExecutionProvider } from "@/lib/engine/types";
import type { AppSettings } from "./appSettings";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  settings: AppSettings;
  onSettings: (settings: AppSettings) => void;
  engineState: EngineState;
  busy: boolean;
}
const selectClass = "h-9 w-full rounded-md border bg-background px-2 text-sm";
export function SettingsDialog({
  open,
  onOpenChange,
  settings,
  onSettings,
  engineState,
  busy,
}: Props) {
  const [file, setFile] = useState<File | null>(null),
    [configFile, setConfigFile] = useState<File | null>(null);
  const [provider, setProvider] = useState<ExecutionProvider>("wasm");
  const [working, setWorking] = useState(false);
  const disabled = busy || working || engineState.kind === "loading";
  async function loadIncluded() {
    setWorking(true);
    try {
      await engine.loadBundled(provider);
      toast.success("Modelo incluído carregado.");
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setWorking(false);
    }
  }
  async function load() {
    if (!file || !configFile) return;
    setWorking(true);
    try {
      await engine.load(file, configFile, provider);
      toast.success("Modelo carregado e metadados validados.");
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setWorking(false);
    }
  }
  async function unload(forget: boolean) {
    setWorking(true);
    try {
      await engine.unload(forget);
      toast.success(
        forget
          ? "Modelo removido do navegador."
          : "Modelo liberado da memória; cópia local preservada.",
      );
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setWorking(false);
    }
  }
  async function restoreSaved() {
    setWorking(true);
    try {
      await engine.load();
      const state = engine.getSnapshot();
      if (state.kind === "error") toast.error(state.message);
      else if (state.kind === "none") toast.info("Nenhum modelo salvo neste navegador.");
      else toast.success("Modelo restaurado.");
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setWorking(false);
    }
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Configurações</DialogTitle>
          <DialogDescription>Preferências e modelo local de detecção.</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <Label htmlFor="theme">Tema</Label>
            <select
              id="theme"
              className={selectClass}
              value={settings.theme}
              onChange={(e) =>
                onSettings({ ...settings, theme: e.target.value as AppSettings["theme"] })
              }
            >
              <option value="light">Claro</option>
              <option value="dark">Escuro</option>
            </select>
          </div>
          <div>
            <Label htmlFor="marker">Marcação por clique (px)</Label>
            <Input
              id="marker"
              type="number"
              min={2}
              max={2000}
              value={settings.markerSize}
              onChange={(e) =>
                onSettings({
                  ...settings,
                  markerSize: Math.min(2000, Math.max(2, Number(e.target.value) || 24)),
                })
              }
            />
          </div>
        </div>
        <div className="space-y-3 rounded-md border p-3 text-sm">
          <p className="font-medium">Modelo incluído no site</p>
          <p className="text-xs text-muted-foreground">
            {engine.bundledModelName}. Download inicial de aproximadamente 17 MB, incluindo o
            runtime. Depois, o modelo fica salvo neste navegador. A análise usa o dispositivo.
          </p>
          <Button size="sm" disabled={disabled} onClick={loadIncluded}>
            Carregar modelo incluído
          </Button>
          <hr />
          <p className="font-medium">Modelo ONNX + configuração JSON</p>
          <p className="text-xs text-muted-foreground">
            O JSON descreve a arquitetura, as classes e o protocolo de análise. Os nomes e dimensões
            dos tensores são lidos do ONNX e conferidos. Modelo e configuração ficam neste
            navegador; as fotografias não são enviadas.
          </p>
          <div>
            <Label htmlFor="model-file">Arquivo .onnx</Label>
            <Input
              id="model-file"
              type="file"
              accept=".onnx"
              disabled={disabled}
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
          </div>
          <div>
            <Label htmlFor="model-config">Configuração .json</Label>
            <Input
              id="model-config"
              type="file"
              accept=".json,application/json"
              disabled={disabled}
              onChange={(e) => setConfigFile(e.target.files?.[0] ?? null)}
            />
          </div>
          <div>
            <Label htmlFor="provider">Execução preferida</Label>
            <select
              id="provider"
              className={selectClass}
              disabled={disabled}
              value={provider}
              onChange={(e) => setProvider(e.target.value as ExecutionProvider)}
            >
              <option value="wasm">WebAssembly (CPU)</option>
              <option
                value="webgpu"
                disabled={typeof navigator === "undefined" || !("gpu" in navigator)}
              >
                WebGPU, com alternativa em CPU
              </option>
            </select>
          </div>
          {engineState.kind === "loading" && <p role="status">Carregando {engineState.name}…</p>}
          {engineState.kind === "error" && (
            <p role="alert" className="text-xs text-destructive">
              {engineState.message}
            </p>
          )}
          {engineState.kind === "ready" && (
            <>
              <p className="text-xs">
                Ativo: {engineState.name} · v{engineState.config.version} ·{" "}
                {engineState.provider.toUpperCase()}
              </p>
              {engineState.fallbackReason && (
                <p className="text-xs text-muted-foreground">
                  WebGPU indisponível; a sessão foi aberta em WebAssembly.
                </p>
              )}
              {engineState.cacheWarning && (
                <p role="alert" className="text-xs text-destructive">
                  {engineState.cacheWarning}
                </p>
              )}
              <details className="text-xs">
                <summary className="cursor-pointer">Identificação e parâmetros do modelo</summary>
                <pre className="mt-2 overflow-auto whitespace-pre-wrap break-all">
                  {JSON.stringify(
                    {
                      sha256: engineState.hash,
                      input: engineState.config.input,
                      outputs: engineState.metadata.outputs,
                      classes: engineState.config.classes,
                      inference: engineState.config.inference,
                    },
                    null,
                    2,
                  )}
                </pre>
              </details>
            </>
          )}
          <div className="flex flex-wrap gap-2">
            <Button size="sm" disabled={!file || !configFile || disabled} onClick={load}>
              Carregar modelo
            </Button>
            {engineState.kind === "ready" && (
              <Button size="sm" variant="outline" disabled={disabled} onClick={() => unload(false)}>
                Liberar da memória
              </Button>
            )}
            {engineState.kind !== "ready" && (
              <Button size="sm" variant="outline" disabled={disabled} onClick={restoreSaved}>
                Restaurar modelo salvo
              </Button>
            )}
            <Button size="sm" variant="outline" disabled={disabled} onClick={() => unload(true)}>
              Remover modelo salvo
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
