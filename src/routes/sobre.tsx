import { createFileRoute, Link } from "@tanstack/react-router";

const URL = "https://rivulideos-ai.online/sobre";
const TITLE = "Sobre e metodologia — Rivulídeos AI";
const DESC =
  "Conheça a contagem de ovos de rivulídeos com IA local, a revisão humana, as limitações e as referências científicas do Rivulídeos AI.";

export const Route = createFileRoute("/sobre")({
  staticData: { sitemap: true },
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESC },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESC },
      { property: "og:type", content: "article" },
      { property: "og:url", content: URL },
      { name: "twitter:card", content: "summary_large_image" },
      { property: "og:image", content: "https://rivulideos-ai.online/og-image.png" },
      { name: "twitter:image", content: "https://rivulideos-ai.online/og-image.png" },
    ],
    links: [{ rel: "canonical", href: URL }],
    scripts: [
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "AboutPage",
          name: TITLE,
          url: URL,
          inLanguage: "pt-BR",
          description: DESC,
          author: {
            "@type": "Organization",
            name: "Equipe de Robótica Esquadrão-A29 — SESI de Pirassununga",
            email: "nogueiramatheus780@gmail.com",
          },
          about: {
            "@type": "WebApplication",
            name: "Rivulídeos AI",
            url: "https://rivulideos-ai.online/",
          },
        }),
      },
    ],
  }),
  component: About,
});

