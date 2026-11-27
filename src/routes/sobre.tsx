import { createFileRoute, Link } from "@tanstack/react-router";

const URL = "https://rivulideos-ai.online/sobre";
const TITLE = "Sobre o Rivulídeos AI — Contagem de ovos de peixes anuais com IA";
const DESC =
  "Como o Rivulídeos AI usa visão computacional para identificar e contar ovos de peixes rivulídeos (killifish anuais) em fotos de substrato, direto no navegador.";

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
          "@type": "WebApplication",
          name: "Rivulídeos AI",
          url: "https://rivulideos-ai.online/",
          applicationCategory: "ScientificApplication",
          operatingSystem: "Navegador web",
          inLanguage: "pt-BR",
          description: DESC,
          offers: { "@type": "Offer", price: "0", priceCurrency: "BRL" },
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
        O Rivulídeos AI é uma ferramenta científica gratuita que identifica, conta e permite revisar
        ovos de peixes rivulídeos em fotografias de substrato. Tudo acontece no próprio navegador:
        as fotos não são enviadas para nenhum servidor.
      </p>

      <h2 className="mt-8 text-xl font-semibold">O que são os rivulídeos</h2>
      <p className="mt-2">
        Rivulídeos (família Rivulidae) são pequenos peixes de água doce da América do Sul e Central,
        conhecidos como killifish ou peixes anuais. Muitas espécies vivem em poças temporárias que
        secam todo ano; os ovos sobrevivem enterrados no substrato, em diapausa, até a próxima
        chuva. Várias espécies brasileiras estão ameaçadas de extinção, por isso a reprodução em
        cativeiro e o monitoramento de ovos são essenciais para pesquisa e conservação.
      </p>

      <h2 className="mt-8 text-xl font-semibold">Por que contar ovos</h2>
      <p className="mt-2">
        A contagem de ovos mede fecundidade, sucesso reprodutivo e efeitos de tratamentos
        experimentais. Contar manualmente centenas de ovos em turfa, fibra de coco ou areia é lento
        e sujeito a erro. O Rivulídeos AI acelera esse trabalho e mantém o pesquisador no controle
        de cada marcação.
      </p>

      <h2 className="mt-8 text-xl font-semibold">Como funciona</h2>
      <ol className="mt-2 list-decimal space-y-1 pl-6">
        <li>Abra uma foto do substrato (JPG, PNG ou WebP).</li>
        <li>Carregue o modelo de visão computacional incluído nas configurações.</li>
        <li>A IA detecta os ovos e marca cada um com uma caixa numerada.</li>
        <li>Confirme, rejeite, edite ou adicione marcações manuais.</li>
        <li>Exporte a imagem anotada (PNG) e os dados (JSON ou CSV) para análise.</li>
      </ol>

      <h2 className="mt-8 text-xl font-semibold">Para quem é</h2>
      <p className="mt-2">
        Pesquisadores de ictiologia, laboratórios de biologia, escolas, programas de conservação e
        criadores de killifish que precisam de contagens reprodutíveis e auditáveis.
      </p>

      <p className="mt-10">
        <Link to="/" className="font-medium text-primary underline">
          Começar a contar ovos agora
        </Link>
      </p>
    </main>
  );
}
