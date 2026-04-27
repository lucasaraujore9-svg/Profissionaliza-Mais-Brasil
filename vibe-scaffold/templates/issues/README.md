# Issues

Cada arquivo aqui e uma unidade atomica de trabalho.

## Convencao de numeracao

- `001-019` — Prototipos de UI (tipo: proto). Dados hardcoded, foco em design.
- `020-029` — Infraestrutura (tipo: infra). Auth, middleware, db, clients de API, crypto, cache, email.
- `030-049` — Behaviors (tipo: behavior). Conectar UI a dados reais.
- `050-059` — Integracoes (tipo: integration). Webhooks, cron, jobs async.
- `060+` — Expansoes, redesigns, novas features.

## Estados

- Titulo sem marcador = pendente
- Titulo com 🚧 = em progresso
- Titulo com ✅ = completada

## Ciclo

1. `/next` sugere a proxima
2. `/plan NNN` le issue + docs, produz plano
3. `/execute NNN` implementa
4. `/review NNN` valida qualidade
5. Marcar com ✅

## Template

Ver `template.md`.
