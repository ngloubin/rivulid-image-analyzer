# Deploy no Lovable com o primeiro modelo

Este pacote inclui somente o modelo original `modelo_ovos_final_teste.onnx`,
convertido do checkpoint anterior ao novo treinamento. O ONNX é distribuído
em gzip sem alterar seus pesos. SHA-256 após descompactação:

`3f49b9db7073cab67bea0c3fd78e6b0348f59ae8a9b607448255e58030f3dcf7`

Não inclui imagens, datasets, arquivos `.pt`, checkpoints de CPU ou o modelo
posteriormente treinado na T4. Publicar este pacote permite baixar os pesos
do modelo original. As fotografias dos usuários continuam no navegador.

## Funcionamento

- Em Configurações, **Carregar modelo incluído** baixa o ONNX e o runtime do
  próprio domínio. O primeiro download tem aproximadamente 17 MB.
- SHA-256 e tamanho são verificados antes de abrir a sessão.
- O ONNX e sua configuração ficam no IndexedDB; o navegador gerencia o cache
  dos arquivos estáticos do runtime. Não há chamada de inferência ao servidor.
- Também é possível continuar carregando pares ONNX + JSON locais.
- O engine e os adapters continuam independentes da UI. O modelo incluído é
  definido em `src/lib/engine/BundledModel.ts`.
- Inferência roda no Worker. Sem isolamento de origem, WASM usa uma thread.
  Não foram ativados COOP/COEP neste deploy. WebGPU mantém alternativa em WASM.

## Build e arquivos estáticos

Use `bun install --frozen-lockfile` e `bun run build`. O script de build prepara
o runtime a partir da versão instalada, valida a versão 1.31.1 e gera:

- `public/runtime/ort-1.31.1/manifest.json`
- `public/runtime/ort-1.31.1/ort-wasm-simd-threaded.asyncify.mjs`
- `public/runtime/ort-1.31.1/ort-wasm-simd-threaded.asyncify.wasm.gz`

O Vite usa a entrada externa do ONNX Runtime para evitar emitir o WASM
descompactado de 28,7 MB. O arquivo gzip tem cerca de 7,2 MB, e o ONNX gzip
9,3 MB. Não excluir nem substituir os binários por arquivos de texto.

Arquivos `.gz` são assets: servir seus bytes normalmente; o engine aceita
também hosts que descompactam a resposta com `Content-Encoding: gzip`.
O módulo `.mjs` deve ser servido como JavaScript. O script preserva a licença
MIT do ONNX Runtime. Não mudar o preset/framework nem duplicar os plugins
geridos por `@lovable.dev/vite-tanstack-config`.

## Verificação após publicar

1. Abrir o site em uma sessão limpa; não baixar modelo/runtime antes do clique.
2. Carregar o modelo incluído e conferir hash, entrada 1024 × 1024 e saída
   `output0` nas configurações.
3. Executar uma análise pequena e conferir progresso e provedor efetivo.
4. Recarregar a página e conferir a restauração do modelo salvo.
5. Conferir que nenhuma requisição contém fotografias.

Este deploy testa a hospedagem e o encaixe funcional. Não representa uma
nova avaliação de precisão científica do modelo original.
