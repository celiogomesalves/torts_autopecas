# Guia de Contribuição — Torts Auto Peças (ERP)

## Índice

- [Setup Local](#setup-local)
- [Arquitetura do Projeto](#arquitetura-do-projeto)
- [Git Flow](#git-flow)
- [Convenções de Commit](#convenções-de-commit)
- [Processo de Release](#processo-de-release)
- [Padrões de Código](#padrões-de-código)

---

## Setup Local

### Pré-requisitos

- **Node.js** ≥ 18 (recomendado 20+)
- **Bun** (gerenciador de pacotes — `npm i -g bun`)
- **Git** ≥ 2.30
- Conta no **Supabase** com acesso ao projeto

### Instalação

```bash
# 1. Clonar o repositório
git clone https://github.com/celiogomesalves/torqueautopecas.git
cd torqueautopecas

# 2. Checkout para develop (sempre trabalhe a partir de develop)
git checkout develop

# 3. Instalar dependências
bun install

# 4. Configurar variáveis de ambiente
cp .env.example .env
# Edite .env com as credenciais do Supabase

# 5. Iniciar em modo desenvolvimento
bun run dev
```

---

## Arquitetura do Projeto

```
├── src/
│   ├── components/       # Componentes reutilizáveis (UI + negócio)
│   │   └── ui/           # shadcn/ui primitives (não editar)
│   ├── hooks/            # Custom React hooks
│   ├── integrations/     # Supabase client e tipos
│   ├── lib/              # Utilitários, DB queries, formatação
│   ├── routes/           # Páginas (TanStack Router file-based)
│   │   ├── app.*.tsx     # Páginas autenticadas
│   │   ├── login.tsx     # Login
│   │   └── signup.tsx    # Cadastro
│   ├── styles.css        # Design system (oklch tokens + Vibe Design)
│   └── router.tsx        # Configuração do TanStack Router
├── supabase/             # Migrations e edge functions
├── tailwind.config.ts    # Tailwind CSS v4 config (mínimo)
└── vite.config.ts        # Vite + Cloudflare Workers
```

### Stack

| Camada | Tecnologia |
|--------|-----------|
| Frontend | React 19 + TypeScript |
| Router | TanStack Router (file-based) |
| State | TanStack Query (server state) |
| UI | shadcn/ui + Radix primitives |
| Styling | Tailwind CSS v4 + CSS puro (oklch) |
| Backend | Supabase (Postgres + Auth + Realtime) |
| Deploy | Cloudflare Workers (Wrangler) |

---

## Git Flow

### Branches

| Branch | Finalidade | Proteção |
|--------|-----------|----------|
| `main` | **Produção** — código estável, releases taggeadas | Protegida (merge via PR) |
| `develop` | **Integração** — base para features | Semi-protegida |
| `feature/*` | Novas funcionalidades | Temporária |
| `fix/*` | Correções de bugs | Temporária |
| `hotfix/*` | Correções urgentes em produção | Temporária |

### Workflow

```
main ─────────────────────────────────────── (produção)
  │                                    ▲
  └─ develop ───────────────────── merge ──
       │         ▲        ▲
       ├─ feature/nova-venda ──┘        │
       └─ fix/corrigir-estoque ─────────┘
```

1. **Criar feature branch** a partir de `develop`:
   ```bash
   git checkout develop
   git pull origin develop
   git checkout -b feature/minha-feature
   ```

2. **Desenvolver e commitar** seguindo as convenções abaixo.

3. **Push e Pull Request** para `develop`:
   ```bash
   git push origin feature/minha-feature
   # Abrir PR no GitHub: feature/* → develop
   ```

4. **Code review** → Merge → Deletar branch.

---

## Convenções de Commit

Seguimos [Conventional Commits](https://www.conventionalcommits.org/):

```
<tipo>(<escopo>): <descrição curta>

[corpo opcional]

[footer opcional]
```

### Tipos

| Tipo | Quando usar |
|------|------------|
| `feat` | Nova funcionalidade |
| `fix` | Correção de bug |
| `chore` | Manutenção (deps, scripts, configs) |
| `docs` | Documentação |
| `style` | Formatação, CSS (sem alteração de lógica) |
| `refactor` | Refatoração sem alterar comportamento |
| `perf` | Melhoria de performance |
| `test` | Testes |

### Exemplos

```
feat(vendas): adicionar filtro por período no histórico
fix(estoque): corrigir cálculo de estoque mínimo
chore(deps): atualizar supabase-js para v2.106
docs: atualizar CONTRIBUTING.md com padrão de commits
style(dashboard): aplicar gradient-text no título
refactor(db): extrair queries de payables para módulo separado
```

---

## Processo de Release

### Versionamento (SemVer)

- **MAJOR** (v2.0.0): Mudanças breaking (ex: nova arquitetura de auth)
- **MINOR** (v1.1.0): Novas features sem breaking (ex: módulo delivery)
- **PATCH** (v1.0.1): Bugfixes

### Passos

1. Garantir que `develop` está estável:
   ```bash
   bun run build   # Zero erros
   bun run lint    # Sem warnings críticos
   ```

2. Merge `develop` → `main` via PR no GitHub.

3. Criar tag e release:
   ```bash
   git checkout main
   git pull origin main
   git tag -a v1.x.x -m "Release v1.x.x: <descrição>"
   git push origin v1.x.x
   ```

4. Criar Release Notes no GitHub com changelog.

---

## Padrões de Código

### TypeScript

- Sempre usar tipos explícitos em props de componentes
- Preferir `interface` sobre `type` para props
- Evitar `any` — usar `unknown` quando necessário
- Usar `const` por padrão, `let` apenas quando necessário

### React

- Componentes: `PascalCase` (ex: `MetricCard.tsx`)
- Hooks: `camelCase` com prefixo `use` (ex: `useBranding.ts`)
- Queries: chave como `["entity", id]` (ex: `["products", cid]`)

### CSS / Design System

- **Nunca alterar** variáveis oklch existentes em `:root`
- Novas utilities vão no bloco `VIBE DESIGN SYSTEM` em `styles.css`
- Usar classes utilitárias existentes: `.bg-glass`, `.glow-card-*`, `.glass-panel`
- Cores sempre via tokens: `text-brand-red`, `bg-brand-orange/10`, etc.
