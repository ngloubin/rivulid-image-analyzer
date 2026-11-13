import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { toast } from "sonner";
import {
  Check,
  CircleHelp,
  Crosshair,
  Download,
  Eye,
  EyeOff,
  FileJson,
  FileSpreadsheet,
  FolderOpen,
  Hand,
  ImageDown,
  Maximize,
  Minus,
  Moon,
  Plus,
  ScanSearch,
  Settings,
  Sun,
  Trash2,
  Undo2,
  X,
  Cpu,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Viewer, type Tool, type ViewerHandle } from "./Viewer";
import { SettingsDialog } from "./SettingsDialog";
import type { AppSettings } from "./appSettings";
import { ignoreShortcut } from "./keyboard";
import { colorFor, STATUS_LABEL } from "./colors";
import { engine } from "@/lib/engine/DetectionEngine";
import type { Box, Detection, InferenceRecord, Progress } from "@/lib/engine/types";
import {
  download,
  planPNG,
  renderAnnotatedPNG,
  toCSV,
  toJSON,
  type ExportMeta,
} from "@/lib/annotations";
import { cn } from "@/lib/utils";

interface Photo {
  id: string;
  file: File;
  w: number;
  h: number;
  dets: Detection[];
  processingMs: number | null;
  model: string | null;
  runs: InferenceRecord[];
  history: Detection[][];
}
const EMPTY_DETECTIONS: Detection[] = [];
function IconBtn({
  label,
  onClick,
  children,
  active,
  disabled,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
  active?: boolean;
  disabled?: boolean;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          size="icon"
          variant={active ? "secondary" : "ghost"}
          className={cn("h-8 w-8", active && "ring-1 ring-primary")}
          onClick={onClick}
          disabled={disabled}
          aria-label={label}
          aria-pressed={active}
        >
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}
export function Workspace() {
  const [photos, setPhotos] = useState<Photo[]>([]),
    [currentId, setCurrentId] = useState<string | null>(null);
  const [url, setUrl] = useState<{ id: string; value: string } | null>(null),
    [selectedId, setSelectedId] = useState<string | null>(null);
  const [tool, setTool] = useState<Tool>("mark"),
    [showMarks, setShowMarks] = useState(true),
    [zoom, setZoom] = useState(1);
  const [dragOver, setDragOver] = useState(false),
    [settingsOpen, setSettingsOpen] = useState(false);
  const [settings, setSettings] = useState<AppSettings>({ markerSize: 24, theme: "light" }),
    [conf, setConf] = useState(0.25);
  const [busy, setBusy] = useState(false),
    [progress, setProgress] = useState<Progress | null>(null);
  const [manualClass, setManualClass] = useState(0);
  const engineState = useSyncExternalStore(
    engine.subscribe,
    engine.getSnapshot,
    engine.getServerSnapshot,
  );
  const viewer = useRef<ViewerHandle>(null),
    fileInput = useRef<HTMLInputElement>(null);
  const analysis = useRef<{ photoId: string; controller: AbortController } | null>(null),
    importing = useRef(false);
  const cur = photos.find((p) => p.id === currentId) ?? null,
    dets = cur?.dets ?? EMPTY_DETECTIONS;
  const modelReady = engineState.kind === "ready";
  const floor =
    cur?.runs.at(-1)?.config.inference.candidateThreshold ??
    (engineState.kind === "ready" ? engineState.config.inference.candidateThreshold : 0.05);
  const threshold = Math.max(conf, floor),
    visible = engine.visibleDetections(dets, threshold);
  const visibleIds = new Set(visible.map((d) => d.id)),
    numbered = engine.numberDetections(dets);
  const numbers = Object.fromEntries(numbered.map(({ d, index }) => [d.id, index]));
  const c = engine.counts(dets, threshold),
    history = cur?.history ?? [];
  const classes = engineState.kind === "ready" ? engineState.config.classes : ["ovo"];
  const classId = Math.min(manualClass, classes.length - 1);
  useEffect(() => {
    void engine.restore().catch((error) => toast.error((error as Error).message));
    return () => analysis.current?.controller.abort();
  }, []);
  useEffect(() => {
    try {
      const theme = localStorage.getItem("rivu-theme"),
        marker = Number(localStorage.getItem("rivu-marker"));
      setSettings((s) => ({
        ...s,
        ...(theme === "dark" || theme === "light" ? { theme } : {}),
        ...(marker >= 2 && marker <= 2000 ? { markerSize: marker } : {}),
      }));
    } catch {
      /* Preferences remain usable when browser storage is disabled. */
    }
  }, []);
  useEffect(() => {
    document.documentElement.classList.toggle("dark", settings.theme === "dark");
    try {
      localStorage.setItem("rivu-theme", settings.theme);
      localStorage.setItem("rivu-marker", String(settings.markerSize));
    } catch {
      /* Optional preferences. */
    }
  }, [settings]);
  const curId = cur?.id,
    curFile = cur?.file;
  useEffect(() => {
    setSelectedId(null);
    if (!curId || !curFile) {
      setUrl(null);
      return;
    }
    const value = engine.createObjectURL(curFile);
    setUrl({ id: curId, value });
    return () => engine.revokeObjectURL(value);
  }, [curId, curFile]);
  useEffect(() => {
    if (selectedId && !visible.some((d) => d.id === selectedId)) setSelectedId(null);
  }, [selectedId, visible]);
  const addFiles = useCallback(async (files: FileList | File[]) => {
    if (importing.current) {
      toast.info("Aguarde a abertura das fotografias anteriores.");
      return;
    }
    importing.current = true;
    const added: Photo[] = [];
    try {
      for (const file of Array.from(files)) {
        const error = engine.validateImageFile(file);
        if (error) {
          toast.error(error);
          continue;
        }
        try {
          const { width: w, height: h } = await engine.imageInfo(file);
          added.push({
            id: crypto.randomUUID(),
            file,
            w,
            h,
            dets: [],
            processingMs: null,
            model: null,
            runs: [],
            history: [],
          });
        } catch {
          toast.error("Não foi possível abrir " + file.name);
        }
      }
      if (added.length) {
        setPhotos((ps) => [...ps, ...added]);
        setCurrentId(added[0]!.id);
      }
    } finally {
      importing.current = false;
    }
  }, []);
  function setDets(fn: (previous: Detection[]) => Detection[]) {
    if (!cur) return;
    const id = cur.id;
    setPhotos((ps) =>
      ps.map((p) =>
        p.id === id ? { ...p, dets: fn(p.dets), history: [...p.history.slice(-49), p.dets] } : p,
      ),
    );
  }
  function onCreate(box: Box) {
    const detection: Detection = {
      ...box,
      id: crypto.randomUUID(),
      source: "manual",
      status: "confirmed",
      label: classes[classId]!,
      classId,
    };
    setDets((ds) => [...ds, detection]);
    setSelectedId(detection.id);
  }
  const onUpdate = (id: string, box: Box) =>
    setDets((ds) =>
      ds.map((d) =>
        d.id === id ? { ...d, ...box, status: d.source === "auto" ? "edited" : d.status } : d,
      ),
    );
  const setStatus = (id: string, status: Detection["status"]) =>
    setDets((ds) => ds.map((d) => (d.id === id ? { ...d, status } : d)));
  function remove(id: string) {
    setDets((ds) => ds.filter((d) => d.id !== id));
    if (id === selectedId) setSelectedId(null);
  }
  function undo() {
    if (!cur) return;
    setPhotos((ps) =>
      ps.map((p) =>
        p.id === cur.id && p.history.length
          ? { ...p, dets: p.history.at(-1)!, history: p.history.slice(0, -1) }
          : p,
      ),
    );
  }
  function closePhoto(id: string) {
    if (analysis.current?.photoId === id) analysis.current.controller.abort();
    setPhotos((ps) => ps.filter((p) => p.id !== id));
    if (currentId === id) setCurrentId(photos.find((p) => p.id !== id)?.id ?? null);
  }
  async function analyze() {
    if (!cur || !engine.isReady() || analysis.current) return;
    const replacing = cur.dets.filter((d) => d.source === "auto" && d.status === "pending").length;
    if (
      replacing &&
      !window.confirm(
        `Reanalisar substituirá ${replacing} candidata(s) ainda pendente(s). Marcações manuais, confirmações, edições e rejeições serão preservadas. Continuar?`,
      )
    )
      return;
    const photoId = cur.id,
      controller = new AbortController();
    analysis.current = { photoId, controller };
    setBusy(true);
    setProgress(null);
    try {
      const { detections, ms, record } = await engine.detect(cur.file, {
        signal: controller.signal,
        onProgress: setProgress,
      });
      if (controller.signal.aborted) throw new DOMException("Análise cancelada.", "AbortError");
      setPhotos((ps) =>
        ps.map((p) =>
          p.id === photoId
            ? {
                ...p,
                dets: engine.mergeReanalysis(
                  p.dets,
                  detections,
                  record.config.inference.reviewMergeIou,
                ),
                history: [...p.history.slice(-49), p.dets],
                processingMs: ms,
                model: record.modelName,
                runs: [...p.runs, record],
              }
            : p,
        ),
      );
      toast.success(
        `${detections.length} candidata(s) em ${record.windows} janela(s). Revise para incluir na contagem final.`,
      );
    } catch (error) {
      if ((error as Error).name === "AbortError")
        toast.info("Análise cancelada; anotações preservadas.");
      else toast.error((error as Error).message);
    } finally {
      analysis.current = null;
      setBusy(false);
      setProgress(null);
    }
  }
  const meta = (): ExportMeta => ({
    fileName: cur!.file.name,
    width: cur!.w,
    height: cur!.h,
    model: cur!.model,
    processingMs: cur!.processingMs,
    displayThreshold: threshold,
    runs: cur!.runs,
  });
  const base = () => cur!.file.name.replace(/\.[^.]+$/, "");
  const exportJSON = () =>
    download(
      new Blob([toJSON(dets, meta())], { type: "application/json" }),
      base() + "_anotacoes.json",
    );
  const exportCSV = () =>
    download(
      new Blob([toCSV(dets, meta())], { type: "text/csv;charset=utf-8" }),
      base() + "_deteccoes.csv",
    );
  async function exportPNG() {
    if (!cur) return;
    const plan = planPNG(cur.w, cur.h),
      reduced = plan.scale < 1;
    if (
      reduced &&
      !window.confirm(
        `A foto é grande para PNG neste navegador. Exportar uma cópia anotada de ${plan.width}×${plan.height}px? JSON e CSV mantêm as coordenadas originais.`,
      )
    )
      return;
    try {
      download(
        await renderAnnotatedPNG(cur.file, dets, {
          confidenceThreshold: threshold,
          allowDownscale: reduced,
        }),
        base() + (reduced ? "_anotada_reduzida.png" : "_anotada.png"),
      );
    } catch (error) {
      toast.error((error as Error).message);
    }
  }
  async function exportParity() {
    if (!cur || !modelReady || analysis.current) return;
    const controller = new AbortController();
    analysis.current = { photoId: cur.id, controller };
    setBusy(true);
    try {
      const blob = await engine.inspect(cur.file, controller.signal);
      if (!controller.signal.aborted) download(blob, base() + "_paridade.json");
    } catch (error) {
      if ((error as Error).name !== "AbortError") toast.error((error as Error).message);
    } finally {
      analysis.current = null;
      setBusy(false);
    }
  }
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (
        e.target instanceof Element &&
        e.target.closest('input,textarea,select,[contenteditable="true"],[role="dialog"]')
      )
        return;
      const key = e.key.toLowerCase();
      if ((e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey && key === "z") {
        e.preventDefault();
        undo();
        return;
      }
      if (ignoreShortcut(e)) return;
      if (key === "delete" || key === "backspace") {
        if (selectedId) {
          e.preventDefault();
          remove(selectedId);
        }
      } else if (key === "m") setTool("mark");
      else if (key === "v") setTool("pan");
      else if (key === "h") setShowMarks((s) => !s);
      else if (key === "f") viewer.current?.fit();
      else if (key === "+" || key === "=") viewer.current?.zoomBy(1.25);
      else if (key === "-") viewer.current?.zoomBy(0.8);
      else if (key === "escape") setSelectedId(null);
      else if (key === "c" && selectedId) setStatus(selectedId, "confirmed");
      else if (key === "r" && selectedId) setStatus(selectedId, "rejected");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });
  return (
    <TooltipProvider delayDuration={300}>
      <div className="flex h-dvh flex-col bg-background text-foreground">
        <header className="flex h-11 shrink-0 items-center gap-2 border-b bg-card px-2 sm:px-3">
          <div className="flex items-center gap-2 pr-2">
            <div className="grid h-6 w-6 place-items-center rounded bg-primary text-[11px] font-bold text-primary-foreground">
              R
            </div>
            <span className="hidden text-sm font-semibold tracking-tight sm:inline">
              Rivulídeos AI
            </span>
          </div>
          <Button
            size="sm"
            variant="outline"
            className="h-8"
            onClick={() => fileInput.current?.click()}
          >
            <FolderOpen className="h-4 w-4" />
            <span className="hidden sm:inline">Abrir foto</span>
          </Button>
          <input
            aria-label="Abrir fotografias"
            ref={fileInput}
            type="file"
            accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"
            multiple
            className="hidden"
            onChange={(e) => {
              if (e.target.files) void addFiles(e.target.files);
              e.target.value = "";
            }}
          />
          <div className="ml-auto flex items-center gap-1">
            <button
              onClick={() => setSettingsOpen(true)}
              className="flex items-center gap-1.5 rounded border px-2 py-1 text-xs text-muted-foreground hover:bg-accent"
            >
              <span
                className={cn(
                  "h-2 w-2 rounded-full",
                  modelReady
                    ? "bg-status-ok"
                    : engineState.kind === "error"
                      ? "bg-destructive"
                      : engineState.kind === "loading"
                        ? "animate-pulse bg-status-warn"
                        : "bg-muted-foreground/50",
                )}
              />
              <Cpu className="h-3.5 w-3.5" />
              <span className="hidden md:inline">
                {engineState.kind === "ready"
                  ? engineState.name + " · " + engineState.provider.toUpperCase()
                  : engineState.kind === "loading"
                    ? "Carregando modelo…"
                    : engineState.kind === "error"
                      ? "Erro no modelo"
                      : "Modelo não carregado"}
              </span>
            </button>
            <IconBtn
              label={settings.theme === "dark" ? "Tema claro" : "Tema escuro"}
              onClick={() =>
                setSettings((s) => ({ ...s, theme: s.theme === "dark" ? "light" : "dark" }))
              }
            >
              {settings.theme === "dark" ? (
                <Sun className="h-4 w-4" />
              ) : (
                <Moon className="h-4 w-4" />
              )}
            </IconBtn>
            <IconBtn label="Configurações" onClick={() => setSettingsOpen(true)}>
              <Settings className="h-4 w-4" />
            </IconBtn>
            <Popover>
              <PopoverTrigger asChild>
                <Button size="icon" variant="ghost" className="h-8 w-8" aria-label="Ajuda">
                  <CircleHelp className="h-4 w-4" />
                </Button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-80 text-xs leading-relaxed">
                <p className="mb-2 font-semibold">Atalhos e gestos</p>
                <p>
                  M: marcar · V: mover · Alt+arraste: mover · F: ajustar · +/−: zoom · H: ocultar
                  marcações · C/R: confirmar/rejeitar · Del: remover · Ctrl/Cmd+Z: desfazer.
                </p>
                <p className="mt-2">
                  No celular, use dois dedos para ampliar e mover. Um toque marca; um arraste
                  desenha uma caixa.
                </p>
                <p className="mt-2 text-muted-foreground">
                  Contagem final = manuais + automáticas confirmadas/editadas. Pendentes não entram.
                  Os números identificam as anotações e podem ter lacunas após filtros/rejeições.
                  JSON/CSV incluem todas as candidatas para auditoria; o PNG mostra as visíveis sem
                  rejeitadas.
                </p>
                <p className="mt-2 text-muted-foreground">
                  Fotografias processadas apenas no navegador. Coordenadas em pixels da imagem
                  original.
                </p>
              </PopoverContent>
            </Popover>
          </div>
        </header>
        <div className="flex min-h-0 flex-1 flex-col md:flex-row">
          <main
            className="relative flex min-h-[55vh] flex-1 flex-col md:min-h-0"
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(false);
              if (e.dataTransfer.files.length) void addFiles(e.dataTransfer.files);
            }}
          >
            <div className="flex h-10 shrink-0 items-center gap-1 overflow-x-auto border-b bg-card px-2">
              <IconBtn
                label="Marcar ovo (M)"
                active={tool === "mark"}
                onClick={() => setTool("mark")}
              >
                <Crosshair className="h-4 w-4" />
              </IconBtn>
              <IconBtn
                label="Mover imagem (V)"
                active={tool === "pan"}
                onClick={() => setTool("pan")}
              >
                <Hand className="h-4 w-4" />
              </IconBtn>
              <div className="mx-1 h-5 w-px bg-border" />
              <IconBtn
                label="Remover marcação (Del)"
                disabled={!selectedId}
                onClick={() => selectedId && remove(selectedId)}
              >
                <Trash2 className="h-4 w-4" />
              </IconBtn>
              <IconBtn label="Desfazer (Ctrl+Z)" disabled={!history.length} onClick={undo}>
                <Undo2 className="h-4 w-4" />
              </IconBtn>
              <IconBtn
                label={showMarks ? "Ocultar marcações (H)" : "Mostrar marcações (H)"}
                onClick={() => setShowMarks((s) => !s)}
              >
                {showMarks ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
              </IconBtn>
              <div className="mx-1 h-5 w-px bg-border" />
              <IconBtn
                label="Reduzir zoom (−)"
                disabled={!cur}
                onClick={() => viewer.current?.zoomBy(0.8)}
              >
                <Minus className="h-4 w-4" />
              </IconBtn>
              <button
                className="w-14 rounded px-1 py-1 text-center font-mono text-xs text-muted-foreground"
                disabled={!cur}
                onClick={() => viewer.current?.zoom100()}
                title="Zoom 100%"
              >
                {(zoom * 100).toFixed(0)}%
              </button>
              <IconBtn
                label="Ampliar zoom (+)"
                disabled={!cur}
                onClick={() => viewer.current?.zoomBy(1.25)}
              >
                <Plus className="h-4 w-4" />
              </IconBtn>
              <IconBtn
                label="Ajustar à tela (F)"
                disabled={!cur}
                onClick={() => viewer.current?.fit()}
              >
                <Maximize className="h-4 w-4" />
              </IconBtn>
              {cur && (
                <span className="ml-auto hidden truncate pl-2 font-mono text-xs text-muted-foreground lg:inline">
                  {cur.file.name} · {cur.w}×{cur.h}px
                </span>
              )}
            </div>
            <div className="relative min-h-0 flex-1">
              {cur && url?.id === cur.id ? (
                <Viewer
                  key={cur.id}
                  ref={viewer}
                  src={url.value}
                  imgW={cur.w}
                  imgH={cur.h}
                  detections={visible}
                  numbers={numbers}
                  selectedId={selectedId}
                  tool={tool}
                  showMarks={showMarks}
                  markerSize={settings.markerSize}
                  onSelect={setSelectedId}
                  onCreate={onCreate}
                  onUpdate={onUpdate}
                  onZoomChange={setZoom}
                />
              ) : (
                <button
                  onClick={() => fileInput.current?.click()}
                  className="absolute inset-3 grid place-items-center rounded-md border-2 border-dashed bg-viewer text-center text-muted-foreground hover:border-primary"
                >
                  <div>
                    <ImageDown className="mx-auto mb-2 h-8 w-8" />
                    <p className="text-sm font-medium text-foreground">
                      Arraste fotografias aqui ou clique para abrir
                    </p>
                    <p className="mt-1 text-xs">
                      JPG, PNG ou WebP · resolução original · processamento local
                    </p>
                  </div>
                </button>
              )}
              {dragOver && (
                <div className="pointer-events-none absolute inset-0 grid place-items-center border-2 border-primary bg-primary/10 text-sm text-primary">
                  Soltar para abrir
                </div>
              )}
            </div>
            {photos.length > 0 && (
              <div className="flex h-9 shrink-0 items-center gap-1 overflow-x-auto border-t bg-card px-2">
                {photos.map((p) => (
                  <div
                    key={p.id}
                    className={cn(
                      "flex shrink-0 items-center rounded border text-xs",
                      p.id === currentId && "border-primary bg-accent",
                    )}
                  >
                    <button
                      className="max-w-40 truncate px-2 py-1"
                      onClick={() => setCurrentId(p.id)}
                      title={p.file.name}
                    >
                      {p.file.name}{" "}
                      <span className="font-mono text-muted-foreground">
                        ({engine.counts(p.dets).total})
                      </span>
                    </button>
                    <button
                      className="px-1 text-muted-foreground hover:text-destructive"
                      aria-label={"Fechar " + p.file.name}
                      onClick={() => closePhoto(p.id)}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </main>
          <aside className="flex w-full shrink-0 flex-col overflow-y-auto border-t bg-card md:w-80 md:border-l md:border-t-0">
            <section className="border-b p-3">
              <div className="grid grid-cols-3 gap-2 text-center">
                {[
                  ["Total final", c.total],
                  ["Automáticas finais", c.auto],
                  ["Manuais", c.manual],
                  ["Confirmadas IA", c.confirmed],
                  ["Editadas IA", c.edited],
                  ["Rejeitadas", c.rejected],
                ].map(([key, value]) => (
                  <div key={key} className="rounded border bg-background px-1 py-1.5">
                    <div className="font-mono text-lg font-semibold tabular-nums leading-none">
                      {cur ? value : "—"}
                    </div>
                    <div className="mt-1 text-[10px] uppercase tracking-wide text-muted-foreground">
                      {key}
                    </div>
                  </div>
                ))}
              </div>
              <p className="mt-2 text-xs text-muted-foreground" aria-live="polite">
                Pendentes: {c.pending} · visíveis: {c.visiblePending} · abaixo do filtro:{" "}
                {c.hiddenPending}
              </p>
              <p className="mt-1 text-[11px] text-muted-foreground">
                Somente manuais e automáticas confirmadas/editadas entram no total final.
              </p>
            </section>
            <section className="space-y-2 border-b p-3 text-xs">
              <div className="flex justify-between gap-2">
                <span className="text-muted-foreground">Modelo desta análise</span>
                <span className="truncate font-mono">{cur?.model ?? "nenhum"}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Estado</span>
                <span>
                  {busy
                    ? "Analisando…"
                    : !cur
                      ? "Sem fotografia"
                      : cur.processingMs !== null
                        ? "Aguardando revisão"
                        : dets.length
                          ? "Revisão manual"
                          : "Aguardando"}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Tempo</span>
                <span className="font-mono">
                  {cur?.processingMs != null ? cur.processingMs.toFixed(0) + " ms" : "—"}
                </span>
              </div>
              {classes.length > 1 && (
                <label className="block">
                  Classe da marcação manual
                  <select
                    className="mt-1 w-full rounded border bg-background p-1"
                    value={classId}
                    onChange={(e) => setManualClass(Number(e.target.value))}
                  >
                    {classes.map((name, index) => (
                      <option key={name} value={index}>
                        {name}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              <div>
                <div className="mb-1 flex justify-between">
                  <span className="text-muted-foreground">Filtro de confiança (pendentes)</span>
                  <span className="font-mono">{threshold.toFixed(2)}</span>
                </div>
                <Slider
                  aria-label="Filtro de confiança"
                  disabled={!cur}
                  min={floor}
                  max={1}
                  step={0.01}
                  value={[threshold]}
                  onValueChange={([value]) => value !== undefined && setConf(value)}
                />
                <p className="mt-1 text-[11px] text-muted-foreground">
                  Alterar o filtro não reanalisa nem apaga candidatas. Piso salvo:{" "}
                  {floor.toFixed(2)}.
                </p>
              </div>
              {!modelReady && (
                <Button
                  className="w-full"
                  size="sm"
                  variant="outline"
                  disabled={busy || engineState.kind === "loading"}
                  onClick={() => setSettingsOpen(true)}
                >
                  {engineState.kind === "loading"
                    ? "Carregando modelo…"
                    : "Ativar detecção automática"}
                </Button>
              )}
              <Button
                className="w-full"
                size="sm"
                disabled={!cur || !modelReady || busy}
                onClick={analyze}
              >
                <ScanSearch className="h-4 w-4" />
                {busy ? "Analisando…" : cur?.runs.length ? "Reanalisar imagem" : "Analisar imagem"}
              </Button>
              {busy && (
                <div className="space-y-1">
                  <p role="status">
                    {progress
                      ? progress.stage === "merging"
                        ? "Mesclando candidatas…"
                        : `Janelas: ${progress.completed}/${progress.total}`
                      : "Preparando imagem…"}
                  </p>
                  <progress
                    className="h-2 w-full"
                    max={progress?.total ?? 1}
                    value={progress?.completed ?? 0}
                  />
                  <Button
                    className="w-full"
                    size="sm"
                    variant="outline"
                    onClick={() => analysis.current?.controller.abort()}
                  >
                    Cancelar análise
                  </Button>
                  <p className="text-[11px] text-muted-foreground">
                    O cancelamento termina a janela atual e preserva suas anotações.
                  </p>
                </div>
              )}
              {!modelReady && (
                <p className="rounded border border-dashed p-2 text-[11px] text-muted-foreground">
                  Detecção automática indisponível. Marcação manual, revisão e exportação continuam
                  disponíveis.{" "}
                  <button className="underline" onClick={() => setSettingsOpen(true)}>
                    Configurar modelo
                  </button>
                </p>
              )}
            </section>
            <section className="flex min-h-40 flex-1 flex-col md:min-h-0">
              <div className="flex justify-between px-3 pb-1 pt-2 text-xs font-medium">
                <span>Detecções visíveis</span>
                <span className="font-mono text-muted-foreground">
                  {visible.length}/{dets.length}
                </span>
              </div>
              <ol className="max-h-72 flex-1 overflow-y-auto px-1 pb-2 md:max-h-none">
                {!visible.length && (
                  <li className="px-2 py-3 text-xs text-muted-foreground">
                    {dets.length
                      ? "Reduza o filtro para ver mais candidatas."
                      : cur
                        ? "Clique ou arraste na fotografia para marcar um ovo."
                        : "Abra uma fotografia para começar."}
                  </li>
                )}
                {numbered
                  .filter(({ d }) => visibleIds.has(d.id))
                  .map(({ d, index }) => (
                    <li
                      key={d.id}
                      onClick={() => setSelectedId(d.id)}
                      className={cn(
                        "group flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-xs hover:bg-accent",
                        d.id === selectedId && "bg-accent ring-1 ring-primary",
                      )}
                    >
                      <span
                        className="h-2.5 w-2.5 shrink-0 rounded-sm"
                        style={{ background: colorFor(d) }}
                      />
                      <span className="w-6 font-mono text-muted-foreground">{index}</span>
                      <span className="flex-1 truncate" title={d.label}>
                        {d.label} · {Math.round(d.x)},{Math.round(d.y)}
                      </span>
                      <span className="text-[10px] text-muted-foreground">
                        {d.source === "auto" ? (d.confidence ?? 0).toFixed(2) : "man."} ·{" "}
                        {STATUS_LABEL[d.status]}
                      </span>
                      <button
                        aria-label={"Confirmar " + index}
                        className="text-muted-foreground hover:text-status-ok"
                        onClick={(e) => {
                          e.stopPropagation();
                          setStatus(d.id, "confirmed");
                        }}
                      >
                        <Check className="h-3.5 w-3.5" />
                      </button>
                      <button
                        aria-label={"Rejeitar " + index}
                        className="text-muted-foreground hover:text-status-warn"
                        onClick={(e) => {
                          e.stopPropagation();
                          setStatus(
                            d.id,
                            d.status === "rejected"
                              ? d.source === "manual"
                                ? "confirmed"
                                : "pending"
                              : "rejected",
                          );
                        }}
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                      <button
                        aria-label={"Remover " + index}
                        className="text-muted-foreground hover:text-destructive"
                        onClick={(e) => {
                          e.stopPropagation();
                          remove(d.id);
                        }}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </li>
                  ))}
              </ol>
            </section>
            <details className="border-t p-3 text-xs">
              <summary className="cursor-pointer">Validação técnica</summary>
              <p className="my-2 text-muted-foreground">
                Exporta o tensor de entrada e as saídas ONNX de uma passada para comparar com
                Python/OpenCV. Não mede o protocolo de janelas.
              </p>
              <Button
                size="sm"
                variant="outline"
                disabled={!cur || !modelReady || busy}
                onClick={exportParity}
              >
                Exportar diagnóstico de paridade
              </Button>
            </details>
            <section
              aria-label="Exportar anotações"
              className="grid shrink-0 grid-cols-3 gap-1 border-t p-2"
              style={{ paddingBottom: "calc(4.5rem + env(safe-area-inset-bottom, 0px))" }}
            >
              <Button size="sm" variant="outline" disabled={!cur} onClick={exportPNG}>
                <Download className="h-3.5 w-3.5" />
                PNG
              </Button>
              <Button size="sm" variant="outline" disabled={!cur} onClick={exportJSON}>
                <FileJson className="h-3.5 w-3.5" />
                JSON
              </Button>
              <Button size="sm" variant="outline" disabled={!cur} onClick={exportCSV}>
                <FileSpreadsheet className="h-3.5 w-3.5" />
                CSV
              </Button>
            </section>
          </aside>
        </div>
        <SettingsDialog
          open={settingsOpen}
          onOpenChange={setSettingsOpen}
          settings={settings}
          onSettings={setSettings}
          engineState={engineState}
          busy={busy}
        />
      </div>
    </TooltipProvider>
  );
}
