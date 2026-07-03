/**
 * PERF-013: executa `fn` sobre `items` em lotes de `size` operações CONCORRENTES,
 * preservando a ordem dos resultados. Usa `Promise.allSettled` por lote — cada
 * item falha/sucede isoladamente (nenhum aborta os demais).
 *
 * Por que isto é seguro sobre o pooler do Supabase (@prisma/adapter-pg): o padrão
 * PROIBIDO no repo é `prisma.$transaction([...map])` (lote dinâmico que derruba
 * tudo em prod — ver 019a253/DB-004). Updates/queries INDIVIDUAIS disparados em
 * paralelo (mesmo via Promise.all) funcionam normalmente; `size` limita quantos
 * ocupam o pool ao mesmo tempo.
 */
export async function runInChunks<T, R>(
  items: readonly T[],
  size: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<PromiseSettledResult<R>[]> {
  if (size < 1) throw new Error("runInChunks: size deve ser >= 1")
  const results: PromiseSettledResult<R>[] = []
  for (let i = 0; i < items.length; i += size) {
    const chunk = items.slice(i, i + size)
    const settled = await Promise.allSettled(
      chunk.map((item, j) => fn(item, i + j)),
    )
    results.push(...settled)
  }
  return results
}
