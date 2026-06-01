import Link from "next/link"
import { PageHero, PageBody, Prose } from "@/components/main/static/page-hero"

export const metadata = {
  title: "Política de Reembolso",
  description: "Garantia de 7 dias corridos. Veja como pedir seu reembolso.",
}

export default function ReembolsoPage() {
  return (
    <>
      <PageHero
        eyebrow="Reembolso"
        titulo="Garantia de 7 dias, sem burocracia"
        subtitulo="Se o curso não for o que você esperava, devolvemos 100% do que você pagou."
      />
      <PageBody>
        <Prose>
          <h2>Como funciona a garantia</h2>
          <p>
            Todo curso do Profissionaliza Mais Brasil tem <strong>7 dias corridos de garantia</strong>,
            contados a partir da data da compra. Nesse período, se você não gostar do conteúdo, basta
            pedir o reembolso e devolvemos o valor integral. Simples assim.
          </p>

          <h2>Como solicitar o reembolso</h2>
          <ul>
            <li>Envie um email para <strong>financeiro@profissionalizamaisbrasil.com.br</strong></li>
            <li>Inclua: nome completo, CPF e o nome do curso</li>
            <li>
              Se preferir, fale com a gente pelo{" "}
              <Link href="/contato">formulário de contato</Link> ou WhatsApp
              listado em <Link href="/contato">Contato</Link>.
            </li>
          </ul>

          <h2>Quando o dinheiro volta?</h2>
          <ul>
            <li><strong>Pix:</strong> até 3 dias úteis</li>
            <li><strong>Cartão de crédito:</strong> estorno em até 2 faturas, conforme sua operadora</li>
            <li><strong>Boleto:</strong> depósito na conta informada em até 5 dias úteis</li>
          </ul>

          <h2>Após os 7 dias</h2>
          <p>
            Passado o prazo, o acesso ao curso é vitalício e não há reembolso previsto — exceto em
            casos excepcionais analisados individualmente por nossa equipe.
          </p>

          <h2>Dúvidas?</h2>
          <p>
            Nosso time de atendimento responde em até 1 dia útil. Fala com a gente no{" "}
            <Link href="/contato">formulário de contato</Link> ou pelo WhatsApp.
          </p>
        </Prose>
      </PageBody>
    </>
  )
}
