"use client"

import { useState } from "react"
import {
  Check,
  Copy,
  Webhook,
  ShieldCheck,
  Inbox,
  KeyRound,
  Eye,
  EyeOff,
  PlugZap,
} from "lucide-react"
import { ApiKeysManager } from "./api-keys-manager"
import { Can } from "@/components/shared/permissions/permission-context"

const WEBHOOK_URL = "https://profissionalizamaisbrasil.com.br/api/webhooks/lms"
const PARCEIROS_BASE = "https://profissionalizamaisbrasil.com.br/api/v1"

interface EventRow {
  type: string
  desc: string
}

const EVENTS: EventRow[] = [
  { type: "course.completed", desc: "Aluno concluiu o curso → marca 100% e emite o certificado do PMB." },
  { type: "lesson.completed", desc: "Aluno concluiu uma aula → atualiza o progresso da matrícula." },
  { type: "course.published", desc: "Curso publicado no LMS → re-sincroniza o catálogo (entra na vitrine)." },
  { type: "course.unpublished", desc: "Curso despublicado → re-sincroniza o catálogo (sai da vitrine)." },
  { type: "course.updated", desc: "Curso já publicado foi editado (preço, categoria, matriz, conteúdo) → re-sincroniza o catálogo em tempo real." },
  { type: "student.question.created", desc: "Aluno abriu suporte no LMS → cai na caixa de atendimento da revenda dona (ou do PMB)." },
]

// Documentação copiável para o agente que implementa o LADO DO LMS. Sem
// backticks e sem ${...} para não conflitar com o template literal — blocos de
// código vão indentados (markdown).
const LMS_AGENT_MD = [
  "# PMB — Webhooks de ENTRADA (LMS → PMB) para implementar/ligar no LMS",
  "",
  "O PMB expõe um receptor de webhooks. Habilite os webhooks de saída do LMS",
  "(outbox + cron de dispatch que já existem) apontando para o PMB.",
  "",
  "## Endpoint",
  "POST " + WEBHOOK_URL,
  "",
  "## Como ligar no LMS",
  "Defina as variáveis de ambiente do LMS:",
  "  PMB_WEBHOOK_URL = " + WEBHOOK_URL,
  "  PMB_WEBHOOK_SECRET = <mesmo segredo configurado no PMB; mínimo 16 chars>",
  "Com PMB_WEBHOOK_URL definida, o LMS liga os webhooks de saída sozinho.",
  "",
  "## Autenticação (HMAC-SHA256)",
  "Headers obrigatórios em cada entrega:",
  "  X-PMB-Event-Id    <uuid estável entre retries>   (chave de idempotência)",
  "  X-PMB-Event-Type  <tipo do evento>",
  "  X-PMB-Timestamp   <epoch em segundos ou milissegundos>",
  "  X-PMB-Signature   sha256=<hmac-hex>",
  "",
  "Assinatura = HMAC-SHA256(PMB_WEBHOOK_SECRET, <timestamp> + '.' + <rawBody>) em hex,",
  "onde <timestamp> é exatamente o valor do header e <rawBody> é o corpo cru enviado.",
  "",
  "Node:",
  "    const manifest = timestamp + '.' + rawBody",
  "    const sig = crypto.createHmac('sha256', PMB_WEBHOOK_SECRET)",
  "      .update(manifest).digest('hex')",
  "    // header: X-PMB-Signature: sha256=<sig>",
  "",
  "Janela anti-replay: 10 minutos (timestamp fora da janela → 401).",
  "",
  "## Idempotência",
  "Reuse o MESMO X-PMB-Event-Id nos retries. Evento já processado com sucesso",
  "responde 200 {received:true, duplicate:true} sem reprocessar.",
  "",
  "## Respostas",
  "  200 → recebido/processado (não re-tentar)",
  "  401 → assinatura inválida",
  "  400 → evento não suportado ou JSON inválido",
  "  500 → falha transitória — RE-TENTAR com o mesmo X-PMB-Event-Id",
  "  503 → receiver desligado (PMB_WEBHOOK_SECRET ausente no PMB)",
  "",
  "## Eventos e payloads (JSON no corpo)",
  "studentExternalId = id do aluno no PMB (o mesmo enviado em POST /api/v1/enrollments).",
  "courseId = id do curso no LMS (UUID; corresponde a Course.lmsCourseId no PMB).",
  "",
  "### course.completed",
  '    { "studentExternalId": "stu_123", "courseId": "<lms-course-uuid>", "completedAt": "2026-06-28T18:30:00Z" }',
  "PMB marca a matrícula como concluída (100%) e emite o certificado, se a",
  "auto-emissão estiver ligada.",
  "",
  "### lesson.completed",
  '    { "studentExternalId": "stu_123", "courseId": "<lms-course-uuid>", "percent": 80, "completedAt": null, "lastActivityAt": "2026-06-28T18:00:00Z" }',
  "PMB atualiza o progresso da matrícula (percent/última atividade).",
  "",
  "### course.published / course.unpublished / course.updated",
  '    { "courseId": "<lms-course-uuid>", "slug": "eletricista-residencial" }',
  "Campos opcionais. PMB re-sincroniza o catálogo completo (preço, categoria e",
  "matriz curricular entram junto). Use course.updated ao editar um curso já",
  "publicado para refletir a mudança em tempo real, sem esperar o sync diário.",
  "",
  "### student.question.created  (SUPORTE)",
  '    { "studentExternalId": "stu_123", "title": "Dúvida na aula 4", "body": "texto do aluno", "context": "Eletricista - Aula 4" }',
  "PMB abre um chamado de suporte e o ROTEIA para a caixa certa conforme o aluno:",
  "  - aluno de uma revenda    → caixa da revenda (/painel/atendimento)",
  "  - aluno da vitrine-mãe PMB → caixa do PMB (/admin/atendimento)",
  "title e context são opcionais; body é obrigatório.",
  "",
  "## Exemplo (curl)",
  "    TS=$(date +%s)",
  "    BODY='{\"studentExternalId\":\"stu_123\",\"courseId\":\"<uuid>\",\"completedAt\":\"2026-06-28T18:30:00Z\"}'",
  "    SIG=$(printf '%s.%s' \"$TS\" \"$BODY\" | openssl dgst -sha256 -hmac \"$PMB_WEBHOOK_SECRET\" | awk '{print $2}')",
  "    curl -X POST " + WEBHOOK_URL + " \\",
  "      -H \"X-PMB-Event-Id: $(uuidgen)\" \\",
  "      -H \"X-PMB-Event-Type: course.completed\" \\",
  "      -H \"X-PMB-Timestamp: $TS\" \\",
  "      -H \"X-PMB-Signature: sha256=$SIG\" \\",
  "      -H \"Content-Type: application/json\" \\",
  "      -d \"$BODY\"",
  "",
  "## Observações",
  "- O canal de polling (GET /api/v1/day-update) continua valendo; os webhooks só",
  "  reduzem a latência (certificado/atualização na hora em vez de na manhã seguinte).",
  "- Nunca inclua a senha do aluno nesses eventos.",
].join("\n")

