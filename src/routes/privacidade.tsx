import { createFileRoute, Link } from "@tanstack/react-router";

const TITLE = "Privacidade e dados de uso — Rivulídeos AI";
const DESCRIPTION =
  "Como o Rivulídeos AI processa fotografias localmente, guarda preferências no navegador e registra eventos de uso para melhorar a ferramenta.";

export const Route = createFileRoute("/privacidade")({
  staticData: { sitemap: true },
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESCRIPTION },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESCRIPTION },
      { property: "og:type", content: "website" },
      { property: "og:url", content: "https://rivulideos-ai.online/privacidade" },
      { name: "twitter:card", content: "summary" },
    ],
    links: [{ rel: "canonical", href: "https://rivulideos-ai.online/privacidade" }],
  }),
  component: Privacy,
});

function Privacy() {
  return (
    <main className="mx-auto max-w-3xl px-5 py-10 leading-relaxed text-foreground">
      <nav aria-label="Navegação do projeto" className="flex flex-wrap gap-5 text-sm">
        <Link to="/" className="text-primary underline">
          ← Ferramenta de análise
        </Link>
        <Link to="/sobre" className="text-primary underline">
          Sobre e metodologia
        </Link>
      </nav>
      <h1 className="mt-6 text-3xl font-semibold">Privacidade e dados de uso</h1>
      <p className="mt-2 text-sm text-muted-foreground">Atualizado em 28 de novembro de 2026.</p>
      <p className="mt-4">
        Projeto desenvolvido pela equipe de Robótica Esquadrão-A29 do SESI de Pirassununga, São
        Paulo. Conheça a{" "}
        <Link to="/sobre" className="text-primary underline">
          autoria e a metodologia
        </Link>
        .
      </p>
      <h2 className="mt-8 text-xl font-semibold">Fotografias e análise no seu dispositivo</h2>
      <p className="mt-2">
        As fotografias abertas, as caixas de detecção e a execução do modelo de IA ficam no
        navegador. A ferramenta não envia as fotos, seus nomes, os pixels, os tensores de análise ou
        as coordenadas das marcações nos eventos de uso. O modelo e seus arquivos de execução são
        baixados do próprio domínio. Os arquivos PNG, JSON, CSV e o relatório para PDF são gerados
        localmente; cabe a você decidir onde salvá-los e com quem compartilhá-los.
      </p>
      <h2 className="mt-8 text-xl font-semibold">Armazenamento no navegador</h2>
      <p className="mt-2">
        O tema e o tamanho das marcações são salvos no armazenamento local. O modelo carregado pode
        ser guardado no IndexedDB para reutilização. As fotos e as anotações da sessão não formam um
        histórico na nuvem. Exporte seu trabalho antes de fechar ou recarregar a página. Para apagar
        preferências e o modelo armazenado, limpe os dados deste site no navegador.
      </p>
      <h2 className="mt-8 text-xl font-semibold">O que é registrado para melhorar o site</h2>
      <p className="mt-2">
        A hospedagem Lovable recebe eventos de abertura de fotos (quantidade), marcação manual,
        revisão (status), conclusão da análise (quantidade de candidatas, janelas e duração), falha
        de análise e exportação (formato, contagem final e pendências). Esses registros ajudam a
        entender o uso e encontrar dificuldades; não treinam o modelo nem alteram automaticamente as
        detecções.
      </p>
      <p className="mt-2">
        A hospedagem também registra visitas e informações técnicas de navegação, e pode receber
        diagnósticos de erros, como mensagem, caminho da página e detalhes técnicos. Esses registros
        não devem ser considerados anônimos apenas por não conterem a fotografia. O aplicativo não
        pede cadastro, nome ou dados de pagamento para analisar uma imagem.
      </p>
      <h2 className="mt-8 text-xl font-semibold">Serviços externos e limites desta informação</h2>
      <p className="mt-2">
        A hospedagem é fornecida pela Lovable e as fontes visuais são carregadas pelo Google Fonts;
        essas requisições expõem informações técnicas da conexão, como o endereço IP, aos serviços.
        Não informamos um prazo de retenção ou uma lista de cookies desses fornecedores sem
        confirmação. Consulte também a{" "}
        <a className="text-primary underline" href="https://lovable.dev/privacy">
          política de privacidade da Lovable
        </a>{" "}
        e a{" "}
        <a className="text-primary underline" href="https://policies.google.com/privacy">
          política do Google
        </a>
        . Esta página descreve as práticas verificadas da versão atual, não uma certificação de
        segurança ou uma garantia de ausência de coleta pela hospedagem.
      </p>
      <h2 className="mt-8 text-xl font-semibold">Dúvidas e solicitações sobre privacidade</h2>
      <p className="mt-2">
        Escreva para{" "}
        <a href="mailto:nogueiramatheus780@gmail.com" className="break-all text-primary underline">
          nogueiramatheus780@gmail.com
        </a>{" "}
        para dúvidas sobre o projeto ou solicitações relativas aos dados de uso. Ao enviar uma
        mensagem, seu endereço de e-mail e seu conteúdo serão recebidos pelo contato do projeto e
        pelo serviço de e-mail utilizado. Evite anexar dados pessoais ou fotografias desnecessárias.
      </p>
    </main>
  );
}
