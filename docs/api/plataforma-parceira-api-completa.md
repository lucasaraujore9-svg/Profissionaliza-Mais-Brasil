# plataforma parceira API V2 — Documentação Completa de Endpoints

**Base URL:** `https://SUAESCOLA.com/api/v2/`
**Autenticação:** Token enviado via form-data (POST) ou header (GET/DELETE)
**Formato:** Todas as requests usam `multipart/form-data`
**Response padrão:** `{ "erro": "", "resultado": ... }`

---

## 1. CURSOS (2 endpoints)

### 1.1 POST `cursos/listar` — Listar todos os cursos

**Descrição:** Retorna o catálogo completo de cursos da escola. Pode filtrar por categoria.

| Parâmetro | Tipo | Obrigatório | Descrição |
|-----------|------|-------------|-----------|
| `token` | string | ✅ | Token de autenticação |
| `categoria` | int | ❌ | ID da categoria para filtrar |

**Response (200):**
```json
{
  "erro": "",
  "resultado": [
    {
      "nome": "Inglês do Zero a Fluência",
      "aulas": "296",
      "preco": "1.400,00",
      "preco_promocional": "",
      "parcelas": "7",
      "status": "ATIVO",
      "obs": "Descrição do curso...",
      "categoria_interna": "IDIOMAS",
      "carga_horaria": "100",
      "categoria_loja": "IDIOMAS",
      "destaque": "",
      "preco_mostrar": "Não",
      "capa_image": "https://estudanteead.com/.../capa.jpg"
    }
  ]
}
```

**Campos retornados:**
| Campo | Descrição | Uso no Projeto |
|-------|-----------|----------------|
| `nome` | Nome do curso | Título na vitrine |
| `aulas` | Quantidade de aulas | Info na página do curso |
| `preco` | Preço original (formato BR) | Referência, revendedor define o dele |
| `preco_promocional` | Preço com desconto | Referência |
| `parcelas` | Nº de parcelas sugeridas | Referência |
| `status` | ATIVO / INATIVO | Filtrar apenas ativos |
| `obs` | Descrição do curso | Texto na página do curso |
| `categoria_interna` | Categoria interna | Categorização |
| `carga_horaria` | Horas do curso | Info na vitrine |
| `categoria_loja` | Categoria da loja | Filtros na vitrine |
| `destaque` | Se é destaque | Seção de destaques |
| `preco_mostrar` | Mostrar preço? (Sim/Não) | Controle de exibição |
| `capa_image` | URL da imagem de capa | Imagem na vitrine |

**⚠️ Observações:**
- Não retorna ID do curso. Precisaremos inferir ou manter um mapa nome→ID
- Preço em formato BR ("1.400,00") — precisa parse
- Sem paginação documentada — retorna todos de uma vez

---

### 1.2 POST `cursos/aulas` — Listar aulas de um curso

**Descrição:** Retorna a lista de aulas/módulos de um curso específico.

| Parâmetro | Tipo | Obrigatório | Descrição |
|-----------|------|-------------|-----------|
| `token` | string | ✅ | Token de autenticação |
| `curso` | int | ✅ | ID do curso |

**Response (200):**
```json
{
  "erro": "",
  "resultado": [
    { "aula": "01 - Introdução" },
    { "aula": "02 - Conhecendo o programa" },
    { "aula": "03 - Criando novo banco de dados" }
  ]
}
```

**Uso no Projeto:** Exibir ementa/módulos na página do curso na vitrine.

---

## 2. FINANCEIRO (2 endpoints)

### 2.1 POST `financeiro/parcelas` — Ver parcelas do aluno

**Descrição:** Retorna os carnês e parcelas financeiras de um aluno.

| Parâmetro | Tipo | Obrigatório | Descrição |
|-----------|------|-------------|-----------|
| `token` | string | ✅ | Token de autenticação |
| `idaluno` | int | ✅ | ID do aluno |
| `idcarner` | int | ❌ | ID do carnê (filtro opcional) |

