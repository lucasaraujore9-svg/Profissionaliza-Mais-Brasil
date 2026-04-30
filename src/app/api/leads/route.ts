import { NextResponse } from "next/server"
import { z, ZodError } from "zod"
import { prisma } from "@/lib/prisma"
import { sendEmail, EmailError } from "@/lib/email/resend"
import { createNotification } from "@/lib/notifications"

const phoneRegex = /^\(?\d{2}\)?\s?\d{4,5}-?\d{4}$/

const leadSchema = z.object({
  email: z.string().email("Email inválido").toLowerCase().trim(),
  companyName: z.string().min(2, "Informe o nome da empresa").max(120).trim(),
  phone: z
    .string()
    .trim()
    .regex(phoneRegex, "Telefone inválido. Use (11) 99999-9999"),
})

export async function POST(request: Request) {
  let payload: unknown
  try {
    payload = await request.json()
  } catch {
    return NextResponse.json(
      { error: "JSON inválido", code: "INVALID_JSON" },
      { status: 400 },
    )
  }

  let data: z.infer<typeof leadSchema>
  try {
    data = leadSchema.parse(payload)
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json(
        {
          error: "Dados inválidos",
          code: "VALIDATION_ERROR",
          details: error.flatten().fieldErrors,
        },
        { status: 400 },
      )
    }
    throw error
  }

  try {
    const lead = await prisma.lead.create({
      data: {
        email: data.email,
        companyName: data.companyName,
        phone: data.phone,
      },
    })

    // Fire-and-forget email; never break the request if Resend falha
    sendEmail({
      to: data.email,
      subject: "Recebemos seu interesse!",
      template: {
        type: "lead-confirmation",
        props: { companyName: data.companyName },
      },
    }).catch((err: unknown) => {
      if (err instanceof EmailError) {
        console.error("[leads] email failed:", err.message)
      } else {
        console.error("[leads] email unexpected error:", err)
      }
    })

    // Notifica equipe interna sobre novo lead — equipe de vendas tipicamente
    // tem PMB_SALES, mas sem alguem com esse papel cai pro SUPER_ADMIN.
    await createNotification({
      audience: "ROLE",
      roleTarget: "PMB_SALES",
      level: "INFO",
      title: `Novo lead: ${data.companyName}`,
      body: `${data.email} · ${data.phone}`,
      category: "lead",
      href: "/admin/revendedores",
    })
    await createNotification({
      audience: "ROLE",
      roleTarget: "SUPER_ADMIN",
      level: "INFO",
      title: `Novo lead: ${data.companyName}`,
      body: `${data.email} · ${data.phone}`,
      category: "lead",
      href: "/admin/revendedores",
    })

    return NextResponse.json({ data: { id: lead.id } }, { status: 201 })
  } catch (error) {
    console.error("[leads] create error:", error)
    return NextResponse.json(
      { error: "Erro ao salvar lead", code: "DB_ERROR" },
      { status: 500 },
    )
  }
}
