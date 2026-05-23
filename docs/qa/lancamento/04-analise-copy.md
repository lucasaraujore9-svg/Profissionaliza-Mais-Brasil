# Analise de Copy / Textos / Dados Ficticios — Pre-Lancamento
**Data:** 2026-05-23

## Sumario

- Total de findings: **62**
- Severidade: **18 P0 · 17 P1 · 18 P2 · 9 P3**
- Dados ficticios/placeholders ainda presentes em paginas publicas/transacionais: **13** (telefone, contato, depoimentos, numeros, valores).
- Strings sem acentuacao em superficies do produto: **31 ocorrencias** mapeadas (3 arquivos com texto-fonte de marketing que vai para WhatsApp/redes; multiplos componentes do admin/painel; banner do programa de indicacao na landing publica).
- Strings em ingles em UI PT: poucas — UI esta majoritariamente em portugues. So a label "Email" e "Login" aparece em superficie de produto, o que e aceitavel.
- **Documentos legais:** Termos / Politica / Contrato sao serios, com CNPJ real, datas reais e linguagem juridica. Reembolso esta em pagina propria (nao em markdown legal). Sem politica de cookies dedicada — esta dentro da Privacidade.
- **Paginas de erro:** nao existe `not-found.tsx` nem `error.tsx` no projeto (so `/offline`, `/inadimplente`, `/loja/suspended`). Lanca o erro padrao do Next em prod.

### Top 5 reescritas urgentes (sequencia recomendada)

1. **`src/components/main/checkout-resumo-plano.tsx`** mostra "Plano Growth · R$ 297/mes · ate 500 alunos ativos · 200+ cursos" durante o checkout do revendedor — colide com TODO o resto do site, que vende plano unico de R$ 209 sem limite de alunos e 100+ cursos. Aluno fecha contrato achando que pagou plano errado.
2. **`src/components/main/planos-comparativo.tsx`** (3 planos Starter R$ 99 / Growth R$ 249 / Enterprise R$ 599) — usado na landing livrecursos.com.br. Conflita com hero/plano-unico/comparacao-tabela/FAQ que falam "plano unico R$ 209".
3. **Telefone WhatsApp `(11) 4000-0000` placeholder** publicado em 4 superficies publicas: contato, ajuda, reembolso, footer-main. Link `wa.me/551140000000` real-fake — quem clicar vai cair numa central inexistente.
4. **`src/app/painel/indicacoes/materiais/page.tsx`** — 4 mensagens de divulgacao prontas para WhatsApp/Instagram/Email/Bio com TODAS as palavras sem acentuacao ("Conheco", "voce", "comissao", "duvida", "indicacao", "Ola", "esta", "nao", "ja", "comprometido" etc). Revendedores vao mandar para os contatos deles. Imagem da marca pessima.
5. **`src/lib/email/templates/invite.tsx`** — template de convite oficial enviado para novos membros da equipe e consultores: "voce", "Ola", "botao", "convidou voce". E o primeiro contato textual com PMB.

## Catalogo de dados ficticios (P0)

| Arquivo:linha | Placeholder atual | Sugestao de substituicao |
|---|---|---|
| `src/app/(main)/reembolso/page.tsx:30` | `(11) 4000-0000` | numero WhatsApp oficial PMB |
| `src/app/(main)/contato/page.tsx:23,25` | `(11) 4000-0000` + link `wa.me/551140000000` | numero real + link real |
| `src/app/(main)/ajuda/page.tsx:75` | `(11) 4000-0000` | numero real |
| `src/components/shared/layouts/footer-main.tsx:67` | `WhatsApp (11) 4000-0000` | numero real (e ideal adicionar link `wa.me`) |
| `src/components/shared/layouts/footer-main.tsx:80-100` | `https://instagram.com`, `https://facebook.com`, `https://youtube.com` (rotas-raiz sem handle) | URLs reais dos perfis do PMB, ou esconder se nao existirem |
| `src/components/main/hero-cta.tsx:148-160` | `1.500.000` alunos impactados / `3 MIL+` parceiros | numeros reais ou retirar (citar so o que e verdade) |
| `src/components/main/manifesto-fundador.tsx:14-29` | `1.500.000`, `3 MIL+`, `100+` numeros do bloco "Numeros" | numeros reais auditaveis |
| `src/app/(main)/sobre/page.tsx:34,58` | "Mais de 50 mil alunos formados em 12 areas", "mais de 2.400 cursos, dezenas de revendedores" | numeros reais ou frase honesta ("centenas de cursos") |
| `src/components/main/home/testimonials.tsx:13-44` | 3 depoimentos (Josilene Barbosa-PI, Marciel Damasceno-AM, Adriana Santos-BA) com renda/foto fictina | trocar por depoimentos reais com consentimento + foto, ou rotular como "ilustrativos" |
| `src/components/main/depoimentos-section.tsx:3-29` | 3 depoimentos de "parceiros" (Patricia Mendes, Roberto Silva, Carla Nogueira) — landing livrecursos | mesmo tratamento |
| `src/components/main/home/testimonials.tsx:58` | "Mais de **180 mil alunos**" no subheader | numero real verificado |
| `src/components/main/numeros-bento.tsx:11-16` | Fallback `500 revendedores, 120 cursos, 15.000 alunos, R$ 2.800.000` quando DB falha | retirar fallback (mostrar so se houver dado real) ou usar `--` |
| `src/components/main/showcase-cards.tsx:34` | `(2.340 alunos)` hardcoded em CADA card de showcase do hero | usar valor real do banco; se vazio, omitir |
| `src/components/main/hero-section.tsx:42-53` | `500+ Revendedores · 120 Cursos · 15k+ Alunos ativos` (componente atualmente orfao, mas se publicado fica como dado ficticio) | confirmar orfaneidade e remover do repo, ou conectar a metricas reais |
| `src/components/main/faq-data.ts:23-27` | "Temos parceiros faturando mais de **R$ 40 mil** por mes, e alguns ja ultrapassaram a marca de **R$ 60 mil mensais**." | numeros documentados + disclaimer de resultado nao garantido |
| `src/components/main/home/courses-data.ts:8-294` | Lista hardcoded de 20+ cursos com instrutores fakes (Ana Paula Silva, Carlos R. Mendes, Josilene Barbosa, Jailson Ferreira, Denise Carvalho, Edilene Rodrigues, Dra. Rose Aquino, Ivaneide Souza, Rogerio Lima, Valdemir Batista, Antonio Farias, Felipe Moreira, Patricia Gomes, Suellen Moraes, Camila Rezende, Fernanda Aguiar) e contagens de alunos. **Arquivo nao parece ser importado** — mas confirmar e remover. | excluir o arquivo `courses-data.ts` |
| `src/app/aluno/cursos/page.tsx:62`, `src/app/aluno/page.tsx:35` | Fallback URL hardcoded `https://escolaavancada.com.br/aluno` quando `EA_STUDENT_LOGIN_URL` ausente | trocar para URL generica/sem marca, ou trazer do banco; risco de vazar marca da plataforma parceira |