function About() {
  return (
    <main className="mx-auto max-w-3xl px-5 py-10 leading-relaxed text-foreground">
      <Link to="/" className="text-sm text-primary underline">
        ← Abrir a ferramenta de análise
      </Link>
      <h1 className="mt-6 text-3xl font-semibold">
        Rivulídeos AI: contagem de ovos de rivulídeos com inteligência artificial
      </h1>
      <p className="mt-4">
        O Rivulídeos AI é uma ferramenta de apoio à contagem de ovos de peixes rivulídeos em
        fotografias de substrato. Combina detecção por inteligência artificial com marcação e
        revisão humana. As fotografias e a inferência permanecem no navegador; os registros de uso
        da hospedagem são explicados na página de{" "}
        <Link to="/privacidade" className="text-primary underline">
          privacidade
        </Link>
        .
      </p>

      <h2 className="mt-8 text-xl font-semibold">Quem desenvolveu o projeto</h2>
      <p className="mt-2">
        O Rivulídeos AI foi desenvolvido pela equipe de Robótica Esquadrão-A29 do SESI de
        Pirassununga, no interior de São Paulo. A equipe é identificada aqui como autora do projeto;
        essa autoria não representa certificação de precisão do modelo ou endosso das instituições
        citadas nas referências científicas.
      </p>
      <p className="mt-2">
        Contato para dúvidas, correções e relatos de problemas:{" "}
        <a href="mailto:nogueiramatheus780@gmail.com" className="break-all text-primary underline">
          nogueiramatheus780@gmail.com
        </a>
        . Ao entrar em contato, evite enviar fotografias com pessoas identificáveis ou informações
        pessoais desnecessárias.
      </p>

      <h2 className="mt-8 text-xl font-semibold">O que são os rivulídeos</h2>
      <p className="mt-2">
        Os rivulídeos incluem peixes de água doce com diferentes ciclos de vida: nem todos são
        anuais. Nos peixes anuais, embriões podem atravessar períodos de seca no substrato, com
        interrupções do desenvolvimento chamadas diapausas. Esses mecanismos variam entre espécies e
        condições ambientais; não existe um prazo de eclosão universal. Veja as referências
        científicas{" "}
        <a href="https://doi.org/10.1111/brv.12194" className="text-primary underline">
          [1]
        </a>{" "}
        e{" "}
        <a
          href="https://pmc.ncbi.nlm.nih.gov/articles/PMC4016651/"
          className="text-primary underline"
        >
          [2]
        </a>
        .
      </p>
      <p className="mt-2">
        No Brasil, o ICMBio mantém um Plano de Ação Nacional para os rivulídeos ameaçados de
        extinção, frequentemente chamados de peixes-das-nuvens. Essa fonte contextualiza a
        conservação; sua citação não significa vínculo ou endosso à ferramenta{" "}
        <a
          href="https://www.gov.br/icmbio/pt-br/assuntos/biodiversidade/pan/pan-rivulideos"
          className="text-primary underline"
        >
          [3]
        </a>
        .
      </p>

      <h2 className="mt-8 text-xl font-semibold">Por que contar ovos</h2>
      <p className="mt-2">
        Registrar a quantidade de ovos visíveis ajuda a organizar observações e comparar imagens em
        um protocolo definido pelo usuário. A contagem de uma fotografia, isoladamente, não
        determina fecundidade, viabilidade dos embriões ou sucesso reprodutivo. O resultado depende
        da amostragem, da qualidade da imagem e da revisão das marcações.
      </p>

      <h2 className="mt-8 text-xl font-semibold">Como funciona</h2>
      <ol className="mt-2 list-decimal space-y-1 pl-6">
        <li>Abra uma foto do substrato (JPG, PNG ou WebP).</li>
        <li>Carregue o modelo de visão computacional incluído nas configurações.</li>
        <li>
          A IA propõe candidatas a ovos com caixas numeradas; sem modelo carregado, não há detecção
          automática.
        </li>
        <li>Confirme, rejeite, edite ou adicione marcações manuais.</li>
        <li>
          Exporte a imagem anotada (PNG), os dados (JSON ou CSV) e o relatório para salvar como PDF
          pela impressão do navegador.
        </li>
      </ol>

      <h2 className="mt-8 text-xl font-semibold">Método e limites de interpretação</h2>
      <p className="mt-2">
        A versão atual usa um único modelo ONNX incluído, executado no navegador. As coordenadas das
        caixas são mantidas em pixels da imagem original. A contagem final soma marcações manuais e
        automáticas confirmadas ou editadas; candidatas pendentes e rejeitadas não entram. JSON e
        CSV preservam as candidatas para auditoria, incluindo seus status.
      </p>
      <ul className="mt-3 list-disc space-y-2 pl-6">
        <li>
          Reflexos, partículas, ovos sobrepostos, baixa resolução e substratos diferentes podem
          causar falsos positivos ou omissões.
        </li>
        <li>
          A confiança do modelo é um escore de detecção, não uma garantia de que a caixa contém um
          ovo.
        </li>
        <li>
          Não apresentamos aqui métricas de precisão, validação experimental independente ou
          certificação científica da ferramenta.
        </li>
        <li>
          Revise cada candidata e acrescente ovos omitidos antes de usar a contagem. Para pesquisa,
          registre o protocolo e compare com uma referência manual adequada.
        </li>
        <li>
          A ferramenta não identifica a espécie nem confirma viabilidade, estágio de desenvolvimento
          ou data de eclosão.
        </li>
      </ul>

      <h2 className="mt-8 text-xl font-semibold">Para quem é</h2>
      <p className="mt-2">
        Pesquisadores de ictiologia, laboratórios de biologia, escolas, programas de conservação e
        criadores de killifish que desejam organizar e revisar contagens em imagens. O uso não
        substitui orientação especializada nem autorizações necessárias para manejo de espécies.
      </p>

      <h2 className="mt-8 text-xl font-semibold">Referências sobre os peixes e seus ovos</h2>
      <ul className="mt-2 space-y-3 text-sm">
        <li>
          [1]{" "}
          <a href="https://doi.org/10.1111/brv.12194" className="text-primary underline">
            The evolution of an annual life cycle in killifish
          </a>{" "}
          — revisão, Biological Reviews (2015). Ciclo anual e diapausa embrionária.
        </li>
        <li>
          [2]{" "}
          <a
            href="https://pmc.ncbi.nlm.nih.gov/articles/PMC4016651/"
            className="text-primary underline"
          >
            Desiccation plasticity in the embryonic life histories of non-annual rivulid species
          </a>{" "}
          — Varela-Lasheras e Van Dooren, EvoDevo (2014). Rivulídeos não anuais e desenvolvimento
          embrionário.
        </li>
        <li>
          [3]{" "}
          <a
            href="https://www.gov.br/icmbio/pt-br/assuntos/biodiversidade/pan/pan-rivulideos"
            className="text-primary underline"
          >
            PAN Rivulídeos — ICMBio
          </a>{" "}
          — plano nacional de conservação. As fontes tratam de biologia e conservação, não validam
          este modelo de IA.
        </li>
      </ul>

      <p className="mt-10">
        <Link to="/" className="font-medium text-primary underline">
          Começar a contar ovos agora
        </Link>
        <span className="mx-3 text-muted-foreground">·</span>
        <Link to="/privacidade" className="text-primary underline">
          Privacidade e dados de uso
        </Link>
      </p>
    </main>
  );
}
