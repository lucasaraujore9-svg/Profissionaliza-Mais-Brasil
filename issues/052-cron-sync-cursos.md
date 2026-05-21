# Issue 052 — Cron: Sincronizar Cursos plataforma parceira

**Tipo:** integration
**Página:** global
**Depende de:** 020, 024
**Prioridade:** P1

## O Que Fazer

Implementar cron job diário (6am) que sincroniza cursos da plataforma parceira com DB. GET plataforma cursos/listar, compara com DB, cria/atualiza courses, log resultado.

## Componentes Envolvidos
- Vercel Cron (ou trigger manual)
- GET /api/cron/sync-courses
- lib/plataforma-cursos client: cursos/listar endpoint
- SyncLog table — histórico sincronizações

## Comportamentos
- `trigger-cron-6am` — executar diariamente 6am
- `get-ea-courses` — GET plataforma cursos/listar
- `compare-with-db` — comparar cursos novos vs DB
- `create-courses` — INSERT courses novos
- `update-courses` — UPDATE courses modificados
- `log-sync-result` — registrar em SyncLog

## Critério de Aceite
- [ ] GET /api/cron/sync-courses implementado
- [ ] Verifica CRON_SECRET header
- [ ] GET plataforma cursos/listar usando lib/plataforma-cursos
- [ ] Parse resposta, extrai lista cursos plataforma
- [ ] Para cada curso, query DB por ea_course_id
- [ ] Se não existe, CREATE Course { ea_course_id, title, description, ... }
- [ ] Se existe, UPDATE com dados novos
- [ ] Cria SyncLog { status: SUCCESS, courses_added, courses_updated, courses_deleted, timestamp }
- [ ] Se erro, SyncLog { status: ERROR, error_message }
- [ ] Logging detalhado para debug
- [ ] Execução rápida (<30s)