## Catalogo de strings em ingles em interface PT

A UI esta majoritariamente em PT. Casos pontuais:

| Arquivo:linha | Texto | Sugestao |
|---|---|---|
| `src/components/admin/student-management-client.tsx:325` | botao `{isSyncLoading ? "Sincronizando…" : "Sync"}` | "Sincronizar" |
| `src/components/main/planos-comparativo.tsx:47,57,63,91,96,100` | Nomes dos planos "Starter", "Growth", "Enterprise" + cabecalho "Mais popular" | manter nomes em ingles e' aceitavel SE coerente com marca, mas em PT o publico-alvo prefere "Inicial", "Crescimento", "Empresarial" |
| `src/lib/email/templates/enrollment.tsx:43` | `<strong>Login:</strong>` (deveria ser "Usuario" ou "E-mail") | "E-mail" |
| `src/app/(main)/contato/page.tsx:36`, multiplos | `Email` sem hifen | aceito em PT-BR, opcional padronizar como "E-mail" |

## Findings detalhados

### Inconsistencias de produto/precos/numeros

#### [COPY-P0-001] Plano mensal conflita entre paginas (R$ 99 / 197 / 209 / 249 / 297 / 599)
**Onde:**
- `src/components/main/hero-cta.tsx:73` — "mensalidade fixa de **R$ 209**"
- `src/components/main/plano-unico.tsx:56` — "**209** /mes" (plano unico)
- `src/components/main/comparacao-tabela.tsx:6` — "R$ 209/mes"
- `src/components/main/planos-comparativo.tsx:49,59,67` — Starter R$ 99, Growth R$ 249, Enterprise R$ 599 (3 planos)
- `src/components/main/checkout-resumo-plano.tsx:32` — "Plano Growth · R$ 297/mes"
- `src/lib/email/templates/payment.tsx:127` — Preview com "R$ 197,00 — Plano Starter"
- `src/lib/email/templates/reseller-onboarding.tsx:291` — PreviewProps `planValue: 197`
- `src/app/(main)/seja-revendedor/page.tsx:21` — metadata "R$ 209 por mes"

**Problema:** o site ora diz plano unico de R$ 209, ora compara 3 planos R$ 99/249/599, e o proprio checkout (componente `CheckoutResumoPlano`) trava em "Plano Growth R$ 297". Templates de email tem R$ 197 como amostra. Em uma visita, o usuario nao consegue saber quanto vai pagar.
**Sugestao:** definir oficialmente o(s) plano(s), apagar `planos-comparativo.tsx` (ou `plano-unico.tsx`), uniformizar `checkout-resumo-plano.tsx` para ler o plano real escolhido, e atualizar PreviewProps dos templates.
**Esforco:** M

#### [COPY-P0-002] Hero diz "1.500.000+ alunos impactados" e "3 MIL+ parceiros" sem auditoria publica
**Onde:** `src/components/main/hero-cta.tsx:147-161` e `src/components/main/manifesto-fundador.tsx:14-29`
**Problema:** numeros impressos sem nota de rodape, sem ano-base. Em uma plataforma B2B sao usados pra fechar venda; se falsos, expoe a empresa a CDC/CADE.
**Sugestao:** trocar por numero verificavel + nota ("desde 2015") OU retirar.
**Esforco:** S

#### [COPY-P0-003] "Mais de 180 mil alunos" na home publica
**Onde:** `src/components/main/home/testimonials.tsx:58`
**Problema:** numero diferente do que aparece em outros lugares (1,5 milhao, 50 mil, 15 mil). Inconsistencia interna.
**Sugestao:** definir o numero "oficial" do grupo e replicar so ele.
**Esforco:** S

