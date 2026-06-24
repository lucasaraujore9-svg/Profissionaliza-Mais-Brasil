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
} from "lucide-react"

const WEBHOOK_URL = "https://profissionalizamaisbrasil.com.br/api/webhooks/lms"

interface EventRow {
  type: string
  desc: string
}

const EVENTS: EventRow[] = [
  { type: "course.completed", desc: "Aluno concluiu o curso → marca 100% e emite o certificado do PMB." },
  { type: "lesson.completed", desc: "Aluno concluiu uma aula → atualiza o progresso da matrícula." },
  { type: "course.published", desc: "Curso publicado no LMS → re-sincroniza o catálogo (entra na vitrine)." },
  { type: "course.unpublished", desc: "Curso despublicado → re-sincroniza o catálogo (sai da vitrine)." },
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
  "### course.published / course.unpublished",
  '    { "courseId": "<lms-course-uuid>", "slug": "eletricista-residencial" }',
  "Campos opcionais. PMB re-sincroniza o catálogo (entra/sai da vitrine).",
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
