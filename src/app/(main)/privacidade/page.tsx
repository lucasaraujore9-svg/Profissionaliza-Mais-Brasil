import { PageHero, PageBody, Prose } from "@/components/main/static/page-hero"

export const metadata = {
  title: "Política de Privacidade — Profissionaliza Mais Brasil",
  description: "Como coletamos, usamos e protegemos seus dados pessoais — conforme LGPD.",
}

export default function PrivacidadePage() {
  return (
    <>
      <PageHero
        eyebrow="Política de Privacidade"
        titulo="Como tratamos seus dados"
        subtitulo="Em conformidade com a Lei Geral de Proteção de Dados (LGPD — Lei nº 13.709/2018)."
      />
      <PageBody>
        <Prose>
          <h2>1. Dados que coletamos</h2>
          <p>Coletamos apenas os dados necessários para prestar nossos serviços:</p>
          <ul>
            <li>Nome completo, email, CPF e telefone</li>
            <li>Dados de pagamento (processados pelo Mercado Pago — não armazenamos dados de cartão)</li>
            <li>Dados de acesso à plataforma e progresso nas aulas</li>
            <li>Endereço IP e cookies para fins de segurança e experiência</li>
          </ul>

          <h2>2. Como usamos seus dados</h2>
          <ul>
            <li>Criar e gerenciar sua conta</li>
            <li>Processar pagamentos e emitir notas fiscais</li>
            <li>Enviar comunicados sobre seu curso e suporte</li>
            <li>Emitir certificado de conclusão</li>
            <li>Cumprir obrigações legais e fiscais</li>
          </ul>

          <h2>3. Compartilhamento de dados</h2>
          <p>
            Não vendemos seus dados. Compartilhamos apenas com provedores essenciais à operação
            (plataforma de ensino Escola Avançada, gateway Mercado Pago e serviços de email),
            sempre sob contratos com cláusula de confidencialidade.
          </p>

          <h2>4. Seus direitos (LGPD)</h2>
          <p>Você pode, a qualquer momento:</p>
          <ul>
            <li>Acessar seus dados pessoais</li>
            <li>Solicitar correção de dados incorretos</li>
            <li>Pedir a exclusão de sua conta e dados</li>
            <li>Revogar consentimento para comunicações de marketing</li>
            <li>Solicitar portabilidade de dados</li>
          </ul>
          <p>
            Para exercer seus direitos, envie email para{" "}
            <strong>privacidade@profissionalizamaisbrasil.com.br</strong>.
          </p>

          <h2>5. Cookies</h2>
          <p>
            Utilizamos cookies essenciais (sessão, segurança) e de análise (Google Analytics) para
            entender o comportamento dos visitantes e melhorar a experiência. Você pode desabilitar
            cookies nas configurações do seu navegador.
          </p>

          <h2>6. Segurança</h2>
          <p>
            Adotamos medidas técnicas e organizacionais para proteger seus dados: criptografia em
            trânsito (HTTPS), senhas hasheadas, controle de acesso e auditoria. Em caso de incidente,
            notificamos a ANPD e os usuários afetados conforme previsto em lei.
          </p>

          <h2>7. Retenção</h2>
          <p>
            Mantemos seus dados enquanto sua conta estiver ativa e pelo período necessário para
            cumprir obrigações legais (ex: fiscais, por 5 anos). Dados de alunos inativos podem ser
            anonimizados após esse prazo.
          </p>

          <h2>8. Contato do Encarregado (DPO)</h2>
          <p>
            Para tratar qualquer assunto relacionado a privacidade, escreva para{" "}
            <strong>dpo@profissionalizamaisbrasil.com.br</strong>.
          </p>
        </Prose>
      </PageBody>
    </>
  )
}