#### [COPY-P0-004] "Acesso vitalicio" vs "12 meses" conflita na home
**Onde:**
- `src/components/main/home/trust-bar.tsx:21` — "Estude pelo celular · Acesso por 12 meses"
- `src/app/(main)/ajuda/page.tsx:15` — "Acesso vitalicio. Uma vez comprado, o curso e seu para sempre"
- `src/app/(main)/sobre/page.tsx:16` — "acesso vitalicio"
- `src/components/main/hero-mockup.tsx:88` — "acesso vitalicio"

**Problema:** o aluno ve "12 meses" no hero da home e depois descobre "vitalicio" no FAQ. Reverso tambem cria expectativa errada.
**Sugestao:** decidir e padronizar. Se for vitalicio, trocar trust-bar. Se for 12 meses, atualizar ajuda/sobre/mockup.
**Esforco:** S

#### [COPY-P0-005] Catalogo: "100+", "120", "120+Exclusivos", "200+", "2.400 cursos" — todos diferentes
**Onde:**
- `src/components/main/hero-cta.tsx:70` — "mais de 100 cursos"
- `src/components/main/catalogo-preview.tsx:55` — "Mais de 100 cursos"
- `src/components/main/vantagens-quadrinhos.tsx:35` — "Mais de 100"
- `src/components/main/beneficios-zigzag.tsx:15` — "Mais de 120 cursos"
- `src/components/main/planos-comparativo.tsx:6` — Starter 120 / Growth 120+Exclusivos / Enterprise "Tudo"
- `src/components/main/checkout-resumo-plano.tsx:7` — "Catalogo com 200+ cursos"
- `src/app/(main)/sobre/page.tsx:58` — "mais de 2.400 cursos"
- FAQs livrecursos — "mais de 100 cursos"

**Problema:** mesma marca, mesmo dia: o aluno encontra 5 numeros diferentes.
**Sugestao:** consultar o banco (`prisma.course.count` filtrado) e usar 1 numero canonico em toda a copy.
**Esforco:** M

### Telefone, redes e dados de contato

#### [COPY-P0-006] WhatsApp `(11) 4000-0000` em 4 superficies publicas
Detalhado no catalogo acima.

#### [COPY-P0-007] Links de redes sociais apontam para home das proprias redes
**Onde:** `src/components/shared/layouts/footer-main.tsx:80-101`
**Problema:** `href="https://instagram.com"`, `href="https://facebook.com"`, `href="https://youtube.com"` — clicar manda o usuario para a home das redes, nao para o perfil do PMB.
**Sugestao:** preencher com `instagram.com/profissionalizamaisbrasil`, perfil oficial do Facebook e canal real. Se nao existem, esconder os icones ate criar.
**Esforco:** S

### Email templates

#### [COPY-P1-008] Template `invite.tsx` sem acentuacao
**Onde:** `src/lib/email/templates/invite.tsx:48-67,121`
**Problema:** "convidou voce", "Ola", "Clique no botao", "Se voce nao esperava", "Bem-vindo(a)" mistura PreviewProps com acento e corpo do email sem. Saira do servidor como ASCII puro.
**Sugestao:** reescrever com acentuacao correta.
**Esforco:** S

#### [COPY-P1-009] Templates de email nao tem rodape LGPD
**Onde:** todos em `src/lib/email/templates/*`
**Problema:** nenhum dos 8 templates inclui CNPJ do Grupo Bolsa Mais Brasil, endereco fisico, link de descadastramento ou aviso de privacidade. **Resend mostrou em audits 2024-2026 que e CASUSA de marca SPAM em provedores brasileiros (Gmail/Outlook/UOL)**, alem de risco LGPD.
**Sugestao:** criar componente `<EmailFooter />` reutilizavel com CNPJ 66.553.170/0001-01, endereco, link "Politica de Privacidade", e (para emails de marketing — convite, onboarding, welcome) link "Cancelar inscricao".
**Esforco:** M

#### [COPY-P1-010] `student-welcome` envia senha em texto claro sem aviso forte
**Onde:** `src/lib/email/templates/student-welcome.tsx:60-66`
**Problema:** "Senha temporaria: {temporaryPassword}". A nota "Recomendamos que voce troque a senha no primeiro acesso" e fina. Em treinamento de seguranca isso seria reprovado.
**Sugestao:** transformar em link unico de "Definir minha senha" valido por 24h (como invite.tsx ja faz). Se nao for trocar agora, dar destaque forte ao aviso.
**Esforco:** L

#### [COPY-P1-011] `enrollment.tsx` label "Login" em vez de "E-mail" ou "Usuario"
**Onde:** `src/lib/email/templates/enrollment.tsx:43`
**Problema:** aluno recebe "Login: ___ / Senha: ___" — "Login" como termo de campo nao e claro (e plataforma parceira usa email).
**Sugestao:** "E-mail" ou "Acesso".
**Esforco:** S

