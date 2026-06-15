import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { hash } from "bcryptjs"
import { generateTemporaryPassword } from "@/lib/students/generate-password"
import { createNotification } from "@/lib/notifications"
import { sendEmail, isEmailConfigured } from "@/lib/email/resend"
import { contextLogger } from "@/lib/logger"
import { appUrl } from "@/lib/tenant/urls"
import {
  PMB_EMAIL_BRAND,
  emailFromForBrand,
  tenantEmailBrand,
} from "@/lib/email/brand"
import { PMB_TENANT_SLUG } from "@/lib/pmb-config"
import type { NotificationLevel } from "@prisma/client"

export const editSchema = z.object({
  nome: z.string().trim().min(2).max(120),
  email: z.string().trim().toLowerCase().max(160).optional().or(z.literal("")),
  fone: z.string().trim().max(40).optional().or(z.literal("")),
  fone2: z.string().trim().max(40).optional().or(z.literal("")),
  cpf: z.string().trim().max(20).optional().or(z.literal("")),
  cidade: z.string().trim().max(80).optional().or(z.literal("")),
  estado: z.string().trim().max(40).optional().or(z.literal("")),
  cep: z.string().trim().max(20).optional().or(z.literal("")),
  rua: z.string().trim().max(200).optional().or(z.literal("")),
  numero: z.string().trim().max(20).optional().or(z.literal("")),
  bairro: z.string().trim().max(80).optional().or(z.literal("")),
  nascimento: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida")
    .optional()
    .or(z.literal("")),
})

export type EditStudentInput = z.infer<typeof editSchema>

function nullable(value: string | undefined): string | null {
  if (!value) return null
  const t = value.trim()
  return t.length > 0 ? t : null
}

/**
 * Edita os dados cadastrais do aluno.
 *
 * `tenantId` (defesa em profundidade): quando informado, o update SÓ afeta o
 * aluno daquele tenant (`updateMany where {id, tenantId}`) — o painel do
 * revendedor SEMPRE deve passar `ctx.tenantId` para que nenhum `id` forjado
 * alcance aluno de outra loja. O admin PMB gerencia alunos de qualquer tenant
 * (vide `loadStudentDetail`) e omite o parâmetro.
 *
 * @returns `true` se algum registro foi atualizado; `false` se nada casou o
 *          escopo (id inexistente ou de outro tenant) — o caller deve devolver 404.
 */
export async function applyStudentEdit(
  studentId: string,
  data: EditStudentInput,
  tenantId?: string,
): Promise<boolean> {
  const result = await prisma.student.updateMany({
    where: tenantId ? { id: studentId, tenantId } : { id: studentId },
    data: {
      nome: data.nome.trim(),
      email: nullable(data.email),
      fone: nullable(data.fone),
      fone2: nullable(data.fone2),
      cpf: nullable(data.cpf),
      cidade: nullable(data.cidade),
      estado: nullable(data.estado),
      cep: nullable(data.cep),
      rua: nullable(data.rua),
      numero: nullable(data.numero),
      bairro: nullable(data.bairro),
      nascimento: data.nascimento ? new Date(data.nascimento) : null,
    },
  })
  return result.count > 0
}

export const noteSchema = z.object({
  body: z.string().trim().min(3).max(2000),
})

export const notifySchema = z.object({
  title: z.string().trim().min(3).max(120),
  body: z.string().trim().max(500).optional().or(z.literal("")),
  href: z.string().trim().max(300).optional().or(z.literal("")),
  level: z.enum(["INFO", "SUCCESS", "WARNING", "ERROR"]).default("INFO"),
})

export type NotifyStudentInput = z.infer<typeof notifySchema>

export async function notifyStudent(
  studentId: string,
  input: NotifyStudentInput,
): Promise<{ id: string; title: string; body: string | null; level: string; createdAt: string; readAt: null }> {
  // createNotification ja faz push + respeita preferencias e retorna o id da
  // linha criada (ou null se a categoria/preferencia bloqueou o envio).
  const result = await createNotification({
    audience: "STUDENT",
    studentId,
    title: input.title.trim(),
    body: input.body?.trim() || undefined,
    href: input.href?.trim() || undefined,
    level: input.level as NotificationLevel,
    category: "admin-broadcast",
  })

  // Le exatamente a notificacao criada (por id) para refletir na UI. Se nada
  // foi criado, devolve um registro sintetico a partir do input.
  const created = result
    ? await prisma.notification.findUnique({
        where: { id: result.id },
        select: { id: true, title: true, body: true, level: true, createdAt: true },
      })
    : null
  return {
    id: created?.id ?? "",
    title: created?.title ?? input.title,
    body: created?.body ?? input.body ?? null,
    level: created?.level ?? input.level,
    createdAt: (created?.createdAt ?? new Date()).toISOString(),
    readAt: null,
  }
}

interface ResetPasswordResult {
  tempPassword: string
  emailSent: boolean
}

export async function resetStudentPassword(
  studentId: string,
  tenantId?: string,
): Promise<ResetPasswordResult | { error: string }> {
  const student = await prisma.student.findFirst({
    where: tenantId ? { id: studentId, tenantId } : { id: studentId },
    select: {
      id: true,
      nome: true,
      email: true,
      tenant: {
        select: {
          slug: true,
          name: true,
          logoUrl: true,
          customDomain: true,
          supportEmail: true,
        },
      },
    },
  })
  if (!student) return { error: "Aluno não encontrado" }
  if (!student.email) return { error: "Aluno sem email cadastrado" }

  const plain = generateTemporaryPassword()
  const hashed = await hash(plain, 12)

  await prisma.student.update({
    where: { id: studentId },
    data: {
      passwordHash: hashed,
      passwordSetAt: null, // forca aluno a saber que e temporaria
      // resetToken/Expires limpos — admin gerou senha temporaria direta
      resetToken: null,
      resetTokenExpires: null,
    },
  })

  // Envia email com a senha temporaria reusando o template student-welcome
  // (mesmo conteudo: identificacao + senha + CTA pra logar).
  if (!isEmailConfigured()) {
    return { tempPassword: plain, emailSent: false }
  }

  const isPmb = student.tenant.slug === PMB_TENANT_SLUG
  // Marca da unidade — reset de aluno de revenda usa a identidade da loja.
  const brand = isPmb ? PMB_EMAIL_BRAND : tenantEmailBrand(student.tenant)
  const storeBase = (brand.siteUrl ?? appUrl()).replace(/\/$/, "")

  try {
    await sendEmail({
      to: student.email,
      from: emailFromForBrand(brand),
      replyTo: brand.replyTo ?? undefined,
      subject: `Sua nova senha temporária — ${brand.name}`,
      template: {
        type: "student-welcome",
        props: {
          studentName: student.nome,
          studentEmail: student.email,
          temporaryPassword: plain,
          loginUrl: `${storeBase}/login`,
          brand,
        },
      },
    })
    return { tempPassword: plain, emailSent: true }
  } catch (err) {
    contextLogger().warn(
      { err, event: "student.reset_password.email_failed", studentId },
      "Falha ao enviar email de reset — admin recebe a senha temporaria via UI",
    )
    return { tempPassword: plain, emailSent: false }
  }
}
