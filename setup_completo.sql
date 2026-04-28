-- ============================================================
-- OWN Comissões — Setup Completo do Banco de Dados
-- Execute este script no SQL Editor do Supabase
-- ============================================================

-- 1. Garantir RLS aberto nas tabelas compartilhadas com o Prévia
-- (previa_units e previa_barbers são gerenciadas pelo own-previa)
-- Se ainda não tiverem política pública, cria:

ALTER TABLE previa_units ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Acesso publico previa_units" ON previa_units;
CREATE POLICY "Acesso publico previa_units" ON previa_units FOR ALL USING (true);

ALTER TABLE previa_barbers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Acesso publico previa_barbers" ON previa_barbers;
CREATE POLICY "Acesso publico previa_barbers" ON previa_barbers FOR ALL USING (true);

-- Adicionar campos de Chave Pix, Credenciais Gov.br e CNPJ se não existirem
ALTER TABLE previa_barbers ADD COLUMN IF NOT EXISTS pix_key TEXT;
ALTER TABLE previa_barbers ADD COLUMN IF NOT EXISTS gov_user TEXT;
ALTER TABLE previa_barbers ADD COLUMN IF NOT EXISTS gov_pass TEXT;
ALTER TABLE previa_barbers ADD COLUMN IF NOT EXISTS cnpj TEXT;

-- Adicionar campos de controle de NF e Imposto na tabela de pagamentos
ALTER TABLE previa_manual_payments ADD COLUMN IF NOT EXISTS nf_q1_issued BOOLEAN DEFAULT false;
ALTER TABLE previa_manual_payments ADD COLUMN IF NOT EXISTS nf_q2_issued BOOLEAN DEFAULT false;
ALTER TABLE previa_manual_payments ADD COLUMN IF NOT EXISTS tax_paid BOOLEAN DEFAULT false;


-- 2. Tabela de lançamentos manuais de comissão
CREATE TABLE IF NOT EXISTS previa_manual_payments (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  unit_id UUID REFERENCES previa_units(id) ON DELETE CASCADE,
  barber_id UUID REFERENCES previa_barbers(id) ON DELETE CASCADE,
  period TEXT NOT NULL, -- Mês e ano no formato YYYY-MM
  quinzena_1 NUMERIC DEFAULT 0,
  quinzena_2_avulso NUMERIC DEFAULT 0,
  mes_assinatura NUMERIC DEFAULT 0,
  status_q1 TEXT DEFAULT 'pending' CHECK (status_q1 IN ('pending', 'paid')),
  status_q2 TEXT DEFAULT 'pending' CHECK (status_q2 IN ('pending', 'paid')),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(barber_id, period)
);

ALTER TABLE previa_manual_payments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Acesso total para todos" ON previa_manual_payments;
CREATE POLICY "Acesso total para todos" ON previa_manual_payments FOR ALL USING (true);

-- 3. Tabela de vales/adiantamentos
CREATE TABLE IF NOT EXISTS previa_barber_vouchers (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  barber_id UUID REFERENCES previa_barbers(id) ON DELETE CASCADE,
  period TEXT NOT NULL, -- Mês e ano no formato YYYY-MM
  value NUMERIC DEFAULT 0,
  description TEXT,
  deduct_from TEXT DEFAULT 'q1' CHECK (deduct_from IN ('q1', 'q2')),
  date DATE DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE previa_barber_vouchers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Acesso total para todos" ON previa_barber_vouchers;
CREATE POLICY "Acesso total para todos" ON previa_barber_vouchers FOR ALL USING (true);

-- 4. Tabela de Garantias (Valor Prometido)
CREATE TABLE IF NOT EXISTS previa_barber_guarantees (
  barber_id UUID PRIMARY KEY REFERENCES previa_barbers(id) ON DELETE CASCADE,
  guarantee_value NUMERIC DEFAULT 0, -- Valor total mensal (Ex: 3000)
  valid_until TEXT -- Ex: '2025-07' (formato YYYY-MM para facilitar)
);

ALTER TABLE previa_barber_guarantees ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Acesso total para todos" ON previa_barber_guarantees;
CREATE POLICY "Acesso total para todos" ON previa_barber_guarantees FOR ALL USING (true);