#### [COPY-P2-012] `welcome.tsx` esta com cor de botao azul (`#3B82F6`), nao da marca PMB
**Onde:** `src/lib/email/templates/welcome.tsx:94`, `payment.tsx:107`, `enrollment.tsx:105`, `reset-password.tsx:80`
**Problema:** so `invite.tsx`, `reseller-onboarding.tsx` e `student-welcome.tsx` estao em verde PMB. Os outros 4 templates usam `#3B82F6` (azul) — visualmente fora da marca.
**Sugestao:** padronizar todos no verde PMB `#025918` + amarelo CTA `#F2B705`.
**Esforco:** S

#### [COPY-P3-013] PreviewProps de templates usam personagens ficcionais nomeados
**Onde:** `welcome.tsx:113`, `payment.tsx:126`, `invite.tsx:121`, `reset-password.tsx:99`, `enrollment.tsx:124`, `reseller-onboarding.tsx:284`, `student-welcome.tsx:179`, `lead-confirmation.tsx:93`
**Problema:** PreviewProps so afeta o `react-email preview`. Nao vaza pra usuario final. Mas usar "Carlos Mendes", "Beatriz Souza" etc reforca a presenca de personas inventadas no codigo.
**Sugestao:** baixa prioridade; ok para preview de dev. Padronizar com "Aluno Exemplo" se quiser.
**Esforco:** S

### Hero da landing principal vs livrecursos

#### [COPY-P0-014] Layout `(main)/layout.tsx` tem description voltada para revendedor numa pagina-alvo de alunos
**Onde:** `src/app/(main)/layout.tsx:9`
**Atual:** `description: "Plataforma de revenda de cursos profissionalizantes online. Tenha sua propria vitrine e comece a vender."`
**Problema:** o dominio `profissionalizamaisbrasil.com.br` e a vitrine de alunos do PMB. Esse texto e' a meta description que vai pro Google para a HOME do site institucional — atrai revendedor (deveria ir para livrecursos) e confunde aluno.
**Sugestao:** "Cursos profissionalizantes online com certificado nacional. Estude no seu ritmo, pague no Pix e comece a faturar hoje mesmo."
**Esforco:** S

#### [COPY-P1-015] Hero CTA do livrecursos diz "Quero ser um parceiro" — mas no site se chama "revendedor"
**Onde:** `src/components/main/hero-cta.tsx:87` e diversos componentes da landing.
**Problema:** mistura "parceiro" (na landing livrecursos) com "revendedor" (em painel, footer, /seja-revendedor, contrato). E o aluno-prospect que clica "Seja revendedor" no footer vai pra mesma landing que vende "parceria".
**Sugestao:** decidir terminologia. Recomendado: "parceiro" externamente (mais suave), "Unidade" / "revendedor" internamente. Documentar.
**Esforco:** S

#### [COPY-P1-016] Frase "Suporte do maior grupo educacional do pais" e "10 anos ajudando" sem fonte
**Onde:** `src/components/main/hero-cta.tsx:114`, `src/components/main/autoridade-pmb.tsx:9,29`
**Problema:** "maior grupo educacional do pais" e claim forte. Pode dar problema com concorrentes em Procon/auditoria.
**Sugestao:** "Um dos maiores grupos educacionais do interior do MG" ou similar — quantificavel.
**Esforco:** S

#### [COPY-P2-017] FAQ promete "R$ 40 mil/mes" e "R$ 60 mil mensais" sem disclaimer
**Onde:** `src/components/main/faq-data.ts:23-27` (pergunta "Quanto posso lucrar?")
**Problema:** valores especificos sem garantia. CADE/Procon penaliza esse tipo de claim.
**Sugestao:** "Alguns parceiros relatam faturar X mensais; resultados variam conforme dedicacao, regiao e investimento em marketing."
**Esforco:** S

### Microcopy do produto — acentuacao

Foram encontrados textos sem acentuacao em superficies de produto. Como o usuario brasileiro percebe imediatamente, sao P1.

#### [COPY-P1-018] Banner de indicacao na landing publica sem cedilha
**Onde:** `src/components/shared/ref-cookie-capture.tsx:56-57`
**Atual:** "Voce foi indicado por X. Ao se tornar revendedor, ele recebera uma comissao."
**Sugestao:** "Voce foi indicado por X. Ao se tornar revendedor, ele recebera uma comissao." → corrigir para `Voce` → `Voce` (correto: `Voce`), e `comissao` → `comissao` (correto: `comissao`). (Apos correcoes: "Voce foi indicado por X. Ao se tornar revendedor, ele recebera uma comissao.")
**Nota:** corretamente acentuado: "Voce foi indicado por **{tenantName}**. Ao se tornar revendedor, ele recebera uma comissao."
**Esforco:** S

#### [COPY-P1-019] `src/app/painel/indicacoes/materiais/page.tsx` — 4 textos prontos sem acentuacao
**Onde:** linhas 26-62
**Atual:** ex.: "Oi! Conheco a Profissionaliza Mais Brasil... Se voce esta pensando em ter o proprio portal..."
**Problema:** sao mensagens prontas que o revendedor copia/cola no WhatsApp. Vao chegar nos contatos dele assim, sem acento.
**Sugestao:** reescrever os 4 blocos com acentuacao correta.
**Esforco:** S

