-- Tabela de barbeiros
CREATE TABLE IF NOT EXISTS previa_barbers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    unit_id UUID REFERENCES previa_units(id),
    name TEXT NOT NULL,
    nickname TEXT,
    photo_url TEXT,
    is_hidden_crm BOOLEAN DEFAULT false,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Tabela para armazenar os lançamentos manuais de comissão
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

-- Tabela para armazenar os vales/adiantamentos
CREATE TABLE IF NOT EXISTS previa_barber_vouchers (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  barber_id UUID REFERENCES previa_barbers(id) ON DELETE CASCADE,
  cycle_id UUID REFERENCES previa_cycles(id) ON DELETE CASCADE,
  value NUMERIC DEFAULT 0,
  description TEXT,
  date DATE DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- RLS (Habilitar para permitir acesso do app)
ALTER TABLE previa_manual_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE previa_barber_vouchers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Acesso total para todos" ON previa_manual_payments FOR ALL USING (true);
CREATE POLICY "Acesso total para todos" ON previa_barber_vouchers FOR ALL USING (true);
