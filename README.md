# Rivulid Image Analyzer

Desenvolva a aplicação web funcional de análise científica de imagens Rivulídeos AI exatamente conforme especificado no documento em anexo:

- Abrir diretamente na ferramenta de análise de trabalho científico (sem landing page, sem tela de boas-vindas).
- Barra superior compacta (Rivulídeos AI, abrir foto, estado do modelo de IA, configurações, ajuda discreta).
- Visualizador central interativo com suporte a upload/drag-and-drop de JPG, PNG, WebP, zoom suave com roda do mouse e controles, pan/arraste, ajuste automático à tela, renderização precisa de bounding boxes/marcações preservando coordenadas da imagem original mesmo em zoom/redimensionamento.
- Painel lateral com contagens reais (automáticas, manuais, revisadas), lista de detecções interativa, estado do modelo e ferramentas de exportação (PNG com anotações, JSON estruturado e CSV).
- Ferramentas operacionais ativas: marcação manual de ovos (clique e arraste ou ponto/box), edição/redimensionamento de marcação, remoção, alternar visibilidade, e status claro de que a inferência por IA aguarda o carregamento do modelo ONNX.
- Arquitetura modular preparada para ONNX Runtime Web / YOLO11 / RF-DETR (ImageProcessor, DetectionEngine, YOLOAdapter, ResultProcessor, ResourceManager), sem gerar resultados falsos quando nenhum modelo estiver carregado.
- Interface científica profissional, limpa, leve, com tema claro e escuro, sem dependências pesadas no carregamento inicial.

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/d0a5e1a8-63d1-4d1e-b1a4-f9641c2cc96d).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