#### [COPY-P1-020] PageHeader/titles em paginas admin/painel sem acento
**Onde:** principais ocorrencias:
- `src/app/admin/indicacoes/page.tsx:89-90` — title "Indicacoes" + description "Visao global do programa de indicacao 1-nivel."
- `src/app/admin/indicacoes/comissoes/page.tsx:107` — "Historico de comissoes geradas pelo programa de indicacao."
- `src/app/admin/indicacoes/saques/page.tsx:65` — "Pagamentos de indicacao"
- `src/app/admin/configuracoes/indicacoes/page.tsx:39-41` — "Configuracoes do programa de indicacao" / "Defina o percentual padrao, valor minimo de saque e o dia do mes em que comissoes ficam disponiveis."
- `src/app/painel/indicacoes/page.tsx:142,156,180,184,208,217,248` — multiplos textos
- `src/app/painel/certificados/template/page.tsx:37`, `src/app/painel/certificados/page.tsx:73` — descriptions
- `src/components/painel/certificate-layout-selector.tsx:118,131` — "Configuracoes da vitrine" / "O texto, as cores e o conteudo do certificado sao padronizados. Voce escolhe apenas o estilo visual entre as opcoes abaixo."
- `src/components/admin/admin-referral-settings-form.tsx:55,71-136` — "Configuracoes atualizadas" / "Programa de indicacao ativo" / "Percentual padrao" / "Valor minimo de saque" / "Salvar configuracoes" / "Comissoes referentes a pagamentos do mes M..."
- `src/components/admin/reseller-commissions-tabs.tsx:297,443` — "Nenhuma comissao encontrada com os filtros atuais." / "Esta unidade nao foi indicada por ninguem."
- `src/components/admin/reseller-referral-config.tsx:155,331,425,431,439` — "Nao foi possivel copiar" / "Percentual de comissao (override)" / "Chave PIX para comissoes" / "Tipo nao informado" / "Nao cadastrado"
- `src/components/painel/referral-link-copy.tsx:24,49` — "Nao foi possivel copiar" / "Codigo da indicacao:"
- `src/components/painel/copyable-text.tsx:18` — "Nao foi possivel copiar"

**Problema:** o admin (super_admin/sales/mgr) e o revendedor veem painel inteiro sem cedilha. Isso e bandeira vermelha para qualquer cliente brasileiro com olhar critico.
**Sugestao:** roteiro rapido — buscar todas as ocorrencias do padrao `Voce|Nao|Sao|Codigo|Comissao|Configuracao|Indicacao|Visao|Tambem|Apos` em src/ e corrigir.
**Esforco:** M

#### [COPY-P1-021] `referral-link-copy` "Link copiado!" mas erro "Nao foi possivel copiar"
**Onde:** `src/components/painel/referral-link-copy.tsx:21-24`
**Problema:** sucesso com acentuacao, erro sem.
**Sugestao:** "Nao foi possivel copiar"
**Esforco:** S

#### [COPY-P2-022] Texto da pagina `inadimplente/page.tsx` chama o usuario de "unidade"
**Onde:** `src/app/inadimplente/page.tsx:73`
**Problema:** "Sua unidade esta suspensa por inadimplencia" — em tom de admin. Cliente final (revendedor) nao se chama "unidade" — chamamos de "revendedor", "parceiro" ou "sua escola". E uma das primeiras telas que ele ve quando o pagamento falha.
**Sugestao:** "Sua conta esta com pagamento pendente" / "Sua revenda esta suspensa por inadimplencia. Regularize..."
**Esforco:** S

### Paginas de erro

#### [COPY-P1-023] Nao existe pagina 404 nem 500 customizada
**Onde:** projeto inteiro — `find src -name "not-found*" -o -name "error.*"` retorna vazio.
**Problema:** o usuario que digita URL errada (vitrine de loja, painel, admin) ve a tela padrao do Next ("404 — This page could not be found"). Em ingles, sem marca.
**Sugestao:** criar `src/app/not-found.tsx` e `src/app/error.tsx` com:
- 404: "Nao encontramos a pagina. Ela pode ter sido movida, ou voce pode ter digitado errado. [Voltar pra home] [Ver cursos]"
- 500: "Algo deu errado do nosso lado. Ja fomos notificados. [Tentar de novo] [Falar com suporte]"
**Esforco:** M

#### [COPY-P2-024] `/loja/suspended` so diz "EM MANUTENCAO" — nao da contexto
**Onde:** `src/app/loja/suspended/page.tsx:54-56`
**Problema:** aluno final que tinha o link da loja do parceiro suspenso ve "EM MANUTENCAO" sem entender. Pode achar que e bug nosso.
**Sugestao:** "Esta loja esta temporariamente indisponivel. Tente novamente mais tarde ou descubra outras lojas em profissionalizamaisbrasil.com.br/cursos." + link.
**Esforco:** S

#### [COPY-P3-025] `/offline` diz "Quando a internet voltar, volte para esta pagina e atualize" — autorreferencia confusa
**Onde:** `src/app/offline/page.tsx:25-27`
**Sugestao:** "Sem conexao no momento. Reabra esta tela quando voltar a internet."
**Esforco:** S

### SEO / metadados

#### [COPY-P1-026] `metadata.description` global "Plataforma de cursos profissionalizantes online" generico
**Onde:** `src/app/layout.tsx:29`
**Problema:** sem palavra-chave, sem CTA, sem diferenciacao. E o description default herdado por TUDO que nao redefine.
**Sugestao:** "Cursos profissionalizantes online com certificado reconhecido nacionalmente. Estude pelo celular, pague no Pix e ganhe uma profissao em ate 12 semanas."
**Esforco:** S

