import {
  type EAResponse,
  type EACurso,
  type EAAula,
  type EANovoAlunoParams,
  type EANovoAlunoResult,
  type EAEditarAlunoParams,
  type EAAluno,
  type EAVinculoCursoParams,
  type EACursoVinculado,
  type EANovoFuncionarioParams,
  type EANovoFuncionarioResult,
  type EAParcelasParams,
  type EARecebimentosParams,
  type EAEnviarMensagemParams,
  type EARemoverCursoParams,
} from "./types"
import { EAApiError, EANetworkError } from "./errors"

const MAX_RETRIES = 3
const INITIAL_BACKOFF_MS = 500

function getConfig() {
  const url = process.env.EA_API_URL
  const token = process.env.EA_API_TOKEN
  if (!url || !token) {
    throw new Error("EA_API_URL and EA_API_TOKEN environment variables are required")
  }
  return { url: url.replace(/\/$/, ""), token }
}

function buildFormData(
  token: string,
  params: Record<string, unknown>,
): FormData {
  const formData = new FormData()
  formData.append("token", token)
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null) {
      formData.append(key, String(value))
    }
  }
  return formData
}

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function requestWithRetry<T>(
  endpoint: string,
  options: RequestInit,
): Promise<EAResponse<T>> {
  const { url } = getConfig()
  const fullUrl = `${url}/${endpoint}`

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const res = await fetch(fullUrl, options)

      if (!res.ok) {
        throw new EAApiError(
          `HTTP ${res.status}: ${res.statusText}`,
          endpoint,
          res.status,
        )
      }

      const data = (await res.json()) as EAResponse<T>

      if (data.erro && data.erro.length > 0) {
        throw new EAApiError(
          `EA API error: ${data.erro}`,
          endpoint,
          200,
          data.erro,
        )
      }

      return data
    } catch (error) {
      if (error instanceof EAApiError) {
        // Don't retry API-level errors (validation, etc.)
        if (error.apiError) throw error
        // Retry HTTP errors (500, 502, 503)
        if (error.statusCode && error.statusCode < 500) throw error
      }

      if (attempt === MAX_RETRIES) {
        if (error instanceof EAApiError) throw error
        throw new EANetworkError(
          `Failed after ${MAX_RETRIES + 1} attempts: ${endpoint}`,
          endpoint,
          error,
        )
      }

      const backoff = INITIAL_BACKOFF_MS * Math.pow(2, attempt)
      if (process.env.NODE_ENV === "development") {
        console.warn(`[EA] Retry ${attempt + 1}/${MAX_RETRIES} for ${endpoint} in ${backoff}ms`)
      }
      await sleep(backoff)
    }
  }

  throw new EANetworkError("Unexpected retry exhaustion", endpoint)
}

async function postFormData<T>(
  endpoint: string,
  params: Record<string, unknown> = {},
): Promise<T> {
  const { token } = getConfig()
  const formData = buildFormData(token, params)

  const data = await requestWithRetry<T>(endpoint, {
    method: "POST",
    body: formData,
  })

  return data.resultado
}

async function getWithHeaders<T>(
  endpoint: string,
  extraHeaders: Record<string, string> = {},
): Promise<T> {
  const { token } = getConfig()

  const data = await requestWithRetry<T>(endpoint, {
    method: "GET",
    headers: { token, ...extraHeaders },
  })

  return data.resultado
}

async function deleteWithHeaders<T>(
  endpoint: string,
  headers: Record<string, string>,
): Promise<T> {
  const { token } = getConfig()

  const data = await requestWithRetry<T>(endpoint, {
    method: "DELETE",
    headers: { token, ...headers },
  })

  return data.resultado
}

// ══════════════════════════════════════════════
// CURSOS
// ══════════════════════════════════════════════

export async function listarCursos(categoria?: number): Promise<EACurso[]> {
  const params: Record<string, unknown> = {}
  if (categoria !== undefined) params.categoria = categoria
  return postFormData<EACurso[]>("cursos/listar", params)
}

export async function listarAulas(cursoId: number): Promise<EAAula[]> {
  return postFormData<EAAula[]>("cursos/aulas", { curso: cursoId })
}

