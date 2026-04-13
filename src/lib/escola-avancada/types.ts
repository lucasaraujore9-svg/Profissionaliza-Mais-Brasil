// ── API Response envelope ──
export interface EAResponse<T> {
  erro: string
  resultado: T
}

// ── Cursos ──
export interface EACurso {
  nome: string
  aulas: string
  preco: string
  preco_promocional: string
  parcelas: string
  status: string
  obs: string
  categoria_interna: string
  carga_horaria: string
  categoria_loja: string
  destaque: string
  preco_mostrar: string
  capa_image: string
}

export interface EAAula {
  aula: string
}

// ── Usuarios/Alunos ──
export interface EANovoAlunoParams {
  nome: string
  fone?: string
  email?: string
  cpf?: string
  rg?: string
  responsavel?: string
  rua?: string
  bairro?: string
  estado?: string
  cidade?: string
  numero?: string
  nascimento?: string
  obs?: string
  datacadastro?: string
  rg_responsavel?: string
  cpf_responsavel?: string
  cep?: string
  fone2?: string
  polo?: string
  status?: string
  apostila?: string
  vendedor?: number
  datafinal?: string
  certificado?: string
  bolsista?: string
  funcionario_cadastro?: string
  sexo?: string
}

export interface EANovoAlunoResult {
  login: number
  senha: number
  nome: string
}

export interface EAEditarAlunoParams extends Partial<EANovoAlunoParams> {
  id_aluno: number
}

export interface EAAluno {
  nome: string
  fone: string
  email: string
  cpf: string
  rg: string
  responsavel: string
  rua: string
  bairro: string
  estado: string
  cidade: string
  numero: string
  nascimento: string
  login: string
  senha: string
  obs: string
  datacadastro: string
  rg_responsavel: string
  cpf_responsavel: string
  cep: string
  fone2: string
  polo: string
  sexo: string
  status: string
  apostila: string | null
  vendedor: string | null
  datafinal: string | null
  certificado: string | null
  bolsista: string | null
  funcionario_cadastro: string
}

export interface EAVinculoCursoParams {
  aluno: number
  idcurso?: number
  idcombo?: number
  categoria?: number
}

export interface EACursoVinculado {
  Curso: string
  "Data do cadastro": string
  "Situação": string
  "Porcentagem": string
  "Data da última aula": string
}

// ── Funcionarios ──
export interface EANovoFuncionarioParams {
  nome: string
  fone?: string
  email?: string
  cpf?: string
  rg?: string
  rua?: string
  bairro?: string
  cidade?: string
  estado?: string
  numero?: string
  cep?: string
  nascimento?: string
  senha?: string
  tipo_acesso: number
  sexo?: string
}

export interface EANovoFuncionarioResult {
  login: number
  senha: number
  nome: string
}

// ── Financeiro ──
export interface EAParcelasParams {
  idaluno: number
  idcarner?: number
}

export interface EACarner {
  "Id carnê": string
  Pacote: string
  "Quantidade de parcelas": string
  "Data de criação": string
  Quitado: string
  "Link do carnê": string | null
  Desconto: string | null
}

export interface EAParcela {
  "Id carnê": string
  Valor: string
  Vencimento: string
  Status: string
  "Data de pagamento": string
  "Valor pago": string
  "Quem recebeu": string | null
  "Forma de pagamento": string | null
  "Link do boleto": string
  "Código do boleto": string
  "Código da parcela": string
}

export interface EARecebimentosParams {
  inicial: string
  final: string
  status?: string
}

// ── Mensagem ──
export interface EAEnviarMensagemParams {
  idaluno: number
  idfuncionario?: number
  mensagem: string
}

// ── Remover curso ──
export interface EARemoverCursoParams {
  aluno: number
  idcurso?: number
  idcombo?: number
}