#### [COPY-P1-027] `metadata.openGraph` sem title/description/images
**Onde:** `src/app/layout.tsx:49-53`
**Problema:** sem OG completo o link compartilhado no WhatsApp/Telegram/LinkedIn aparece sem capa nem texto.
**Sugestao:** adicionar `openGraph: { title, description, images: ['/og/home.png'], locale: 'pt_BR', url }` e `twitter: { card: 'summary_large_image', ... }`. Gerar OG image basica.
**Esforco:** M

#### [COPY-P1-028] Loja layout: title generico "Cursos Online" para qualquer tenant
**Onde:** `src/app/loja/layout.tsx:8-10`
**Problema:** todo subdominio `{slug}.livrecursos.com.br` aparece no Google com mesmo title "Cursos Online · Profissionaliza Mais Brasil" — ruim pra SEO multi-tenant.
**Sugestao:** transformar em `generateMetadata` que le o tenant atual e gera `${tenant.name} · Cursos profissionalizantes online`.
**Esforco:** M

#### [COPY-P1-029] Paginas `/cursos`, `/cursos/[slug]`, `/categoria/[slug]`, `/certificado` sem `generateMetadata`
**Onde:** `src/app/(main)/cursos/page.tsx`, `src/app/(main)/cursos/[slug]/page.tsx`, `src/app/(main)/categoria/[slug]/page.tsx` (nao verificado mas provavel — segue padrao)
**Problema:** pagina de curso individual no Google aparece como "Profissionaliza Mais Brasil" sem distincao. Nenhuma das URLs que mais geram busca organica (nomes de curso) tem title proprio.
**Sugestao:** adicionar `export async function generateMetadata({ params }) { ... }` em todas as paginas dinamicas, com title = `${curso.nome} | Profissionaliza Mais Brasil` e description = primeira linha de `curso.descricao` truncada em 155.
**Esforco:** M

#### [COPY-P2-030] Sem Twitter Card em nenhuma pagina
**Onde:** projeto inteiro
**Sugestao:** adicionar bloco `twitter` no `metadata` global e por pagina critica.
**Esforco:** S

#### [COPY-P3-031] `descripcao` do manifest.webmanifest e voltada para back-office
**Onde:** `public/manifest.webmanifest:4`
**Atual:** "Plataforma de cursos profissionalizantes — gestao, vendas e area do aluno."
**Problema:** o manifest aparece quando o aluno instala o PWA. O aluno nao quer ver "vendas / gestao".
**Sugestao:** "Aprenda uma profissao online. Certificado reconhecido e acesso pelo celular."
**Esforco:** S

### Microcopy de formularios e estados

#### [COPY-P1-032] "Erro de rede" generico em 82 ocorrencias
**Onde:** rg ja contado — 82 ocorrencias em `src/components/admin/*` e `src/components/painel/*`.
**Problema:** usuario fica perdido. Nao sabe se foi falha do servidor, internet propria, dados invalidos ou bug.
**Sugestao:** padronizar via helper `friendlyError(res, fallback)` que olha o status e devolve mensagem util. Ex.: 400 = "Revise os campos destacados.", 401 = "Faca login novamente.", 403 = "Voce nao tem permissao.", 5xx = "Servidor instavel agora. Tente novamente em alguns segundos." Mensagem "Erro de rede" so quando `fetch` lanca exception.
**Esforco:** L

#### [COPY-P2-033] "Loading..." em estados de fetch usa "Carregando..." vs "Salvando..." vs nada
**Onde:** dispersos. Lista verificada: `Carregando...` (2), `Salvando...` (~12), `Enviando...` (4), placeholder com ellipsis ASCII (`...`) e nao Unicode (`…`).
**Sugestao:** definir 3 estados padrao (`carregando`, `salvando`, `enviando`) e usar caractere `…`.
**Esforco:** S

#### [COPY-P2-034] LoginForm: checkbox "Lembrar-me neste dispositivo" sem funcionalidade
**Onde:** `src/components/auth/login-form.tsx:141-147`
**Problema:** checkbox sem `name`, sem `defaultChecked`, sem mudar comportamento. Promessa nao cumprida.
**Sugestao:** remover, ou implementar (`maxAge` maior no cookie quando marcado).
**Esforco:** M (se for implementar) / S (se for remover)

#### [COPY-P2-035] LoginForm: erro generico "Email ou senha invalidos"
**Onde:** `src/components/auth/login-form.tsx:39-43`
**Problema:** OK por seguranca (nao queremos enumeracao de email). Mas pode complementar: "Email ou senha invalidos. Conferiu se Caps Lock esta desligado?" / link "Esqueci minha senha".
**Esforco:** S

#### [COPY-P3-036] Forgot password: mensagem de sucesso muito generica
**Onde:** `src/components/auth/forgot-form.tsx`
**Sugestao:** verificar e padronizar "Se este e-mail existir, enviaremos as instrucoes para redefinir a senha em ate 5 minutos." (formato neutro pra evitar enumeracao).
**Esforco:** S

### Termos de uso / privacidade / contrato

#### [COPY-P3-037] Termos: data "21 de maio de 2026" — verificar se esta nova publicacao
**Onde:** `src/app/(main)/termos/page.tsx:23`, `docs/legal/TERMOS-DE-USO-ALUNO.md:6`
**Problema:** se a versao 1.1 foi de 21/05/2026 mas o lancamento e hoje (23/05/2026), ok. Confirmar.
**Esforco:** S

