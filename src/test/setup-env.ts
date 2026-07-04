// Setup global do Vitest: garante as envs SEMPRE obrigatórias (sem
// requiredInProd) antes de qualquer import dos módulos sob teste.
//
// Por que existe: `src/lib/env.ts` valida `process.env` na 1ª leitura (proxy
// lazy). Módulos que leem `env.X` em nível de módulo (ex.: constantes de
// configuração como retenção/placar/suporte) disparam essa validação já no
// IMPORT — antes de qualquer linha do arquivo de teste. Em `NODE_ENV=test` as
// envs `requiredInProd` viram opcionais, mas `DATABASE_URL` é obrigatória em
// todo ambiente. Este setup roda antes dos test files, então cobre o caso.
//
// `??=` preserva um DATABASE_URL real caso o ambiente já defina um.
process.env.DATABASE_URL ??= "postgresql://user:pass@localhost:5432/test"
