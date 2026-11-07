import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
  Check, CircleHelp, Crosshair, Download, Eye, EyeOff, FileJson, FileSpreadsheet, FolderOpen, Hand, ImageDown,
  Maximize, Minus, Moon, Plus, ScanSearch, Settings, Sun, Trash2, Undo2, X, Cpu,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Viewer, type Tool, type ViewerHandle } from "./Viewer";
import { SettingsDialog, type AppSettings } from "./SettingsDialog";
import { colorFor, STATUS_LABEL } from "./colors";
import { validateImageFile } from "@/lib/engine/ImageProcessor";
import { ResourceManager } from "@/lib/engine/ResourceManager";
import { counts } from "@/lib/engine/ResultProcessor";
import { engine, type EngineState } from "@/lib/engine/DetectionEngine";
import type { Box, Detection } from "@/lib/engine/types";
import { download, renderAnnotatedPNG, toCSV, toJSON, type ExportMeta } from "@/lib/annotations";
import { cn } from "@/lib/utils";

interface Photo { id: string; file: File; w: number; h: number; dets: Detection[]; processingMs: number | null; model: string | null }

export function Workspace() {
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [tool, setTool] = useState<Tool>("mark");
  const [showMarks, setShowMarks] = useState(true);
  const [zoom, setZoom] = useState(1);
  const [dragOver, setDragOver] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settings, setSettings] = useState<AppSettings>({ markerSize: 24, theme: "light" });
  const [engineState, setEngineState] = useState<EngineState>({ kind: "none" });
  const [conf, setConf] = useState(0.25);
  const [busy, setBusy] = useState(false);
  const [history, setHistory] = useState<Detection[][]>([]);
  const viewer = useRef<ViewerHandle>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const cur = photos.find((p) => p.id === currentId) ?? null;
  const dets = cur?.dets ?? [];
  const c = counts(dets);

  // Theme (read stored preference after hydration).
  useEffect(() => {
    const t = localStorage.getItem("rivu-theme");
    if (t === "dark" || t === "light") setSettings((s) => ({ ...s, theme: t }));
    const m = Number(localStorage.getItem("rivu-marker"));
    if (m > 0) setSettings((s) => ({ ...s, markerSize: m }));
  }, []);
  useEffect(() => {
    document.documentElement.classList.toggle("dark", settings.theme === "dark");
    localStorage.setItem("rivu-theme", settings.theme);
    localStorage.setItem("rivu-marker", String(settings.markerSize));
  }, [settings]);

  // Only the current photo has a live object URL; revoke on switch.
  useEffect(() => {
    if (!cur) { setUrl(null); return; }
    const u = ResourceManager.createObjectURL(cur.file);
    setUrl(u); setSelectedId(null); setHistory([]);
    return () => ResourceManager.revokeObjectURL(u);
  }, [cur?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const addFiles = useCallback(async (files: FileList | File[]) => {
    let firstId: string | null = null;
    for (const f of Array.from(files)) {
      const err = validateImageFile(f);
      if (err) { toast.error(err); continue; }
      try {
        const bmp = await createImageBitmap(f, { imageOrientation: "from-image" } as ImageBitmapOptions);
        const p: Photo = { id: crypto.randomUUID(), file: f, w: bmp.width, h: bmp.height, dets: [], processingMs: null, model: null };
        bmp.close();
        setPhotos((ps) => [...ps, p]);
        firstId ??= p.id;
      } catch { toast.error(`Não foi possível decodificar ${f.name}`); }
    }
    if (firstId) setCurrentId(firstId);
  }, []);

  const setDets = (fn: (d: Detection[]) => Detection[], record = true) => {
    if (!cur) return;
    if (record) setHistory((h) => [...h.slice(-49), cur.dets]);
    setPhotos((ps) => ps.map((p) => (p.id === cur.id ? { ...p, dets: fn(p.dets) } : p)));
  };

  const onCreate = (b: Box) => {
    const d: Detection = { ...b, id: crypto.randomUUID(), source: "manual", status: "confirmed", label: "ovo" };
    setDets((ds) => [...ds, d]); setSelectedId(d.id);
  };
  const onUpdate = (id: string, b: Box) =>
    setDets((ds) => ds.map((d) => (d.id === id ? { ...d, ...b, status: d.source === "auto" ? "edited" : d.status } : d)));
  const setStatus = (id: string, status: Detection["status"]) => setDets((ds) => ds.map((d) => (d.id === id ? { ...d, status } : d)));
  const remove = (id: string) => { setDets((ds) => ds.filter((d) => d.id !== id)); if (selectedId === id) setSelectedId(null); };
  const undo = () => { const last = history.at(-1); if (!last || !cur) return; setHistory((h) => h.slice(0, -1)); setDets(() => last, false); };

  const closePhoto = (id: string) => {
    setPhotos((ps) => {
      const rest = ps.filter((p) => p.id !== id);
      if (currentId === id) setCurrentId(rest[0]?.id ?? null);
      return rest;
    });
  };

  const analyze = async () => {
    if (!cur || !engine.isReady()) return;
    setBusy(true);
    try {
      const { detections, ms } = await engine.detect(cur.file);
      const filtered = detections.filter((d) => (d.confidence ?? 0) >= conf);
      const name = engine.state.kind === "ready" ? engine.state.name : null;
      setHistory((h) => [...h, cur.dets]);
      setPhotos((ps) => ps.map((p) => (p.id === cur.id ? { ...p, dets: [...p.dets.filter((d) => d.source === "manual"), ...filtered], processingMs: ms, model: name } : p)));
      toast.success(`${filtered.length} detecção(ões) em ${ms.toFixed(0)} ms`);
    } catch (e) { toast.error((e as Error).message); } finally { setBusy(false); }
  };

  const meta = (): ExportMeta => ({ fileName: cur!.file.name, width: cur!.w, height: cur!.h, model: cur!.model, processingMs: cur!.processingMs });
  const base = () => cur!.file.name.replace(/\.[^.]+$/, "");
  const exportJSON = () => download(new Blob([toJSON(dets, meta())], { type: "application/json" }), `${base()}_anotacoes.json`);
  const exportCSV = () => download(new Blob([toCSV(dets, meta())], { type: "text/csv" }), `${base()}_deteccoes.csv`);
  const exportPNG = async () => {
    try { download(await renderAnnotatedPNG(cur!.file, dets), `${base()}_anotada.png`); } catch (e) { toast.error((e as Error).message); }
  };

  // Keyboard shortcuts
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest("input,textarea,select,[role=dialog]")) return;
      if ((e.ctrlKey || e.metaKey) && e.key === "z") { e.preventDefault(); undo(); return; }
      if (e.key === "Delete" || e.key === "Backspace") { if (selectedId) { e.preventDefault(); remove(selectedId); } }
      else if (e.key === "m") setTool("mark");
      else if (e.key === "v") setTool("pan");
      else if (e.key === "h") setShowMarks((s) => !s);
      else if (e.key === "f") viewer.current?.fit();
      else if (e.key === "+" || e.key === "=") viewer.current?.zoomBy(1.25);
      else if (e.key === "-") viewer.current?.zoomBy(0.8);
      else if (e.key === "Escape") setSelectedId(null);
      else if (e.key === "c" && selectedId) setStatus(selectedId, "confirmed");
      else if (e.key === "r" && selectedId) setStatus(selectedId, "rejected");
    };
    window.addEventListener("keydown", onKey); return () => window.removeEventListener("keydown", onKey);
  });

  const modelReady = engineState.kind === "ready";
  const IconBtn = ({ label, onClick, children, active, disabled }: { label: string; onClick: () => void; children: React.ReactNode; active?: boolean; disabled?: boolean }) => (
    <Tooltip><TooltipTrigger asChild>
      <Button size="icon" variant={active ? "secondary" : "ghost"} className={cn("h-8 w-8", active && "ring-1 ring-primary")} onClick={onClick} disabled={disabled} aria-label={label} aria-pressed={active}>{children}</Button>
    </TooltipTrigger><TooltipContent>{label}</TooltipContent></Tooltip>
  );

  return (
    <TooltipProvider delayDuration={300}>
      <div className="flex h-dvh flex-col bg-background text-foreground">
        {/* Top bar */}
        <header className="flex h-11 shrink-0 items-center gap-2 border-b bg-card px-2 sm:px-3">
          <div className="flex items-center gap-2 pr-2">
            <div className="grid h-6 w-6 place-items-center rounded bg-primary text-[11px] font-bold text-primary-foreground">R</div>
            <span className="hidden text-sm font-semibold tracking-tight sm:inline">Rivulídeos AI</span>
          </div>
          <Button size="sm" variant="outline" className="h-8" onClick={() => fileInput.current?.click()}>
            <FolderOpen className="h-4 w-4" /> <span className="hidden sm:inline">Abrir foto</span>
          </Button>
          <input ref={fileInput} type="file" accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp" multiple className="hidden"
            onChange={(e) => { if (e.target.files) addFiles(e.target.files); e.target.value = ""; }} />
          <div className="ml-auto flex items-center gap-1">
            <button onClick={() => setSettingsOpen(true)} className="flex items-center gap-1.5 rounded border px-2 py-1 text-xs text-muted-foreground hover:bg-accent">
              <span className={cn("h-2 w-2 rounded-full", modelReady ? "bg-status-ok" : engineState.kind === "error" ? "bg-destructive" : engineState.kind === "loading" ? "bg-status-warn animate-pulse" : "bg-muted-foreground/50")} />
              <Cpu className="h-3.5 w-3.5" />
              <span className="hidden md:inline">{modelReady ? `${engineState.name} · ${engineState.provider.toUpperCase()}` : engineState.kind === "loading" ? "Carregando modelo…" : engineState.kind === "error" ? "Erro no modelo" : "Modelo não carregado"}</span>
            </button>
            <IconBtn label={settings.theme === "dark" ? "Tema claro" : "Tema escuro"} onClick={() => setSettings((s) => ({ ...s, theme: s.theme === "dark" ? "light" : "dark" }))}>
              {settings.theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </IconBtn>
            <IconBtn label="Configurações" onClick={() => setSettingsOpen(true)}><Settings className="h-4 w-4" /></IconBtn>
            <Popover>
              <PopoverTrigger asChild><Button size="icon" variant="ghost" className="h-8 w-8" aria-label="Ajuda"><CircleHelp className="h-4 w-4" /></Button></PopoverTrigger>
              <PopoverContent align="end" className="w-80 text-xs leading-relaxed">
                <p className="mb-2 font-semibold">Atalhos</p>
                <ul className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 font-mono">
                  {[["M", "marcar ovo (clique = caixa padrão, arraste = caixa)"], ["V", "mover imagem"], ["Alt+arraste", "mover imagem em qualquer modo"], ["Roda", "zoom no cursor"], ["F", "ajustar à tela"], ["+ / −", "zoom"], ["H", "mostrar/ocultar marcações"], ["C / R", "confirmar / rejeitar seleção"], ["Del", "remover seleção"], ["Ctrl+Z", "desfazer"]].flatMap(([k, v]) => [
                    <span key={k} className="text-foreground">{k}</span>, <span key={k + "d"} className="font-sans text-muted-foreground">{v}</span>,
                  ])}
                </ul>
                <p className="mt-3 text-muted-foreground">Coordenadas exportadas em pixels da fotografia original (origem no canto superior esquerdo). As fotografias são processadas apenas no seu navegador.</p>
              </PopoverContent>
            </Popover>
          </div>
        </header>

        <div className="flex min-h-0 flex-1 flex-col md:flex-row">
          {/* Viewer */}
          <main className="relative flex min-h-[55vh] flex-1 flex-col md:min-h-0"
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }} onDragLeave={() => setDragOver(false)}
            onDrop={(e) => { e.preventDefault(); setDragOver(false); if (e.dataTransfer.files.length) addFiles(e.dataTransfer.files); }}>
            {/* Tools */}
            <div className="flex h-10 shrink-0 items-center gap-1 overflow-x-auto border-b bg-card px-2">
              <IconBtn label="Marcar ovo (M)" active={tool === "mark"} onClick={() => setTool("mark")}><Crosshair className="h-4 w-4" /></IconBtn>
              <IconBtn label="Mover imagem (V)" active={tool === "pan"} onClick={() => setTool("pan")}><Hand className="h-4 w-4" /></IconBtn>
              <div className="mx-1 h-5 w-px bg-border" />
              <IconBtn label="Remover marcação (Del)" disabled={!selectedId} onClick={() => selectedId && remove(selectedId)}><Trash2 className="h-4 w-4" /></IconBtn>
              <IconBtn label="Desfazer (Ctrl+Z)" disabled={!history.length} onClick={undo}><Undo2 className="h-4 w-4" /></IconBtn>
              <IconBtn label={showMarks ? "Ocultar marcações (H)" : "Mostrar marcações (H)"} onClick={() => setShowMarks((s) => !s)}>{showMarks ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}</IconBtn>
              <div className="mx-1 h-5 w-px bg-border" />
              <IconBtn label="Reduzir zoom (−)" disabled={!cur} onClick={() => viewer.current?.zoomBy(0.8)}><Minus className="h-4 w-4" /></IconBtn>
              <button className="w-14 rounded px-1 py-1 text-center font-mono text-xs tabular-nums text-muted-foreground hover:bg-accent disabled:opacity-50" disabled={!cur} onClick={() => viewer.current?.zoom100()} title="Zoom 100%">{(zoom * 100).toFixed(0)}%</button>
              <IconBtn label="Ampliar zoom (+)" disabled={!cur} onClick={() => viewer.current?.zoomBy(1.25)}><Plus className="h-4 w-4" /></IconBtn>
              <IconBtn label="Ajustar à tela (F)" disabled={!cur} onClick={() => viewer.current?.fit()}><Maximize className="h-4 w-4" /></IconBtn>
              {cur && <span className="ml-auto hidden truncate pl-2 font-mono text-xs text-muted-foreground lg:inline">{cur.file.name} · {cur.w}×{cur.h}px</span>}
            </div>

            <div className="relative min-h-0 flex-1">
              {cur && url ? (
                <Viewer ref={viewer} src={url} imgW={cur.w} imgH={cur.h} detections={dets} selectedId={selectedId} tool={tool}
                  showMarks={showMarks} markerSize={settings.markerSize} onSelect={setSelectedId} onCreate={onCreate} onUpdate={onUpdate} onZoomChange={setZoom} />
              ) : (
                <button onClick={() => fileInput.current?.click()} className="absolute inset-3 grid place-items-center rounded-md border-2 border-dashed bg-viewer text-center text-muted-foreground hover:border-primary">
                  <div><ImageDown className="mx-auto mb-2 h-8 w-8" /><p className="text-sm font-medium text-foreground">Arraste fotografias aqui ou clique para abrir</p><p className="mt-1 text-xs">JPG, PNG ou WebP · resolução original preservada · processamento local</p></div>
                </button>
              )}
              {dragOver && <div className="pointer-events-none absolute inset-0 grid place-items-center border-2 border-primary bg-primary/10 text-sm font-medium text-primary">Soltar para abrir</div>}
            </div>

            {photos.length > 0 && (
              <div className="flex h-9 shrink-0 items-center gap-1 overflow-x-auto border-t bg-card px-2">
                {photos.map((p) => (
                  <div key={p.id} className={cn("flex shrink-0 items-center rounded border text-xs", p.id === currentId ? "border-primary bg-accent" : "")}>
                    <button className="max-w-40 truncate px-2 py-1" onClick={() => setCurrentId(p.id)} title={p.file.name}>{p.file.name} <span className="font-mono text-muted-foreground">({counts(p.dets).total})</span></button>
                    <button className="px-1 text-muted-foreground hover:text-destructive" aria-label={`Fechar ${p.file.name}`} onClick={() => closePhoto(p.id)}><X className="h-3 w-3" /></button>
                  </div>
                ))}
              </div>
            )}
          </main>

          {/* Side panel */}
          <aside className="flex w-full shrink-0 flex-col border-t bg-card md:w-80 md:border-l md:border-t-0">
            <section className="border-b p-3">
              <div className="grid grid-cols-3 gap-2 text-center">
                {[["Total", c.total], ["Automáticas", c.auto], ["Manuais", c.manual], ["Confirmadas", c.confirmed], ["Editadas", c.edited], ["Rejeitadas", c.rejected]].map(([k, v]) => (
                  <div key={k as string} className="rounded border bg-background px-1 py-1.5">
                    <div className="font-mono text-lg font-semibold tabular-nums leading-none">{cur ? v : "—"}</div>
                    <div className="mt-1 text-[10px] uppercase tracking-wide text-muted-foreground">{k}</div>
                  </div>
                ))}
              </div>
              <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-muted-foreground">
                {[["Automática pendente", "pending", "auto"], ["Confirmada", "confirmed", "auto"], ["Editada", "edited", "auto"], ["Manual", "confirmed", "manual"]].map(([l, s, src]) => (
                  <span key={l} className="flex items-center gap-1"><span className="h-2 w-2 rounded-sm" style={{ background: colorFor({ status: s as Detection["status"], source: src as Detection["source"] }) }} />{l}</span>
                ))}
              </div>
            </section>

            <section className="space-y-2 border-b p-3 text-xs">
              <div className="flex justify-between"><span className="text-muted-foreground">Modelo</span><span className="font-mono">{modelReady ? engineState.name : "nenhum"}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Estado</span><span>{busy ? "Analisando…" : !cur ? "Sem fotografia" : cur.processingMs != null ? "Analisada pela IA" : dets.length ? "Revisão manual" : "Aguardando"}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Tempo de processamento</span><span className="font-mono">{cur?.processingMs != null ? `${cur.processingMs.toFixed(0)} ms` : "—"}</span></div>
              <div className={cn(!modelReady && "opacity-50")}>
                <div className="mb-1 flex justify-between"><span className="text-muted-foreground">Confiança mínima</span><span className="font-mono">{conf.toFixed(2)}</span></div>
                <Slider disabled={!modelReady} min={0.05} max={0.95} step={0.05} value={[conf]} onValueChange={([v]) => v != null && setConf(v)} />
              </div>
              <Button className="w-full" size="sm" disabled={!cur || !modelReady || busy} onClick={analyze}><ScanSearch className="h-4 w-4" /> {busy ? "Analisando…" : "Analisar imagem"}</Button>
              {!modelReady && <p className="rounded border border-dashed p-2 text-[11px] leading-snug text-muted-foreground">Detecção automática indisponível: nenhum modelo ONNX carregado. Marcação manual, revisão e exportação funcionam normalmente. <button className="underline" onClick={() => setSettingsOpen(true)}>Carregar modelo</button></p>}
            </section>

            <section className="flex min-h-40 flex-1 flex-col md:min-h-0">
              <div className="flex items-center justify-between px-3 pb-1 pt-2 text-xs font-medium"><span>Detecções</span><span className="font-mono text-muted-foreground">{dets.length}</span></div>
              <ol className="max-h-72 flex-1 overflow-y-auto px-1 pb-2 md:max-h-none">
                {dets.length === 0 && <li className="px-2 py-3 text-xs text-muted-foreground">{cur ? "Nenhuma marcação. Use a ferramenta Marcar ovo (M) e clique ou arraste sobre a fotografia." : "Abra uma fotografia para começar."}</li>}
                {dets.map((d, i) => (
                  <li key={d.id} onClick={() => setSelectedId(d.id)} className={cn("group flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-xs hover:bg-accent", d.id === selectedId && "bg-accent ring-1 ring-primary")}>
                    <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: colorFor(d) }} />
                    <span className="w-6 font-mono text-muted-foreground">{i + 1}</span>
                    <span className="flex-1 truncate font-mono tabular-nums">{Math.round(d.x)},{Math.round(d.y)} · {Math.round(d.w)}×{Math.round(d.h)}</span>
                    <span className="text-[10px] text-muted-foreground">{d.source === "auto" ? (d.confidence ?? 0).toFixed(2) : "man."} · {STATUS_LABEL[d.status]}</span>
                    <button aria-label="Confirmar" className="text-muted-foreground hover:text-status-ok" onClick={(e) => { e.stopPropagation(); setStatus(d.id, "confirmed"); }}><Check className="h-3.5 w-3.5" /></button>
                    <button aria-label="Rejeitar" className="text-muted-foreground hover:text-status-warn" onClick={(e) => { e.stopPropagation(); setStatus(d.id, d.status === "rejected" ? "pending" : "rejected"); }}><X className="h-3.5 w-3.5" /></button>
                    <button aria-label="Remover" className="text-muted-foreground hover:text-destructive" onClick={(e) => { e.stopPropagation(); remove(d.id); }}><Trash2 className="h-3.5 w-3.5" /></button>
                  </li>
                ))}
              </ol>
            </section>

            <section className="grid grid-cols-3 gap-1 border-t p-2">
              <Button size="sm" variant="outline" disabled={!cur} onClick={exportPNG}><Download className="h-3.5 w-3.5" />PNG</Button>
              <Button size="sm" variant="outline" disabled={!cur} onClick={exportJSON}><FileJson className="h-3.5 w-3.5" />JSON</Button>
              <Button size="sm" variant="outline" disabled={!cur} onClick={exportCSV}><FileSpreadsheet className="h-3.5 w-3.5" />CSV</Button>
            </section>
          </aside>
        </div>
        <SettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} settings={settings} onSettings={setSettings} engineState={engineState} onEngineState={setEngineState} conf={conf} />
      </div>
    </TooltipProvider>
  );
}