// ══════════════════════════════════════════════
// FUNCIONARIOS
// ══════════════════════════════════════════════

export async function criarFuncionario(
  params: EANovoFuncionarioParams,
): Promise<EANovoFuncionarioResult> {
  return postFormData<EANovoFuncionarioResult>("funcionarios/novo", params)
}

// ══════════════════════════════════════════════
// USUARIOS / ALUNOS
// ══════════════════════════════════════════════

export async function criarAluno(
  params: EANovoAlunoParams,
): Promise<EANovoAlunoResult> {
  return postFormData<EANovoAlunoResult>("usuarios/novo", params)
}

export async function editarAluno(
  params: EAEditarAlunoParams,
): Promise<string> {
  return postFormData<string>("usuarios/editar", params)
}

export async function buscarAluno(
  filter: { id?: number; cpf?: string; email?: string },
): Promise<EAAluno> {
  return postFormData<EAAluno>("usuarios/listar", filter)
}

export async function vincularCurso(
  params: EAVinculoCursoParams,
): Promise<string> {
  return postFormData<string>("usuarios/vinculocurso", params)
}

export async function removerCurso(
  params: EARemoverCursoParams,
): Promise<string> {
  const headers: Record<string, string> = {
    aluno: String(params.aluno),
  }
  if (params.idcurso !== undefined) headers.idcurso = String(params.idcurso)
  if (params.idcombo !== undefined) headers.idcombo = String(params.idcombo)
  return deleteWithHeaders<string>("usuarios/remover_curso_combo", headers)
}

export async function cursosVinculados(
  idAluno: number,
): Promise<EACursoVinculado[]> {
  return postFormData<EACursoVinculado[]>("usuarios/cursosvinculados", {
    id_aluno: idAluno,
  })
}

export async function enviarEmailCredenciais(
  alunoId: number,
): Promise<string> {
  return postFormData<string>("usuarios/envioemail", { aluno: alunoId })
}

export async function enviarMensagem(
  params: EAEnviarMensagemParams,
): Promise<string> {
  return postFormData<string>("usuarios/enviarmensagem", params)
}

export async function notasPresenciais(
  idAluno: number,
): Promise<unknown[]> {
  return postFormData<unknown[]>("usuarios/notaspresenciais", {
    idaluno: idAluno,
  })
}

export async function horarios(
  idAluno: number,
  aulasQuant: number,
  diasSemanas: string,
): Promise<unknown> {
  return postFormData<unknown>("usuarios/horarios", {
    idaluno: idAluno,
    aulas_quant: aulasQuant,
    dias_semanas: diasSemanas,
  })
}

export async function vincularTurma(
  idAluno: number,
  idTurma: number,
): Promise<string> {
  return postFormData<string>("usuarios/vincularturma", {
    idaluno: idAluno,
    idturma: idTurma,
  })
}

export async function removerTurma(
  idAluno: number,
  idTurma: number,
): Promise<string> {
  return deleteWithHeaders<string>("usuarios/removerturma", {
    idaluno: String(idAluno),
    idturma: String(idTurma),
  })
}

export async function listarTurmasAluno(
  idAluno: number,
): Promise<unknown[]> {
  return postFormData<unknown[]>("usuarios/listarturma", {
    idaluno: idAluno,
  })
}

export async function aniversariantes(): Promise<unknown[]> {
  return getWithHeaders<unknown[]>("usuarios/niver")
}

export async function melhoresAlunos(): Promise<unknown[]> {
  return getWithHeaders<unknown[]>("usuarios/melhores")
}

export async function contratosAluno(
  idAluno: number,
): Promise<unknown[]> {
  return postFormData<unknown[]>("usuarios/contrato", { idaluno: idAluno })
}

// ══════════════════════════════════════════════
// FINANCEIRO
// ══════════════════════════════════════════════

export async function parcelasAluno(
  params: EAParcelasParams,
): Promise<{ carner: unknown[]; parcelas: unknown[] }> {
  return postFormData<{ carner: unknown[]; parcelas: unknown[] }>(
    "financeiro/parcelas",
    params,
  )
}

export async function recebimentos(
  params: EARecebimentosParams,
): Promise<unknown[]> {
  return postFormData<unknown[]>("financeiro/recebimentos", params)
}