**Response (200):**
```json
{
  "erro": "",
  "resultado": {
    "carner": [
      {
        "Id carnê": "36",
        "Pacote": "BOLETOS BAIXADOS DO ASAAS",
        "Quantidade de parcelas": "7",
        "Data de criação": "18/06/2023",
        "Quitado": "Não quitado",
        "Link do carnê": null,
        "Desconto": null
      }
    ],
    "parcelas": [
      {
        "Id carnê": "36",
        "Valor": "100",
        "Vencimento": "2023-06-28",
        "Status": "NÃO PAGO",
        "Data de pagamento": "",
        "Valor pago": "100",
        "Quem recebeu": null,
        "Forma de pagamento": null,
        "Link do boleto": "https://www.asaas.com/b/pdf/...",
        "Código do boleto": "pay_xxxx",
        "Código da parcela": "uuid-xxx"
      }
    ]
  }
}
```

**Uso no Projeto:** Painel do revendedor para acompanhar situação financeira dos alunos. Complementar ao financeiro do Mercado Pago.

**⚠️ Observações:**
- A plataforma parceira usa Asaas internamente para boletos
- No nosso modelo, o financeiro principal é via Mercado Pago do revendedor
- Este endpoint serve para consulta/relatório complementar

---

### 2.2 POST `financeiro/recebimentos` — Relatório de faturamento / Inadimplentes

**Descrição:** Retorna relatório financeiro com filtro por período e status.

| Parâmetro | Tipo | Obrigatório | Descrição |
|-----------|------|-------------|-----------|
| `token` | string | ✅ | Token de autenticação |
| `inicial` | date | ✅ | Data inicial (YYYY-MM-DD) |
| `final` | date | ✅ | Data final (YYYY-MM-DD) |
| `status` | string | ❌ | "pago" ou "não pago" |

**Response (200):**
```json
{
  "erro": "",
  "resultado": [
    {
      "ID aluno": "3846",
      "Aluno": "Teste",
      "Fone": "(92) 99522-7798",
      "E-mail": "maria@gmail.com",
      "CPF": "",
      "Parcela": {
        "ID Parcela": "137",
        "ID carnê": "36",
        "Valor": "100",
        "Vencimento": "2023-06-28",
        "Status": "NÃO PAGO",
        "Data de pagamento": null
      }
    }
  ]
}
```

**Uso no Projeto:** Analytics no painel admin e painel do revendedor — relatórios de inadimplência da plataforma.

---

## 3. FUNCIONÁRIOS (1 endpoint)

### 3.1 POST `funcionarios/novo` — Criar novo funcionário

**Descrição:** Cria um novo funcionário/vendedor na plataforma.

| Parâmetro | Tipo | Obrigatório | Descrição |
|-----------|------|-------------|-----------|
| `token` | string | ✅ | Token de autenticação |
| `nome` | string | ✅ | Nome completo |
| `fone` | string | ❌ | Telefone |
| `email` | string | ❌ | Email |
| `cpf` | string | ❌ | CPF |
| `rg` | string | ❌ | RG |
| `rua` | string | ❌ | Logradouro |
| `bairro` | string | ❌ | Bairro |
| `cidade` | string | ❌ | Cidade |
| `estado` | string | ❌ | Estado |
| `numero` | string | ❌ | Número do endereço |
| `cep` | string | ❌ | CEP |
| `nascimento` | date | ❌ | Data nascimento (YYYY-MM-DD) |
| `senha` | string | ❌ | Senha (recomenda-se forte) |
| `tipo_acesso` | int | ✅ | ID do tipo de acesso (obtido no painel ADM) |
| `sexo` | string | ❌ | "masculino" ou "feminino" |

**Response (200):**
```json
{
  "erro": "",
  "resultado": {
    "login": 4016,
    "senha": 24917334,
    "nome": "Carla Souza"
  }
}
```

**Uso no Projeto:** Cada revendedor = 1 funcionário na plataforma. O `login` retornado é usado como `vendedor_id` para vincular alunos ao revendedor. Chamado durante o onboarding do revendedor.

**⚠️ Observações:**
- `tipo_acesso` precisa ser obtido manualmente no painel admin da plataforma
- Senha retornada em texto plano
- Não existe endpoint para editar ou listar funcionários

---

## 4. USUÁRIO / ALUNOS (17 endpoints)

### 4.1 POST `usuarios/novo` — Criar novo aluno

**Descrição:** Cadastra um novo aluno na plataforma. Endpoint PRINCIPAL para matrícula.

