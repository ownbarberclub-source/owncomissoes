export interface Unit {
  id: string;
  name: string;
}

export interface Barber {
  id: string;
  unit_id: string;
  name: string;
  nickname?: string;
  photo_url?: string;
  is_hidden_crm?: boolean;
  pix_key?: string;
  gov_user?: string;
  gov_pass?: string;
  cnpj?: string;
  category?: 'barbeiro' | 'adm';
  bank_name?: string;
  bank_agency?: string;
  bank_account?: string;
  // Dados pessoais
  cpf?: string;
  rg?: string;
  birth_date?: string;
  marital_status?: string;
  phone?: string;
  email?: string;
  address_street?: string;
  address_number?: string;
  address_complement?: string;
  address_neighborhood?: string;
  address_city?: string;
  address_state?: string;
  address_zip?: string;
}

export interface BarberGuarantee {
  barber_id: string;
  period: string; // YYYY-MM
  guarantee_value: number;
  valid_until: string; // YYYY-MM (Legacy/Reference)
  pay_guarantee_on_q1?: boolean;
}

export interface CommissionRecord {
  barber_id: string;
  unit_id?: string;
  quinzena_1: number;
  quinzena_2_avulso: number;
  mes_assinatura: number;
  status_q1?: 'pending' | 'paid';
  status_q2?: 'pending' | 'paid';
  nf_q1_issued?: boolean;
  nf_q2_issued?: boolean;
  tax_paid?: boolean;
}

export interface Voucher {
  id?: string;
  barber_id: string;
  value: number;
  description: string;
  deduct_from: 'q1' | 'q2';
  date: string;
  installments?: number;
}

export interface UserSession {
  name: string;
  role: string;
  email: string;
}