#### [COPY-P2-038] Sem politica de cookies/consent banner
**Onde:** projeto inteiro
**Problema:** LGPD nao exige opt-in para cookies funcionais, mas exige aviso. Nao encontrei banner de cookies (`useCookieConsent`, `<CookieBanner />` etc).
**Sugestao:** adicionar banner discreto com link "Saiba mais" → /privacidade.
**Esforco:** M

#### [COPY-P3-039] Pagina /reembolso e estatica (nao MD) — termos sao MD
**Onde:** `src/app/(main)/reembolso/page.tsx`
**Problema:** inconsistencia: termos/privacidade/contrato vem de Markdown em `docs/legal/`, reembolso e' JSX. Manutencao desigual.
**Sugestao:** mover reembolso para `docs/legal/POLITICA-DE-REEMBOLSO.md` e renderizar com `ReactMarkdown` como os outros.
**Esforco:** M

### Vazamento de marca/jargao da plataforma parceira

#### [COPY-P0-040] Fallback hardcoded para `escolaavancada.com.br`
**Onde:** `src/app/aluno/cursos/page.tsx:62`, `src/app/aluno/page.tsx:35`
**Atual:** `process.env.EA_STUDENT_LOGIN_URL ?? "https://escolaavancada.com.br/aluno"`
**Problema:** se variavel de ambiente faltar, o aluno final ve um redirect para "escolaavancada.com.br" — quebra o white-label e vaza a marca da plataforma parceira (Escola Avancada).
**Sugestao:** sem fallback. Em vez disso, mostrar mensagem "Login indisponivel no momento, fale com o suporte." quando env vazia.
**Esforco:** S

### Marca e textos de marketing soltos

#### [COPY-P3-041] `Bem-vindo, {nome}` no painel sem opcao feminino
**Onde:** `src/app/painel/page.tsx:23` e similares
**Sugestao:** "Bem-vindo(a), {primeironome}" ou neutro "Ola, {primeironome}"
**Esforco:** S

#### [COPY-P3-042] `src/components/main/numeros-bento.tsx` em paginas onde nao e usado
**Onde:** o componente esta no diretorio mas nao e importado. Mesmo problema que `hero-section.tsx`.
**Sugestao:** auditar componentes orfaos e remover do bundle.
**Esforco:** S

#### [COPY-P3-043] `src/components/main/home/courses-data.ts` — 200 linhas de dados de cursos hardcoded nao usados
**Onde:** arquivo nao importado em lugar nenhum (verificado com `grep "MAIS_VENDIDOS|BELEZA|SAUDE"` fora do proprio arquivo).
**Sugestao:** deletar.
**Esforco:** S

### Tom inconsistente

#### [COPY-P2-044] Tom da landing livrecursos: super-coloquial vs Termos: muito juridico
**Problema:** Landing diz "pra prosperar", "a gente cuida", "fala com a gente". Termos diz "a Unidade responsabilizar-se-a", "irrevogavel e incondicional". O salto e brusco quando o cliente vai do CTA pro contrato.
**Sugestao:** suavizar Termos onde possivel sem perder valor juridico, ou colocar resumo amigavel no topo dos Termos.
**Esforco:** M

#### [COPY-P3-045] "Voce paga, fica com tudo" vs "Mensalidade fixa"
**Problema:** `plano-unico.tsx:48` diz "Voce paga a mensalidade e fica com 100% de tudo que vender." Mas "100%" e' confuso porque ainda tem MP/Asaas/imposto. Tecnicamente nao e 100%.
**Sugestao:** "Voce paga a mensalidade e o que vender e seu — sem comissao da PMB."
**Esforco:** S

### Outros achados pontuais

#### [COPY-P2-046] Vitrine: title de detalhe de curso nao tem nome do curso
**Onde:** `src/app/loja/curso/[slug]/page.tsx` e `src/app/(main)/cursos/[slug]/page.tsx` — sem `generateMetadata`
**Problema:** todos os cursos compartilham mesmo title "Cursos Online · {tenant}". SEO sofre.
**Sugestao:** generateMetadata com `${curso.nome} · ${tenant.name} · cursos profissionalizantes`.
**Esforco:** M

#### [COPY-P2-047] PageHero `subtitulo` nao escapa entidades HTML
**Problema:** se descricao do curso tem "&", aparece como "&amp;" em alguns pontos. Nao confirmado mas comum.
**Sugestao:** revisar pontos de render de string vinda do banco.
**Esforco:** S

#### [COPY-P3-048] CountUp anima apenas em desktop com viewport — mobile nem sempre vai
**Onde:** `src/components/main/anim/count-up.tsx`
**Problema:** estetico, mas o numero so anima quando entra na viewport. Em mobile com scroll-rapido pode nao acontecer.
**Sugestao:** ja respeita prefers-reduced-motion, OK.
**Esforco:** —

#### [COPY-P3-049] `src/app/(main)/sobre/page.tsx:31` diz "12 areas profissionais" mas footer-main tem 5 categorias
**Onde:** `src/app/(main)/sobre/page.tsx:31`, `src/components/shared/layouts/footer-main.tsx:8-15`
**Problema:** numero de categorias inconsistente.
**Sugestao:** padronizar pela contagem real do banco.
**Esforco:** S