| Parâmetro | Tipo | Obrigatório | Descrição |
|-----------|------|-------------|-----------|
| `token` | string | ✅ | Token de autenticação |
| `nome` | string | ✅ | Nome completo |
| `fone` | string | ❌ | Telefone principal |
| `email` | string | ❌ | Email |
| `cpf` | string | ❌ | CPF |
| `rg` | string | ❌ | RG |
| `responsavel` | string | ❌ | Nome do responsável (menores) |
| `rua` | string | ❌ | Logradouro |
| `bairro` | string | ❌ | Bairro |
| `estado` | string | ❌ | Estado (sigla: AM, SP, etc.) |
| `cidade` | string | ❌ | Cidade |
| `numero` | string | ❌ | Número endereço |
| `nascimento` | date | ❌ | YYYY-MM-DD |
| `obs` | string | ❌ | Observações |
| `datacadastro` | date | ❌ | YYYY-MM-DD |
| `rg_responsavel` | string | ❌ | RG do responsável |
| `cpf_responsavel` | string | ❌ | CPF do responsável |
| `cep` | string | ❌ | CEP |
| `fone2` | string | ❌ | Telefone secundário |
| `polo` | string | ❌ | Nome do polo/unidade |
| `status` | string | ❌ | ativo, inativo, bloqueado, devedor, formado, interessado |
| `apostila` | string | ❌ | "liberar" ou "bloquear" |
| `vendedor` | int | ❌ | ID do funcionário/vendedor |
| `datafinal` | date | ❌ | Data final do acesso (YYYY-MM-DD) |
| `certificado` | string | ❌ | "S" para sim, "N" para não |
| `bolsista` | string | ❌ | "S" para sim, "N" para não |
| `funcionario_cadastro` | string | ❌ | Nome de quem cadastrou |
| `sexo` | string | ❌ | "feminino" ou "masculino" |

**Response (200):**
```json
{
  "erro": "",
  "resultado": {
    "login": 4017,
    "senha": 1751278,
    "nome": "Pietra2"
  }
}
```

**Uso no Projeto:**
- `polo` = slug do revendedor → identifica o tenant
- `vendedor` = ID do funcionário criado para o revendedor
- `status` = "ativo" ao matricular
- `apostila` = "liberar" para dar acesso
- `login` retornado = matrícula do aluno na plataforma (guardar como `plataforma_aluno_id`)
- `senha` retornada = credencial do aluno (enviar por email)

---

### 4.2 POST `usuarios/editar` — Editar dados do aluno

**Descrição:** Edita qualquer campo do aluno. Usado para bloqueio/desbloqueio.

| Parâmetro | Tipo | Obrigatório | Descrição |
|-----------|------|-------------|-----------|
| `token` | string | ✅ | Token de autenticação |
| `id_aluno` | int | ✅ | ID do aluno (login retornado no cadastro) |
| *(demais)* | - | ❌ | Mesmos campos de `usuarios/novo` |

Valores dos campos de estado, conforme a coleção oficial (conferida em 10/08/2026):

| Campo | Valores aceitos |
|---|---|
| `status` | `ativo`, `inativo`, `bloqueado`, `devedor`, `formado`, **`interessado`** |
| `apostila` | `liberar`, `bloquear` |
| `bolsista` | `s`, `n` |
| `certificado` | `s`, `n` |
| `datafinal` | `YYYY-MM-DD` |

