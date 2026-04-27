-- ============================================================
-- OWN Comissões — Setup Completo do Banco de Dados
-- Execute este script no SQL Editor do Supabase
-- ============================================================

-- 1. Tabela de Ciclos (Meses de faturamento)
-- Pode não existir se foi criada apenas no sistema Prévia
CREATE TABLE IF NOT EXISTS previa_cycles (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  month_year TEXT NOT NULL,  -- Ex: "Abril 2025", "Maio 2025"
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 2. Garantir RLS aberto nas tabelas compartilhadas com o Prévia
-- (previa_units e previa_barbers são gerenciadas pelo own-previa)
-- Se ainda não tiverem política pública, cria:

ALTER TABLE previa_units ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Acesso publico previa_units" ON previa_units;
CREATE POLICY "Acesso publico previa_units" ON previa_units FOR ALL USING (true);

ALTER TABLE previa_barbers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Acesso publico previa_barbers" ON previa_barbers;
CREATE POLICY "Acesso publico previa_barbers" ON previa_barbers FOR ALL USING (true);

ALTER TABLE previa_cycles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Acesso publico previa_cycles" ON previa_cycles;
CREATE POLICY "Acesso publico previa_cycles" ON previa_cycles FOR ALL USING (true);

-- 3. Tabela de lançamentos manuais de comissão
CREATE TABLE IF NOT EXISTS previa_manual_payments (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  unit_id UUID REFERENCES previa_units(id) ON DELETE CASCADE,
  barber_id UUID REFERENCES previa_barbers(id) ON DELETE CASCADE,
  cycle_id UUID REFERENCES previa_cycles(id) ON DELETE CASCADE,
  quinzena_1 NUMERIC DEFAULT 0,
  quinzena_2_avulso NUMERIC DEFAULT 0,
  mes_assinatura NUMERIC DEFAULT 0,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'paid')),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(barber_id, cycle_id)
);

ALTER TABLE previa_manual_payments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Acesso total para todos" ON previa_manual_payments;
CREATE POLICY "Acesso total para todos" ON previa_manual_payments FOR ALL USING (true);

-- 4. Tabela de vales/adiantamentos
CREATE TABLE IF NOT EXISTS previa_barber_vouchers (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  barber_id UUID REFERENCES previa_barbers(id) ON DELETE CASCADE,
  cycle_id UUID REFERENCES previa_cycles(id) ON DELETE CASCADE,
  value NUMERIC DEFAULT 0,
  description TEXT,
  date DATE DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE previa_barber_vouchers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Acesso total para todos" ON previa_barber_vouchers;
CREATE POLICY "Acesso total para todos" ON previa_barber_vouchers FOR ALL USING (true);

-- 5. Dados de exemplo para ciclos (caso a tabela esteja vazia)
-- Descomente e ajuste conforme necessário:
-- INSERT INTO previa_cycles (month_year) VALUES
--   ('Abril 2025'),
--   ('Maio 2025'),
--   ('Junho 2025')
-- ON CONFLICT DO NOTHING;
