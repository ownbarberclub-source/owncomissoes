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
}

export interface BarberGuarantee {
  barber_id: string;
  guarantee_value: number;
  valid_until: string; // YYYY-MM
}

export interface CommissionRecord {
  barber_id: string;
  unit_id?: string;
  quinzena_1: number;
  quinzena_2_avulso: number;
  mes_assinatura: number;
  status_q1?: 'pending' | 'paid';
  status_q2?: 'pending' | 'paid';
}

export interface Voucher {
  id?: string;
  barber_id: string;
  value: number;
  description: string;
  deduct_from: 'q1' | 'q2';
  date: string;
}

export interface UserSession {
  name: string;
  role: string;
  email: string;
}
