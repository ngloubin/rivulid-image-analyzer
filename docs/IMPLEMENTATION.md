# Integração funcional de Rivulídeos AI

## Contrato independente do modelo

O contrato mínimo permanece:

```ts
interface DetectionEngineContract {
  load(): Promise<void>;
  detect(image: ImageData): Promise<Detection[]>;
  dispose(): Promise<void>;
}
```

A implementação também oferece carga de arquivos ONNX + JSON e uma sobrecarga para Blob que devolve detecções, tempo e registro de inferência. A UI usa exclusivamente a fachada DetectionEngine para imagens, estado e inferência. Nenhum componente importa YOLOAdapter, SetDetectorAdapter, SessionResources ou ONNX Runtime.

Fluxo: UI → DetectionEngine → WorkerClient → Worker → adapter + ONNX Runtime. O engine controla o protocolo de janelas; adapters controlam pré-processamento e interpretação de saídas. Um adapter novo pode ser registrado no Worker e no schema de configuração sem mudar viewer, revisão ou exports.

`load()` sem argumentos restaura a cópia local. `dispose()` libera sessão e Worker. A cópia salva só é apagada pelo comando explícito “Remover modelo salvo”.

## Semântica de revisão e contagem

Decisão D2 do usuário: total final = marcações manuais não rejeitadas + automáticas confirmadas ou editadas. Automáticas pendentes ficam separadas e não entram no total final.

O filtro de confiança atua apenas nas pendentes. Todas as candidatas acima do piso de inferência do JSON são mantidas. Revisões permanecem visíveis mesmo abaixo do filtro.

Numeração é a posição, começando em 1, no conjunto completo de anotações da imagem. Ocultar uma candidata ou excluir rejeitadas do PNG não renumera as restantes. Assim, lacunas são esperadas. Viewer, lista, JSON, CSV e PNG usam o mesmo índice para a mesma anotação no estado atual.

JSON e CSV incluem rejeitadas e candidatas ocultas para auditoria, com campos `visible` e `counted`. PNG desenha apenas visíveis não rejeitadas. O JSON registra a regra de contagem e o limiar de exibição.

Reanálise pede confirmação antes de substituir candidatas pendentes. Marcações manuais, confirmações, edições e rejeições são preservadas; novas candidatas que sobrepõem essas revisões por IoU são suprimidas. A mesclagem usa o estado mais recente, incluindo revisões feitas enquanto a inferência estava em andamento. Histórico de desfazer pertence a cada fotografia.

## ONNX e JSON de configuração

Em Configurações, selecione os dois arquivos e a preferência CPU/WebGPU. A configuração é validada por schema estrito. Entradas float32 NCHW, RGB, batch 1 são suportadas. Nomes/dimensões fixas são lidos dos metadados ONNX; dimensões dinâmicas precisam ser declaradas no JSON. Contradições são erros, não palpites.

O exemplo [yolo-v2.json](../examples/yolo-v2.json) transcreve o protocolo informado pelo usuário (janelas 512/1024, overlap 0,25, NMS 0,4, piso 0,05). É um exemplo, não uma validação do modelo ou uma escolha definitiva para D3/D4. Não é carregado automaticamente.

- `adapter: "yolo"`: saída float32 [1,4+C,N] ou [1,N,4+C], centros/medidas em pixels de entrada, probabilidades sem coluna de objectness. Layout só é inferido quando os metadados permitem uma escolha única.
- `adapter: "set-detector"`: contrato explícito de boxes [1,Q,4] e scores [1,Q,C], com nomes, formato xyxy/cxcywh, coordenadas normalized/input, ativação none/sigmoid/softmax e índice opcional de background. Normalização, resize e cada etapa de NMS vêm do JSON. Isso não certifica o formato de um RF-DETR ainda não exportado.
- `windowNmsIou` e `globalNmsIou` podem ser null. NMS, quando solicitado, é por classe.
- Tamanhos de janelas, overlap, piso, supressão e limite de janelas são configuração. O limite recusa a operação antes de alocar recortes; não trunca silenciosamente os resultados.

O hash SHA-256 real é calculado e registrado, inclusive quando o JSON original não o contém. Se o JSON declarar hash, divergência impede a carga. Modelo + JSON ficam no IndexedDB deste navegador. Falha de armazenamento é mostrada e não torna uma sessão já carregada inutilizável.

Cada análise ganha runId, horário, hash/versão, configuração resolvida, metadados ONNX, provedor solicitado e aberto, alternativa de execução, threads configuradas, isolamento de origem, número de janelas e tempo. Cada detecção automática mantém a origem de sua análise. Revisões antigas preservadas continuam associadas ao registro original.

## Worker e coordenadas

A fotografia original é decodificada no Worker. Cada janela usa drawImage com retângulo de origem; apenas o recorte atual é convertido para tensor. O offset é somado antes da fusão global e as caixas finais são limitadas à imagem original. Não há tensor da fotografia inteira no protocolo com tiling.

Há progresso por janela e fase de fusão. Cancelamento é cooperativo: termina a execução ONNX atual, libera entradas/saídas/recorte e interrompe as próximas janelas. A fusão global também cede o controle para receber cancelamento. Resultado parcial não substitui anotações.

