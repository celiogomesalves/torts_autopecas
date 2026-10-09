import { createFileRoute, Link } from "@tanstack/react-router";
import { ShieldCheck, Lock, Database, UserCheck, Mail } from "lucide-react";

export const Route = createFileRoute("/confianca")({
  head: () => ({
    meta: [
      { title: "Confiança e Segurança • AutoPeças ERP" },
      {
        name: "description",
        content:
          "Como o AutoPeças ERP protege seus dados: autenticação, isolamento por empresa, privacidade e contato de segurança.",
      },
      { property: "og:title", content: "Confiança e Segurança • AutoPeças ERP" },
      {
        property: "og:description",
        content:
          "Como o AutoPeças ERP protege seus dados: autenticação, isolamento por empresa, privacidade e contato de segurança.",
      },
      { name: "twitter:title", content: "Confiança e Segurança • AutoPeças ERP" },
      {
        name: "twitter:description",
        content:
          "Como o AutoPeças ERP protege seus dados: autenticação, isolamento por empresa, privacidade e contato de segurança.",
      },
    ],
  }),
  component: TrustPage,
});

function Section({
  icon: Icon,
  title,
  children,
}: {
  icon: typeof ShieldCheck;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border bg-card p-6 shadow-sm">
      <div className="flex items-center gap-3">
        <div className="size-10 rounded-lg bg-brand-red/10 text-brand-red flex items-center justify-center">
          <Icon className="size-5" />
        </div>
        <h2 className="text-lg font-semibold">{title}</h2>
      </div>
      <div className="mt-3 text-sm text-muted-foreground space-y-2">{children}</div>
    </section>
  );
}

function TrustPage() {
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b">
        <div className="max-w-4xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link to="/" className="font-bold text-lg">
            AutoPeças <span className="text-brand-orange">ERP</span>
          </Link>
          <Link to="/login" className="text-sm text-muted-foreground hover:text-foreground">
            Entrar
          </Link>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-10 space-y-8">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Confiança e Segurança</h1>
          <p className="mt-3 text-sm text-muted-foreground">
            Esta página é mantida pelos responsáveis do AutoPeças ERP para responder dúvidas
            frequentes sobre segurança e privacidade da plataforma. O conteúdo descreve controles
            atualmente habilitados no produto e não constitui certificação independente.
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <Section icon={UserCheck} title="Autenticação e acesso">
            <p>
              Acesso por e-mail e senha gerenciados pelo Supabase Auth. Cada usuário só visualiza
              dados das empresas em que possui vínculo aprovado.
            </p>
            <p>
              Papéis por empresa (admin, gerente, vendedor, estoquista) limitam ações sensíveis.
              Usuários bloqueados perdem acesso imediato.
            </p>
          </Section>

          <Section icon={Database} title="Isolamento de dados">
            <p>
              Todos os dados de operação (vendas, estoque, clientes, financeiro) ficam isolados
              por empresa via Row-Level Security no banco PostgreSQL.
            </p>
            <p>
              Tokens e códigos sensíveis (convite, integrações) não são expostos ao cliente —
              somente via chamadas autorizadas a funções específicas no servidor.
            </p>
          </Section>

          <Section icon={Lock} title="Transporte e criptografia">
            <p>
              Todo o tráfego entre o navegador e os servidores trafega por HTTPS/TLS. Senhas são
              armazenadas com hash pelo provedor de autenticação.
            </p>
            <p>
              Chaves de serviço e segredos de integração ficam apenas no ambiente de servidor,
              nunca no código entregue ao navegador.
            </p>
          </Section>

          <Section icon={ShieldCheck} title="Responsabilidades compartilhadas">
            <p>
              A plataforma fornece os controles técnicos (RLS, papéis, logs). Cabe ao
              administrador de cada empresa convidar apenas usuários confiáveis, manter senhas
              fortes e revogar acessos quando colaboradores saem.
            </p>
          </Section>
        </div>

        <Section icon={Mail} title="Contato de segurança">
          <p>
            Encontrou uma vulnerabilidade ou tem dúvidas sobre o tratamento dos seus dados? Entre
            em contato com o administrador da sua empresa no AutoPeças ERP. Ele encaminhará o
            relato pelos canais oficiais de suporte.
          </p>
          <p className="text-xs">
            Esta página é conteúdo editável mantido pelo responsável do app e não representa
            certificação independente.
          </p>
        </Section>

        <footer className="text-center text-xs text-muted-foreground pt-4">
          © {new Date().getFullYear()} AutoPeças ERP
        </footer>
      </main>
    </div>
  );
}
