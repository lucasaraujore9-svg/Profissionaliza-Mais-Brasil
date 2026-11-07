-- Curso nao tem mais forma de pagamento: venda parcelada so na venda direta
-- (decisao do dono 2026-11-06). Cursos MONTHLY viram pagamento unico pelo
-- TOTAL que a vitrine ja cobrava (vitrineCoursePrice: preco e "De" x meses).
-- Ordem importa: tenant_courses le courses.monthly_months_main antes de o
-- segundo UPDATE zera-lo. Idempotente: a 2a execucao nao acha linha MONTHLY.
UPDATE tenant_courses tc
SET price = ROUND(tc.price * COALESCE(tc.custom_parcelas, c.monthly_months_main, 12), 2),
    preco_de = CASE WHEN tc.preco_de IS NULL THEN NULL
                    ELSE ROUND(tc.preco_de * COALESCE(tc.custom_parcelas, c.monthly_months_main, 12), 2) END,
    payment_type = 'ONE_TIME',
    custom_parcelas = NULL
FROM courses c
WHERE c.id = tc.course_id AND tc.payment_type = 'MONTHLY';

-- Vitrine PMB: sem override (preco_vitrine_main NULL) o preco vinha do FEED
-- (preco_promocional ?? preco_original, como no /api/checkout) x meses. O feed
-- e reescrito pelo sync e continua sendo o valor da mensalidade, entao o total
-- e materializado no override — senao o curso cairia para UMA mensalidade.
UPDATE courses
SET preco_vitrine_main = CASE
      WHEN COALESCE(preco_vitrine_main, preco_promocional, preco_original) IS NULL THEN NULL
      ELSE ROUND(COALESCE(preco_vitrine_main, preco_promocional, preco_original) * COALESCE(monthly_months_main, 12), 2) END,
    preco_de_vitrine_main = CASE WHEN preco_de_vitrine_main IS NULL THEN NULL
                                 ELSE ROUND(preco_de_vitrine_main * COALESCE(monthly_months_main, 12), 2) END,
    payment_type_main = 'ONE_TIME',
    monthly_months_main = NULL
WHERE payment_type_main = 'MONTHLY';