> ### 🚨 `usuarios/editar` NÃO é um PATCH — campo omitido é campo RESETADO
>
> **Incidente de 05/08/2026.** A troca de senha mandava `usuarios/editar` com
> apenas `id_aluno` + `senha`. A plataforma reescreveu o cadastro inteiro com os
> defaults dela, e o default de `status` é **`interessado`** — o estágio de lead
> do CRM deles, sem acesso às aulas.
>
> Resultado: uma aluna com matrícula `ACTIVE`, curso vinculado e cupom de 100%
> amanheceu como "Interessado" e perdeu o acesso. **Nada aparecia do nosso
> lado** — `Student.status` continuava `ATIVO`, nenhum log, nenhum relatório.
> Silêncio total até a unidade abrir chamado.
>
> **Regra:** todo `usuarios/editar` sai de `pushPlatformState`
> (`src/lib/students/plataforma-actions.ts`) e carrega **sempre** `status`,
> `apostila` e `bolsista`, montados a partir do nosso registro. Nunca mandar uma
> edição parcial de campo de estado. A tradução dos enums e a montagem do
> payload ficam em `src/lib/students/platform-state.ts`; há teste que quebra o
> build se `editarAluno` for chamado de qualquer outro arquivo.
>
> Campos de perfil vazios do nosso lado saem como `undefined` (o `buildFormData`
> os descarta), então o que estiver na plataforma é preservado — asseveramos o
> que sabemos, não apagamos o que não sabemos. Se um dia se descobrir que a
> plataforma também reseta `certificado`/`datafinal`/`obs` numa edição, o campo
> entra no payload junto com a definição de quem é dono do valor.
>
> Para consertar quem já foi rebaixado: `POST /api/cron/resync-platform-state`
> (dry-run por padrão, `?apply=1` corrige, `?ids=4455` limita, `?force=1`
> reescreve mesmo sem divergência).
>
> **`status` é o único campo de estado observável.** `usuarios/listar` devolve
> `apostila: null` e `bolsista: null` **mesmo em aluno criado com
> `bolsista: "S"`** — verificado em 10/08/2026 contra 6 alunos de bolsa em
> produção (ids 4503, 4504, 4508, 4509, 4510, 4512): todos leram `null` na flag
> e `ATIVO` no status. Consequência prática: os dois campos entram em toda
> ESCRITA, mas nenhum pode ser usado como gatilho de divergência — comparar
> marcaria a base inteira como quebrada para sempre e a varredura reescreveria
> tudo a cada execução, sem nunca convergir. É por isso que existe o `force=1`.

