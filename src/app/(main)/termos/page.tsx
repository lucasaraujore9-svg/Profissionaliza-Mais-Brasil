import { PageHero, PageBody, Prose } from "@/components/main/static/page-hero"

export const metadata = {
  title: "Termos de Uso — Profissionaliza Mais Brasil",
  description: "Termos e condições de uso da plataforma Profissionaliza Mais Brasil.",
}

export default function TermosPage() {
  return (
    <>
      <PageHero
        eyebrow="Termos de uso"
        titulo="Termos e condições"
        subtitulo="Atualizados em 1º de janeiro de 2026."
      />
      <PageBody>
        <Prose>
          <h2>1. Aceitação dos termos</h2>
          <p>
            Ao acessar e utilizar a plataforma <strong>Profissionaliza Mais Brasil</strong> você
            concorda integralmente com estes Termos de Uso. Caso não concorde, solicitamos que não
            utilize nossos serviços.
          </p>

          <h2>2. Sobre nossos serviços</h2>
          <p>
            Oferecemos cursos profissionalizantes online com acesso vitalício, suporte ao aluno e
            emissão de certificado. Nossos cursos são livres, de livre curso, conforme Decreto
            5.154/2004.
          </p>

          <h2>3. Cadastro e conta do aluno</h2>
          <p>
            O acesso aos cursos exige cadastro com dados pessoais verdadeiros e completos. Você é
            responsável por manter suas credenciais em sigilo. Detectada atividade suspeita, podemos
            suspender sua conta preventivamente.
          </p>

          <h2>4. Pagamentos e reembolso</h2>
          <p>
            Os pagamentos são processados via Mercado Pago. Aceitamos Pix, cartão de crédito e
            boleto bancário. Você tem direito a reembolso integral em até 7 dias corridos após a
            compra, conforme Código de Defesa do Consumidor.
          </p>

          <h2>5. Direitos autorais</h2>
          <p>
            Todo conteúdo (videoaulas, materiais, imagens, textos) é protegido por direitos
            autorais. É proibida a reprodução, distribuição ou comercialização sem autorização
            expressa.
          </p>

          <h2>6. Conduta do usuário</h2>
          <ul>
            <li>Não compartilhar credenciais de acesso</li>
            <li>Não gravar, baixar ou redistribuir o conteúdo das aulas</li>
            <li>Não utilizar a plataforma para fins ilícitos</li>
            <li>Respeitar outros alunos e equipe de suporte</li>
          </ul>

          <h2>7. Limitação de responsabilidade</h2>
          <p>
            A plataforma oferece conteúdo educacional. Não garantimos resultados profissionais
            específicos — estes dependem da dedicação individual do aluno e das condições de
            mercado.
          </p>

          <h2>8. Alterações nos termos</h2>
          <p>
            Podemos atualizar estes termos a qualquer momento. Alterações relevantes serão
            comunicadas por email aos alunos ativos.
          </p>

          <h2>9. Foro</h2>
          <p>
            Fica eleito o foro da comarca de São Paulo/SP para dirimir eventuais controvérsias
            decorrentes destes termos.
          </p>
        </Prose>
      </PageBody>
    </>
  )
}