// Documentação copiável para o dev do SISTEMA PARCEIRO que vai consumir a API
// de consulta de unidades. Contrato completo em docs/api/parceiros-v1.md — este
// resumo é o que se entrega junto com a chave. Mesma restrição do MD acima: sem
// backticks e sem ${...} dentro do template literal.
const PARCEIRO_AGENT_MD = [
  "# PMB — API de consulta de unidades (revendas) v1",
  "",
  "Dado um identificador unico de uma pessoa ou de uma unidade, a API devolve os",
  "dados completos da unidade: id, slug, subdominio, dominio proprio, contato,",
  "redes sociais, identidade visual e titular.",
  "",
  "## Base URL",
  PARCEIROS_BASE,
  "",
  "## Autenticacao",
  "Envie a chave em UM destes headers (as duas formas funcionam):",
  "  Authorization: Bearer <chave>",
  "  X-API-Key: <chave>",
  "",
  "A chave e emitida pela equipe PMB, uma por sistema integrado, e aparece uma",
  "UNICA vez (o PMB guarda so o hash). Guarde como senha de producao: variavel de",
  "ambiente do SERVIDOR, nunca no front-end, no app nem em log.",
  "",
  "Teste a credencial antes de qualquer outra coisa:",
  "    GET /api/v1/ping",
  "",
  "## Consulta",
  "    GET /api/v1/unidades/lookup?<identificador>=<valor>",
  "",
  "Informe EXATAMENTE UM identificador por requisicao:",
  "  email      e-mail do titular da unidade (unico; caminho preferido)",
  "  cpf        CPF do titular, com ou sem mascara",
  "  telefone   telefone do titular — NAO e unico, pode devolver 409",
  "  id         id da unidade",
  "  slug       slug da unidade (= subdominio da vitrine)",
  "  dominio    dominio proprio (aceita URL completa e www.)",
  "  codigo     codigo de indicacao da unidade",
  "  q          valor solto: a API deduz o tipo (conveniencia, nao contrato)",
  "",
  "Atalho por caminho (mesma deducao do q):",
  "    GET /api/v1/unidades/{identificador}",
  "",
  "Exemplo:",
  "    curl -H \"Authorization: Bearer $PMB_API_KEY\" \\",
  "      \"" + PARCEIROS_BASE + "/unidades/lookup?email=joao@exemplo.com.br\"",
  "",
  "## Resposta",
  "    { \"ok\": true, \"data\": { \"encontradoPor\": {...}, \"unidade\": {...} } }",
  "",
  "Blocos da unidade: dominio{}, contato{}, redesSociais{}, identidadeVisual{},",
  "titular{}, recursos{}, alem de id, nome, slug, status, ativa, codigoIndicacao",
  "e as datas.",
  "",
  "Use dominio.url para montar links: e o dominio proprio quando existe, senao o",
  "subdominio.",
  "",
  "CONSULTE o status: PENDING | ACTIVE | SUSPENDED | CANCELLED. A API devolve",
  "unidade suspensa e cancelada de proposito — decidir o que fazer com elas e do",
  "seu lado.",
  "",
  "O CPF do titular sai MASCARADO. Credenciais de gateway, mensalidade, comissao,",
  "PIX e dados de alunos nunca sao devolvidos.",
  "",
  "## Erros — ramifique no code, nao na mensagem",
  "  400 MISSING_IDENTIFIER   nenhum identificador, ou mais de um",
  "  400 INVALID_IDENTIFIER   forma invalida (CPF com DV errado, e-mail torto...)",
  "  401 INVALID_API_KEY      chave ausente/errada/revogada/expirada (nao distingue)",
  "  403 INSUFFICIENT_SCOPE   chave sem o escopo unidades.read",
  "  404 NOT_FOUND            nenhuma unidade casou com o identificador",
  "  409 MULTIPLE_MATCHES     so em telefone: repita por e-mail, CPF ou slug",
  "  429 RATE_LIMITED         details.retryAfterSec diz quanto esperar",
  "  500 INTERNAL_ERROR       falha no PMB; pode repetir",
  "",
  "Envelope de erro:",
  "    { \"ok\": false, \"error\": { \"message\": \"...\", \"code\": \"NOT_FOUND\" } }",
  "",
  "## Limite",
  "120 requisicoes por minuto POR CHAVE. Cacheie a resposta alguns minutos — os",
  "dados de uma unidade mudam raramente — e implemente backoff no 429.",
  "",
  "## Checklist antes de subir",
  "1. Chave em env do servidor, fora do controle de versao.",
  "2. GET /api/v1/ping responde 200 no ambiente de producao.",
  "3. 404 tratado como 'nao encontrado', nao como erro — a maioria dos contatos",
  "   consultados NAO vai ser de uma unidade.",
  "4. Cache + backoff no 429.",
  "5. O status da unidade e levado em conta antes de exibi-la como ativa.",
].join("\n")

