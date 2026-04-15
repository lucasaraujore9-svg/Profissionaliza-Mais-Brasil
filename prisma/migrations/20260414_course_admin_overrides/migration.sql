ALTER TABLE courses ADD COLUMN preco_vitrine_main DECIMAL(10,2);
ALTER TABLE courses ADD COLUMN destaque_home BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE courses ADD COLUMN ordem_home INTEGER;
ALTER TABLE courses ADD COLUMN descricao_override TEXT;
ALTER TABLE courses ADD COLUMN capa_override TEXT;
CREATE INDEX courses_destaque_home_idx ON courses(destaque_home, ordem_home);