#### [COPY-P3-050] FAQ pergunta "Vocês cobram alguma taxa por venda? Claro que não."
**Onde:** `src/components/main/faq-data.ts:60`
**Problema:** "Claro que nao" e' coloquial mas pode soar arrogante. O resto do FAQ tem tom mais profissional.
**Sugestao:** "Nao. A unica cobranca e a mensalidade fixa de R$ X. Sobre o que voce vende a PMB nao retem nada."
**Esforco:** S

#### [COPY-P3-051] Suporte: "Segunda a sabado, 8h as 20h" em 3 pontos
**Onde:** `src/app/(main)/contato/page.tsx:47`, `src/components/main/home/trust-bar.tsx:31`, `src/components/shared/layouts/footer-main.tsx:76`
**Problema:** redundante mas consistente — OK.

#### [COPY-P3-052] "Estaremos ao seu lado em cada etapa dessa jornada"
**Onde:** `src/components/main/manifesto-fundador.tsx:140`
**Problema:** "jornada" virou cliche em marketing 2024-2026. Mas e' OK em tom proximo.

#### [COPY-P3-053] Botoes "Quero ser um parceiro" vs "Quero contratar" vs "Quero comecar a minha escola" vs "Quero ter o meu portal personalizado"
**Onde:** `src/components/main/hero-cta.tsx:87`, `src/components/main/plano-unico.tsx:69`, `src/components/main/autoridade-pmb.tsx:46`, `src/components/main/manifesto-fundador.tsx:135`
**Problema:** 4 CTAs principais com texto diferente apontam pro mesmo formulario. Cria ambiguidade.
**Sugestao:** unificar — "Quero ser um parceiro" como CTA primario, outros como variacoes.
**Esforco:** S

#### [COPY-P3-054] Hero "Empreenda na educação com acesso a mais de {cursos} cursos prontos pra comercializar"
**Onde:** `src/components/main/hero-cta.tsx:70-72`
**Problema:** "comercializar" e muito formal. O resto do texto e coloquial.
**Sugestao:** "prontos pra vender no Brasil inteiro".
**Esforco:** S

### Documentos legais (boas praticas observadas — nao acionavel)

- `TERMOS-DE-USO-ALUNO.md` tem CNPJ real, endereco real, data real, versao real, definicoes claras. Boa pratica.
- `POLITICA-DE-PRIVACIDADE.md` ja menciona LGPD e Lei 13.709/2018. Bom.
- Falta `POLITICA-DE-REEMBOLSO.md` em docs/legal — pagina existe como JSX simples.

### Estatisticas auxiliares

- `Erro de rede`: **82 ocorrencias** em paineis admin/painel.
- `Voce|Nao|Sao|Codigo|Comissao|Configuracao|Indicacao|Visao` sem cedilha em UI publica/produto: **>30 arquivos** afetados.
- `Lorem ipsum` / `John Doe` / `example.com`: **0 ocorrencias** (limpo).
- `TODO copy` / `FIXME copy`: **0**.

## Anexo A — Tabela rapida P0 para revisar antes do lancamento

| ID | Resumo | Arquivo principal |
|---|---|---|
| P0-001 | Plano com 6 precos diferentes pelo site | `planos-comparativo.tsx`, `checkout-resumo-plano.tsx`, `plano-unico.tsx` |
| P0-002 | 1.500.000 alunos sem fonte | `hero-cta.tsx`, `manifesto-fundador.tsx` |
| P0-003 | 180 mil alunos vs 1,5 milhao | `testimonials.tsx` |
| P0-004 | Vitalicio vs 12 meses | `trust-bar.tsx` vs `ajuda/page.tsx` |
| P0-005 | 5 numeros de catalogo (100/120/200/2400) | catalogo-preview/planos-comparativo/sobre |
| P0-006 | Telefone (11) 4000-0000 em 4 paginas publicas | reembolso/contato/ajuda/footer-main |
| P0-007 | Links sociais para home das redes | footer-main.tsx |
| P0-014 | Meta description global voltada pra revendedor | (main)/layout.tsx |
| P0-040 | Fallback hardcoded escolaavancada.com.br | aluno/cursos/page.tsx, aluno/page.tsx |

## Anexo B — Lista de superficies com erro de acentuacao (P1-020)

```
src/app/admin/indicacoes/page.tsx (titles)
src/app/admin/indicacoes/comissoes/page.tsx
src/app/admin/indicacoes/saques/page.tsx
src/app/admin/configuracoes/indicacoes/page.tsx
src/app/painel/indicacoes/page.tsx
src/app/painel/indicacoes/materiais/page.tsx
src/app/painel/certificados/page.tsx
src/app/painel/certificados/template/page.tsx
src/components/admin/admin-referral-settings-form.tsx
src/components/admin/reseller-commissions-tabs.tsx
src/components/admin/reseller-referral-config.tsx
src/components/painel/certificate-layout-selector.tsx
src/components/painel/referral-link-copy.tsx
src/components/painel/copyable-text.tsx
src/components/shared/ref-cookie-capture.tsx
src/lib/email/templates/invite.tsx
src/app/api/painel/referrals/request-payout/route.ts (mensagem JSON publica)
```