> ### `bolsista` = "não vincule cobrança a este aluno"
>
> A flag existe no `novo` e no `editar`. Ela **não** é o nosso
> `Student.bolsista` (que significa "bolsa institucional concedida numa venda
> direta"): quem entra por **cupom de 100%** também precisa dela, senão vai para
> a plataforma como aluno pagante e cai no módulo financeiro da fornecedora sem
> nenhum pagamento a registrar. A derivação (por PESSOA, porque o login é único
> por CPF) fica em `resolvePlatformBolsista`. Enviamos sempre `S` ou `N`
> explícito — omitir cai no default deles.

**Response (200):**
```json
{
  "erro": "",
  "resultado": "Aluno editado com sucesso!"
}
```

**Uso no Projeto:**
- **Bloquear aluno inadimplente:** `status = "bloqueado"`, `apostila = "bloquear"`
- **Travar por cota de aulas:** `status = "devedor"`, `apostila = "bloquear"`
- **Reativar aluno:** `status = "ativo"`, `apostila = "liberar"`
- **Atualizar dados pessoais** se necessário

> ### Efeito de `status = "devedor"` — confirmado
>
> **`devedor` bloqueia o aluno COMPLETAMENTE** (verificado em jul/2026). Não é um
> rótulo: o acesso às aulas cai de fato. A lista oficial de valores está na coleção
> Postman do fornecedor ([documenter.getpostman.com/view/20632445/2s93z3f5Bt](https://documenter.getpostman.com/view/20632445/2s93z3f5Bt)),
> que documenta os valores aceitos mas **não** descreve o efeito de cada um — daí a
> verificação empírica.
>
> Duas consequências práticas:
>
> 1. **`devedor` e `bloqueado` travam igual.** A escolha entre os dois é
>    **semântica**, para o suporte da unidade saber na própria EA por que o aluno
>    parou: `bloqueado` = inadimplência, `devedor` = cota de aulas (venda parcelada
>    em dia, mas aluno adiantado no conteúdo). Ninguém deve tratar `devedor` como
>    trava "mais fraca" — não é.
> 2. **O bloqueio é por LOGIN, e o login é único por pessoa** (reaproveitado entre
>    unidades). Como ele derruba tudo, travar um aluno por causa de UM curso
>    parcelado tira dele os outros cursos — inclusive os já quitados, inclusive de
>    outra unidade. É exatamente por isso que a cota de aulas só corta o login
>    quando **nenhum** outro curso daquela pessoa está liberado
>    (`SystemSettings.paceGateStrict = false`, o padrão). Ver
>    `src/lib/enrollment/pace.ts`.

**🚫 NÃO dá para trocar a senha do aluno por aqui.** A lista oficial de campos de
`usuarios/editar` não inclui `senha` — esse campo só existe em
`funcionarios/novo`. Se enviado, a API **descarta em silêncio** e mesmo assim
responde `"Aluno editado com sucesso!"`. Verificado contra a coleção oficial
(Postman) em jul/2026.

Consequência prática: **nunca confie no retorno** para dar "senha alterada" como
certo. `changeStudentPlatformPassword` envia o campo e depois **relê**
`usuarios/listar` para confirmar; sem confirmação, não reporta sucesso e não
grava o snapshot local (foi exatamente esse falso positivo que corrompeu a senha
exibida na área do aluno).

Recuperação de senha do aluno: a tela de login da plataforma não faz reset
automatizado (o "Esqueci minha senha" de lá abre atendimento por WhatsApp do
fornecedor). O caminho self-service é nosso — área do aluno + `POST
/api/aluno/credenciais-plataforma`.

---

### 4.3 POST `usuarios/listar` — Buscar aluno

**Descrição:** Busca dados completos de um aluno por ID, CPF ou email.

| Parâmetro | Tipo | Obrigatório | Descrição |
|-----------|------|-------------|-----------|
| `token` | string | ✅ | Token de autenticação |
| `id` | int | ❌* | ID (login) do aluno |
| `cpf` | string | ❌* | CPF do aluno |
| `email` | string | ❌* | Email do aluno |

*Pelo menos um dos 3 é necessário para busca.

**Response (200):**
```json
{
  "erro": "",
  "resultado": {
    "nome": "Mary",
    "fone": "",
    "email": "",
    "cpf": "",
    "rg": "",
    "responsavel": "",
    "rua": "",
    "bairro": "",
    "estado": "",
    "cidade": "",
    "numero": "",
    "nascimento": "",
    "login": "3876",
    "senha": "16460",
    "obs": "",
    "datacadastro": "2023-05-04",
    "rg_responsavel": "",
    "cpf_responsavel": "",
    "cep": "",
    "fone2": "",
    "polo": "Manaus",
    "sexo": "MASCULINO",
    "status": "ATIVO",
    "apostila": null,
    "vendedor": null,
    "datafinal": null,
    "certificado": null,
    "bolsista": null,
    "funcionario_cadastro": "Master ID: 1"
  }
}
```

**Uso no Projeto:** Verificar se aluno já existe antes de cadastrar, consultar status do aluno, sync de dados.

**⚠️ Observações:**
- Retorna senha em texto plano
- Busca individual — NÃO lista todos os alunos de um polo
- Campo `polo` retornado — útil para validar vínculo com revendedor

---

### 4.4 POST `usuarios/vinculocurso` — Vincular curso ao aluno

**Descrição:** Vincula um ou mais cursos ao aluno. Sem os IDs específicos, vincula TODOS.

| Parâmetro | Tipo | Obrigatório | Descrição |
|-----------|------|-------------|-----------|
| `token` | string | ✅ | Token de autenticação |
| `aluno` | int | ✅ | ID do aluno |
| `idcurso` | int | ❌ | ID de um curso específico |
| `idcombo` | int | ❌ | ID de um combo/pacote |
| `categoria` | int | ❌ | ID de uma categoria |

**Se enviar apenas `aluno` sem os demais → vincula TODOS os cursos.**

**Response (200):**
```json
{ "erro": "", "resultado": "Todos os cursos vinculados!" }
```
ou
```json
{ "erro": "", "resultado": "Curso vinculado com sucesso!" }
```

**Uso no Projeto:** Chamado logo após `usuarios/novo` para dar acesso ao curso comprado.

---

### 4.5 DELETE `usuarios/remover_curso_combo` — Remover curso do aluno

**Descrição:** Remove curso(s) ou combo(s) vinculados ao aluno.

| Parâmetro | Via | Obrigatório | Descrição |
|-----------|-----|-------------|-----------|
| `token` | header | ✅ | Token de autenticação |
| `aluno` | header | ✅ | ID do aluno |
| `idcurso` | header | ❌ | ID do curso a remover |
| `idcombo` | header | ❌ | ID do combo a remover |

**⚠️ Se não passar `idcurso` nem `idcombo`, remove TUDO do aluno!**

**Response (200):**
```json
{ "erro": "", "resultado": "Cursos removidos com sucesso!" }
```

**Uso no Projeto:** Cancelamento de matrícula em curso específico. Cuidado: sem IDs remove tudo.

> ### ⛔ Desvincular ZERA o progresso do aluno
>
> Remover um curso e **revinculá-lo depois faz o aluno voltar do zero** — a EA não
> preserva o histórico de aulas assistidas (verificado em jul/2026). Consequências:
>
> - **Nunca** use `remover_curso_combo` como trava temporária de acesso. Para
>   suspender sem destruir progresso, use `usuarios/editar` com `status`
>   (`bloqueado` = inadimplência, `devedor` = cota de aulas) e/ou
>   `apostila: "bloquear"` — são flags reversíveis.
> - `unlinkCourseFromStudent` (`src/lib/students/plataforma-actions.ts`) chama este
>   endpoint no ramo EA. Ele é usado pelo cancelamento de matrícula
>   (`src/lib/enrollment/cancel.ts`, opção `removeAccess`), onde a perda é
>   aceitável — o aluno está perdendo o curso mesmo. Se um dia o cancelamento
>   virar reversível, **isto vira perda de dado**.
> - Vale também para o LMS: cursos de parceiro (`origin != "own"`) são
>   provisionados na EA por baixo, então um `revoke` que desvincule lá tem o mesmo
>   efeito. Ver a cláusula do contrato em `docs/api/lms-webhook-catalogo.md`.

---

### 4.6 POST `usuarios/notaspresenciais` — Exibir notas presenciais

**Descrição:** Retorna notas de provas presenciais do aluno.

| Parâmetro | Tipo | Obrigatório | Descrição |
|-----------|------|-------------|-----------|
| `token` | string | ✅ | Token |
| `idaluno` | int | ✅ | ID do aluno |

**Response (200):**
```json
{
  "erro": "",
  "resultado": [
    {
      "Prova": "Geologia prova",
      "Nota": "10",
      "Data_lancamento": "2023-04-11",
      "Curso": "Geologia"
    }
  ]
}
```

**Uso no Projeto:** Exibir no painel do revendedor como informação complementar. Baixa prioridade.

---

### 4.7 POST `usuarios/horarios` — Grade de horários do aluno

**Descrição:** Gera grade de horários para aulas presenciais.

| Parâmetro | Tipo | Obrigatório | Descrição |
|-----------|------|-------------|-----------|
| `token` | string | ✅ | Token |
| `idaluno` | int | ✅ | ID do aluno |
| `aulas_quant` | int | ✅ | Número de aulas |
| `dias_semanas` | string | ✅ | Dias da semana separados por vírgula (1=Dom...7=Sáb) |

**Uso no Projeto:** Relevante apenas se revendedores oferecerem aulas presenciais. Baixa prioridade.

---

### 4.8 POST `usuarios/vincularturma` — Vincular aluno na turma

**Descrição:** Vincula um aluno a uma turma específica.

| Parâmetro | Tipo | Obrigatório | Descrição |
|-----------|------|-------------|-----------|
| `token` | string | ✅ | Token |
| `idaluno` | int | ✅ | ID do aluno |
| `idturma` | int | ✅ | ID da turma |

**Response (200):**
```json
{ "erro": "", "resultado": "Aluno adicionado a turma!" }
// ou se já está:
{ "erro": "", "resultado": "O aluno já está nessa turma!" }
```

**Uso no Projeto:** Se revendedor usar turmas presenciais. Média prioridade.

---

### 4.9 DELETE `usuarios/removerturma` — Remover aluno da turma

**Descrição:** Remove aluno de uma turma.

| Parâmetro | Via | Obrigatório | Descrição |
|-----------|-----|-------------|-----------|
| `token` | header | ✅ | Token |
| `idaluno` | header | ✅ | ID do aluno |
| `idturma` | header | ✅ | ID da turma |

**Response (200):**
```json
{ "erro": "", "resultado": "Aluno removido da turma!" }
```

---

### 4.10 POST `usuarios/listarturma` — Listar turmas do aluno

**Descrição:** Lista as turmas em que o aluno está matriculado.

| Parâmetro | Tipo | Obrigatório | Descrição |
|-----------|------|-------------|-----------|
| `token` | string | ✅ | Token |
| `idaluno` | int | ✅ | ID do aluno |

**Response (200):**
```json
{
  "erro": "",
  "resultado": [
    {
      "ID Turma": "9",
      "Nome da turma": "teste",
      "Horário da turma": "08:34",
      "Dia da semana": "SEGUNDA",
      "Início da turma": "2023-05-29",
      "Fim da turma": "2023-05-31",
      "Status da turma": "ATIVO",
      "Professor": "Administrador",
      "Sala de aula": "POLO POUSADA SERRA NEGRA",
      "Data da matrícula na turma": "20/06/2023"
    }
  ]
}
```

---

### 4.11 GET `usuarios/niver` — Aniversariantes do mês

**Descrição:** Lista alunos que fazem aniversário no mês atual.

| Parâmetro | Via | Obrigatório | Descrição |
|-----------|-----|-------------|-----------|
| `token` | header | ✅ | Token |

**Uso no Projeto:** Feature de engajamento — revendedor pode enviar mensagens de aniversário. Média prioridade.

---

### 4.12 POST `usuarios/contrato` — Baixar contrato do aluno em PDF

**Descrição:** Retorna dados dos contratos emitidos para o aluno.

| Parâmetro | Tipo | Obrigatório | Descrição |
|-----------|------|-------------|-----------|
| `token` | string | ✅ | Token |
| `idaluno` | int | ✅ | ID do aluno |

**Response (200):**
```json
{
  "erro": "",
  "resultado": [
    {
      "Id do contrato": "33",
      "Data emissão": "2023-06-20",
      "Hash do contrato": "5fe9139cdb739f3e98e4e71896ee5f2f",
      "Data e hora da emissão": "2023-06-20 12:12:51",
      "Funcionário": "Master",
      "Link do PDF": "https://estudanteead.com/.../contrato.pdf?version=6435",
      "Link para assinatura": "https://estudanteead.com/oficial/assine.php?c=FA168...",
      "Status": "Não assinado",
      "IP do aluno": null,
      "Data da assinatura": null
    }
  ]
}
```

**Uso no Projeto:** Link de contrato disponível no painel do revendedor e enviado ao aluno após matrícula. Assinatura digital já embutida.

---

### 4.13 POST `usuarios/enviarmensagem` — Enviar mensagem ao aluno

**Descrição:** Envia uma mensagem para a Área do Aluno dentro da plataforma.

| Parâmetro | Tipo | Obrigatório | Descrição |
|-----------|------|-------------|-----------|
| `token` | string | ✅ | Token |
| `idaluno` | int | ✅ | ID do aluno |
| `idfuncionario` | int | ❌ | ID do funcionário remetente |
| `mensagem` | string | ✅ | Texto da mensagem (sem HTML) |

**Response (200):**
```json
{ "erro": "", "resultado": "Mensagem Enviada com sucesso!" }
```

**Uso no Projeto:** Comunicação revendedor→aluno via plataforma. Ex: aviso de vencimento, boas-vindas, etc.

**⚠️ Não suporta HTML na mensagem.**

---

### 4.14 GET `usuarios/melhores` — Melhores alunos da semana

**Descrição:** Retorna ranking dos melhores alunos da semana (por engajamento).

| Parâmetro | Via | Obrigatório | Descrição |
|-----------|-----|-------------|-----------|
| `token` | header | ✅ | Token |

**Uso no Projeto:** Feature de gamificação na vitrine ou painel. Baixa prioridade.

---

### 4.15 POST `usuarios/cursosvinculados` — Cursos vinculados ao aluno

**Descrição:** Lista todos os cursos que o aluno tem acesso com progresso.

| Parâmetro | Tipo | Obrigatório | Descrição |
|-----------|------|-------------|-----------|
| `token` | string | ✅ | Token |
| `id_aluno` | int | ✅ | ID do aluno |

**Response (200):**
```json
{
  "erro": "",
  "resultado": [
    {
      "Curso": "Libras",
      "Data do cadastro": "22/05/2023",
      "Situação": "EM ANDAMENTO",
      "Porcentagem": "1%",
      "Data da última aula": "2023-05-22"
    },
    {
      "Curso": "Windows 11 Kids",
      "Data do cadastro": "05/05/2023",
      "Situação": "CONCLUÍDO",
      "Porcentagem": "95%",
      "Data da última aula": "2023-06-19"
    }
  ]
}
```

**Uso no Projeto:** Painel do revendedor — ver progresso dos alunos. Excelente para analytics e relatórios. ALTA PRIORIDADE.

**Campos retornados:**
| Campo | Uso |
|-------|-----|
| `Curso` | Nome do curso |
| `Data do cadastro` | Quando foi vinculado |
| `Situação` | EM ANDAMENTO / CONCLUÍDO |
| `Porcentagem` | Progresso do aluno |
| `Data da última aula` | Último acesso |

---

### 4.16 POST `usuarios/envioemail` — Envio de email com login e senha

**Descrição:** Envia email automático ao aluno com suas credenciais de acesso.

| Parâmetro | Tipo | Obrigatório | Descrição |
|-----------|------|-------------|-----------|
| `token` | string | ✅ | Token |
| `aluno` | int | ✅ | ID do aluno |

**Response (200):**
```json
{ "erro": "", "resultado": "E-mail enviado!" }
```

**Uso no Projeto:** Chamado automaticamente após matrícula (`usuarios/novo` + `usuarios/vinculocurso` + `usuarios/envioemail`).

---

## 5. RESUMO: MAPA DE USO NO PROJETO

### 🟢 Endpoints ESSENCIAIS (usados no fluxo principal)

| # | Endpoint | Quando usar |
|---|----------|-------------|
| 1 | `cursos/listar` | Sync diário do catálogo |
| 2 | `cursos/aulas` | Exibir ementa na vitrine |
| 3 | `funcionarios/novo` | Onboarding do revendedor (1x) |
| 4 | `usuarios/novo` | Matrícula do aluno (após pagamento) |
| 5 | `usuarios/editar` | Bloquear/desbloquear aluno |
| 6 | `usuarios/listar` | Verificar se aluno existe, consultar status |
| 7 | `usuarios/vinculocurso` | Vincular curso após matrícula |
| 8 | `usuarios/cursosvinculados` | Progresso do aluno (painel revendedor) |
| 9 | `usuarios/envioemail` | Enviar credenciais ao aluno |

### 🟡 Endpoints ÚTEIS (painel do revendedor / analytics)

| # | Endpoint | Quando usar |
|---|----------|-------------|
| 10 | `financeiro/parcelas` | Relatório financeiro complementar |
| 11 | `financeiro/recebimentos` | Relatório de inadimplentes |
| 12 | `usuarios/contrato` | Disponibilizar contrato PDF |
| 13 | `usuarios/enviarmensagem` | Comunicação revendedor → aluno |
| 14 | `usuarios/remover_curso_combo` | Cancelamento de curso |
| 15 | `usuarios/niver` | Engajamento — aniversariantes |

### 🔵 Endpoints de BAIXA PRIORIDADE (features futuras)

| # | Endpoint | Quando usar |
|---|----------|-------------|
| 16 | `usuarios/notaspresenciais` | Notas de provas (presencial) |
| 17 | `usuarios/horarios` | Grade horária (presencial) |
| 18 | `usuarios/vincularturma` | Gestão de turmas (presencial) |
| 19 | `usuarios/removerturma` | Gestão de turmas |
| 20 | `usuarios/listarturma` | Gestão de turmas |
| 21 | `usuarios/melhores` | Gamificação/ranking |

---

## 6. LIMITAÇÕES E GAPS IDENTIFICADOS

### Endpoints que NÃO existem (e precisamos contornar)

| Funcionalidade necessária | Existe na API? | Contorno |
|---------------------------|----------------|----------|
| Listar TODOS alunos de um polo | ❌ | Manter banco próprio como fonte principal |
| Deletar aluno | ❌ | Usar `editar` com status="inativo" |
| Listar funcionários | ❌ | Guardar IDs no nosso banco durante criação |
| Editar funcionário | ❌ | Criar novo se necessário |
| Criar polo/unidade | ❌ | O polo é apenas um campo texto no aluno |
| Listar polos | ❌ | Gerenciar no nosso banco |
| Obter ID do curso | ❌ | `cursos/listar` não retorna ID. Testar se retorna ou manter mapa |
| Webhook/callback | ❌ | Sync periódico via cron |
| Buscar por polo | ❌ | Não tem filtro por polo no `listar` |
| Listar turmas disponíveis | ❌ | Gerenciar no nosso banco |

### Padrões técnicos importantes

1. **Métodos DELETE enviam parâmetros via HEADERS**, não via body
2. **Métodos POST enviam via form-data**, não JSON
3. **Sem paginação** — todas as listas vêm completas
4. **Sem rate limiting documentado** — implementar proteção do nosso lado
5. **Sem versionamento além do V2** — API única
6. **Respostas sempre 200** — erros vêm no campo `"erro"` do JSON
7. **IDs retornados como strings** em alguns endpoints e como números em outros
8. **Datas em formatos mistos** — "DD/MM/YYYY" em alguns, "YYYY-MM-DD" em outros
9. **Preços em formato BR** — "1.400,00" (precisa parse para float)
