export interface Unit {
  id: string;
  name: string;
}

export interface Barber {
  id: string;
  unit_id: string;
  name: string;
}

export interface BarberGuarantee {
  barber_id: string;
  guarantee_value: number;
  valid_until: string; // YYYY-MM
}

export interface CommissionRecord {
  barber_id: string;
  quinzena_1: number;
  quinzena_2_avulso: number;
  mes_assinatura: number;
}

export interface Voucher {
  id?: string;
  barber_id: string;
  value: number;
  description: string;
  date: string;
}

export interface UserSession {
  name: string;
  role: string;
  email: string;
}