function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false)
  async function copy() {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      /* clipboard indisponível — usuário copia manualmente */
    }
  }
  return (
    <button
      type="button"
      onClick={copy}
      className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--color-pmb-green)] px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-[var(--color-pmb-green-700)]"
    >
      {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
      {copied ? "Copiado!" : "Copiar"}
    </button>
  )
}

function CopyIconButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false)
  async function copy() {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      /* clipboard indisponível */
    }
  }
  return (
    <button
      type="button"
      onClick={copy}
      aria-label="Copiar segredo"
      className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-gray-300 text-gray-500 transition-colors hover:bg-gray-100"
    >
      {copied ? (
        <Check className="h-4 w-4 text-emerald-600" />
      ) : (
        <Copy className="h-4 w-4" />
      )}
    </button>
  )
}

function WebhookSecretCard({ secret }: { secret: string | null }) {
  const [reveal, setReveal] = useState(false)
  return (
    <section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm lg:p-8">
      <div className="flex items-center gap-2">
        <KeyRound className="h-4 w-4 text-[var(--color-pmb-green)]" />
        <h3 className="text-sm font-semibold text-[var(--color-pmb-green-900)]">
          Segredo do webhook (PMB_WEBHOOK_SECRET)
        </h3>
      </div>
      <p className="mt-1 text-xs text-gray-600">
        Use este valor para assinar os webhooks no lado do LMS (configure como{" "}
        <code>PMB_WEBHOOK_SECRET</code> lá também). Não compartilhe fora da
        integração.
      </p>

      {secret ? (
        <div className="mt-4 flex items-center gap-2 rounded-xl bg-gray-50 p-3 ring-1 ring-gray-200">
          <span className="flex-1 break-all font-mono text-sm font-semibold text-gray-800">
            {reveal ? secret : "•".repeat(Math.min(secret.length, 48))}
          </span>
          <button
            type="button"
            onClick={() => setReveal((v) => !v)}
            aria-label={reveal ? "Ocultar segredo" : "Mostrar segredo"}
            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-gray-300 text-gray-500 transition-colors hover:bg-gray-100"
          >
            {reveal ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
          <CopyIconButton value={secret} />
        </div>
      ) : (
        <div className="mt-4 rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-800 ring-1 ring-amber-200">
          Ainda não disponível neste deploy. A variável{" "}
          <code>PMB_WEBHOOK_SECRET</code> foi configurada no Vercel — ela aparece
          aqui após o próximo deploy. Até lá, o receiver responde 503 (desligado).
        </div>
      )}
    </section>
  )
}

export function ApiDocsTab({
  pmbWebhookSecret,
}: {
  pmbWebhookSecret?: string | null
}) {
  return (
    <div className="space-y-6">
      {/* ── API de parceiros (PMB → sistemas de terceiros) ──────────────────
          Gateado por `integracoes.view`: sem ela a listagem de chaves responde
          403 e a seção inteira só mostraria erro. Quem chega aqui por
          `configuracoes.view` continua vendo o resto da aba. */}
      <Can perm="integracoes.view">
      <section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm lg:p-8">
        <div className="flex items-center gap-2">
          <PlugZap className="h-4 w-4 text-[var(--color-pmb-green)]" />
          <h3 className="text-sm font-semibold text-[var(--color-pmb-green-900)]">
            API de parceiros — consulta de unidades (PMB → terceiros)
          </h3>
        </div>
        <p className="mt-1 text-xs text-gray-600">
          O sistema parceiro envia um dado único (e-mail, CPF, telefone, slug,
          domínio…) e recebe de volta os dados completos da unidade: id, slug,
          subdomínio, domínio próprio, contato, redes sociais, identidade visual
          e titular.
        </p>

        <div className="mt-4 space-y-2 rounded-xl bg-gray-50 p-4 ring-1 ring-gray-200">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">
            Endpoints
          </p>
          <p className="break-all font-mono text-xs font-semibold text-gray-800">
            GET {PARCEIROS_BASE}/unidades/lookup?email=…
          </p>
          <p className="break-all font-mono text-xs font-semibold text-gray-800">
            GET {PARCEIROS_BASE}/unidades/{"{identificador}"}
          </p>
          <p className="break-all font-mono text-xs text-gray-500">
            GET {PARCEIROS_BASE}/ping — verificação da chave
          </p>
        </div>

        <ul className="mt-4 space-y-2 text-xs text-gray-600">
          <li>
            <strong>Identificadores:</strong> <code>email</code>, <code>cpf</code>,{" "}
            <code>telefone</code> (do titular), <code>id</code>, <code>slug</code>,{" "}
            <code>dominio</code>, <code>codigo</code> (da unidade) ou{" "}
            <code>q</code> (a API deduz). Um por requisição.
          </li>
          <li>
            <strong>Autenticação:</strong>{" "}
            <code>Authorization: Bearer &lt;chave&gt;</code> ou{" "}
            <code>X-API-Key</code>, com escopo <code>unidades.read</code>. Limite
            de 120 req/min por chave.
          </li>
          <li>
            <strong>Nunca sai daqui:</strong> credenciais de gateway, segredos de
            webhook, mensalidade, comissão, PIX e dados de alunos. O CPF do
            titular sai mascarado.
          </li>
        </ul>
      </section>

      {/* Chaves dos parceiros */}
      <ApiKeysManager />

      {/* MD copiável para o dev do parceiro */}
      <section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm lg:p-8">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-sm font-semibold text-[var(--color-pmb-green-900)]">
            Documentação para o dev do parceiro (copiável)
          </h3>
          <CopyButton value={PARCEIRO_AGENT_MD} />
        </div>
        <p className="mt-1 text-xs text-gray-600">
          Entregue junto com a chave. Contrato completo em{" "}
          <code>docs/api/parceiros-v1.md</code>.
        </p>
        <pre className="mt-4 max-h-[28rem] overflow-auto rounded-xl bg-gray-900 p-4 text-[11px] leading-relaxed text-gray-100">
          <code>{PARCEIRO_AGENT_MD}</code>
        </pre>
      </section>
      </Can>

      {/* Visão geral */}
      <section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm lg:p-8">
        <div className="flex items-center gap-2">
          <Webhook className="h-4 w-4 text-[var(--color-pmb-green)]" />
          <h3 className="text-sm font-semibold text-[var(--color-pmb-green-900)]">
            APIs receptivas — Webhooks do LMS (LMS → PMB)
          </h3>
        </div>
        <p className="mt-1 text-xs text-gray-600">
          O PMB recebe eventos do LMS (conclusão, progresso, catálogo e suporte) e
          reage na hora. O LMS continua puxando dados via <code>day-update</code>;
          os webhooks só reduzem a latência.
        </p>

        <div className="mt-4 rounded-xl bg-gray-50 p-4 ring-1 ring-gray-200">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">
            Endpoint
          </p>
          <p className="mt-1 break-all font-mono text-sm font-semibold text-gray-800">
            POST {WEBHOOK_URL}
          </p>
        </div>
      </section>

      {/* Segredo do webhook (visível ao SUPER_ADMIN) */}
      <WebhookSecretCard secret={pmbWebhookSecret ?? null} />

      {/* Segurança */}
      <section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm lg:p-8">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 text-[var(--color-pmb-green)]" />
          <h3 className="text-sm font-semibold text-[var(--color-pmb-green-900)]">
            Autenticação e idempotência
          </h3>
        </div>
        <ul className="mt-3 space-y-2 text-xs text-gray-600">
          <li>
            <strong>HMAC-SHA256</strong> sobre{" "}
            <code>&lt;timestamp&gt;.&lt;rawBody&gt;</code> com o segredo
            compartilhado <code>PMB_WEBHOOK_SECRET</code>. Header{" "}
            <code>X-PMB-Signature: sha256=&lt;hex&gt;</code>.
          </li>
          <li>
            Headers: <code>X-PMB-Event-Id</code> (idempotência),{" "}
            <code>X-PMB-Event-Type</code>, <code>X-PMB-Timestamp</code>,{" "}
            <code>X-PMB-Signature</code>.
          </li>
          <li>Janela anti-replay de 10 minutos. Re-entregas reusam o mesmo Event-Id.</li>
          <li>
            Habilita-se definindo <code>PMB_WEBHOOK_SECRET</code> nas variáveis de
            ambiente do PMB (sem ela, o endpoint responde 503).
          </li>
        </ul>
      </section>

      {/* Eventos */}
      <section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm lg:p-8">
        <div className="flex items-center gap-2">
          <Inbox className="h-4 w-4 text-[var(--color-pmb-green)]" />
          <h3 className="text-sm font-semibold text-[var(--color-pmb-green-900)]">
            Eventos suportados
          </h3>
        </div>
        <div className="mt-3 divide-y divide-gray-100">
          {EVENTS.map((e) => (
            <div key={e.type} className="flex flex-col gap-1 py-3 sm:flex-row sm:gap-4">
              <code className="shrink-0 font-mono text-xs font-semibold text-[var(--color-pmb-green-900)] sm:w-56">
                {e.type}
              </code>
              <p className="text-xs text-gray-600">{e.desc}</p>
            </div>
          ))}
        </div>
        <p className="mt-3 rounded-lg bg-[var(--color-pmb-lime-50)]/60 px-3 py-2 text-[11px] text-gray-600">
          <strong>Suporte:</strong> o chamado é roteado automaticamente pela unidade
          dona do aluno — revenda → <code>/painel/atendimento</code>; vitrine-mãe →{" "}
          <code>/admin/atendimento</code>.
        </p>
      </section>

      {/* MD copiável para o agente do LMS */}
      <section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm lg:p-8">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-sm font-semibold text-[var(--color-pmb-green-900)]">
            Documentação para o agente do LMS (copiável)
          </h3>
          <CopyButton value={LMS_AGENT_MD} />
        </div>
        <p className="mt-1 text-xs text-gray-600">
          Copie e entregue ao agente/dev que implementa o lado do LMS — está pronto
          para implementação.
        </p>
        <pre className="mt-4 max-h-[28rem] overflow-auto rounded-xl bg-gray-900 p-4 text-[11px] leading-relaxed text-gray-100">
          <code>{LMS_AGENT_MD}</code>
        </pre>
      </section>
    </div>
  )
}