O provedor é o da sessão efetivamente aberta: tentativa WebGPU isolada; se falhar, nova sessão WASM e motivo da alternativa. Isso não é uma medição de quais operadores individuais rodaram na GPU.

## Paridade com Python

Em “Validação técnica”, “Exportar diagnóstico de paridade” salva um JSON local com tensor de entrada e saídas brutas ONNX de uma passada na fotografia inteira. É um diagnóstico separado do protocolo de janelas.

Instale, no ambiente de pesquisa, numpy e opencv-python; onnxruntime é necessário somente com --model. Execute:

```sh
python scripts/parity-reference.py --snapshot foto_paridade.json --image foto.jpg --model modelo.onnx --report comparacao.json
```

O script confere o hash do modelo, compara tensor drawImage vs OpenCV e compara saídas Python ORT com o mesmo tensor do navegador e com o tensor OpenCV. Tolerâncias são explícitas (--input-atol e --output-atol). Código de saída 1 indica divergência e 2 indica erro de execução. Não aumente tolerâncias apenas para obter aprovação.

Padding esquerdo/superior usa inteiros. A interpolação do navegador pode divergir de cv2; paridade numérica continua não demonstrada até executar esse ensaio com imagem e ONNX reais. O script não mede precisão de detecção.

## Exportação e importação de imagens

PNG tem um orçamento conservador de canvas: 8192 por lado e 16.777.216 pixels. Imagens maiores exigem autorização na própria interface para gerar uma cópia reduzida, cujo nome indica a redução. JSON/CSV sempre guardam coordenadas originais. Isso reduz risco de memória; não certifica limites do Safari/iOS.

JPG, PNG e WebP têm leitura de dimensões por cabeçalhos, incluindo orientação EXIF em JPEG. Cabeçalhos incomuns ou incompletos usam decodificação como alternativa. Fotografias não são enviadas à rede.

## Hospedagem e pontos pendentes

D1 permanece com o usuário. Não houve publicação nem alteração de público, COOP/COEP ou preset de hospedagem. O projeto ainda usa o preset original do Lovable, que inclui SSR inicial; fotos e inferência continuam no cliente.

A [documentação oficial Cloudflare](https://developers.cloudflare.com/workers/platform/limits/) limita cada asset estático a 25 MiB. O artefato WASM do ORT deve ser medido no build e comparado ao limite antes de escolher esse caminho. Reduzir em gzip não resolve um limite por arquivo descomprimido.

A [documentação ONNX Runtime](https://onnxruntime.ai/docs/tutorials/web/env-flags-and-session-options.html) exige suporte a threads e isolamento de origem para WASM multithread. Sem isolamento, este app configura uma thread. COOP/COEP e fontes locais serão definidos com D1; Google Fonts permanece no layout original por enquanto. O [guia de deploy ORT](https://onnxruntime.ai/docs/tutorials/web/deploy.html) orienta servir JS e WASM da mesma versão.

D3 (modelo/arquitetura/tamanho real) e D4 (fotos/tamanho aparente dos ovos) continuam abertos. O schema não escolhe esses valores pelo usuário.

## Validação e limites

Os testes automatizados usam adapters, tensores e serviços sintéticos, não medem acurácia em ovos. Incluem borda entre janelas e offsets originais, NMS por classe, descarte de recursos, cancelamento, mesclagem de revisão, numeração PNG/JSON/CSV/viewer, classes, metadados, cache/fachada, gestos, atalhos e Workspace.

A página local respondeu HTTP 200. O navegador de testes não anexou a visualização, portanto não houve inspeção visual, teste físico de pinch, execução real de ONNX no browser, comprovação de WebGPU, IndexedDB real em diferentes navegadores ou ensaio de desempenho/iOS. Esses pontos não devem ser considerados verificados.

Os arquivos gerados e o histórico publicado não foram reescritos. Há um commit local isolado de formatação. O ZIP não incluía .git nem um remoto configurado; os commits novos são locais e não foram enviados ao Lovable.

## Resultado da rodada final

- Vitest: 44 testes passaram em 11 arquivos, com no máximo dois workers de teste. Os testes de integração do Workspace têm 15 segundos de orçamento para este ambiente; assertions não foram removidas.
- Build Vite/Nitro: passou. Worker ES module e recursos ONNX foram gerados.
- WASM no build final: ort-wasm-simd-threaded.asyncify-AkdHdxrx.wasm, 28,747,738 bytes (27.42 MiB).
- Python do harness: sintaxe validada; comparação numérica com ONNX real ainda não executada.
- Sem alteração de src/routeTree.gen.ts, bun.lock ou das dependências do projeto.

Para reproduzir as verificações: `bun install --frozen-lockfile --ignore-scripts`, `bunx tsc --noEmit`, `bun run test --maxWorkers=2`, `bun run lint --max-warnings=0` e `bun run build`.

- TypeScript (`tsc --noEmit`): passou.
- ESLint (`--max-warnings=0`): passou, zero erros e zero avisos.
