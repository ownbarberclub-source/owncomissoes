-- Adicionar colunas de controle de contrato na tabela previa_barbers
-- Execute este script no SQL Editor do Supabase para atualizar a base de dados

ALTER TABLE previa_barbers
  ADD COLUMN IF NOT EXISTS contract_link TEXT,
  ADD COLUMN IF NOT EXISTS is_contract_signed BOOLEAN DEFAULT false;
