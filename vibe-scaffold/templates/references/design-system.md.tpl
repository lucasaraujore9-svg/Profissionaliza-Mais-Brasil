# Design System — {{NOME}}

## Paleta

{{PALETA}}

## Tipografia

- Headings: {{FONT_HEADING}}
- Body: {{FONT_BODY}}
- Mono/Codigo: {{FONT_MONO}}

## Escala tipografica

| Token | Uso | Tamanho |
|-------|-----|---------|
| display | hero | 48-72px |
| h1 | titulo pagina | 36px |
| h2 | secao | 28px |
| h3 | card titulo | 20px |
| body | texto | 16px |
| small | meta | 14px |

## Spacing

Sistema 4px: 4, 8, 12, 16, 24, 32, 48, 64, 96.

## Componentes base

- Button (primary, secondary, ghost, destructive)
- Input, Textarea, Select, Checkbox, Radio, Switch
- Card, Dialog, Sheet, Dropdown, Toast
- Table com sort/filter
- Skeleton e Empty state padroes

Base: shadcn/ui. Custom variants em `components/ui/`.

## Responsive

Mobile-first. Breakpoints Tailwind: sm 640, md 768, lg 1024, xl 1280, 2xl 1536.

## Acessibilidade

- Todo input com `<label>` associado
- Todo botao com texto ou `aria-label`
- Focus visivel em todos os elementos interativos
- Contraste AA minimo
- Imagens com `alt` descritivo
