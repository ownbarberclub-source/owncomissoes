import React, { useState, useEffect, useMemo, useRef } from 'react';
import { supabase } from './lib/supabaseClient';
import type { Unit, Barber, BarberGuarantee, CommissionRecord, Voucher, UserSession } from './types';
import { 
  Save, History, LogOut, Plus, Trash2, AlertCircle, CheckCircle2,
  DollarSign, CalendarDays, Store, Wallet, ShieldCheck, User as UserIcon,
  Settings, X, ChevronDown, ChevronUp
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

function App() {
  const [session, setSession] = useState<UserSession | null>(null);
  const [units, setUnits] = useState<Unit[]>([]);
  const [selectedUnit, setSelectedUnit] = useState<string>('all');
  const [selectedPeriod, setSelectedPeriod] = useState<string>(new Date().toISOString().slice(0, 7));
  const [barbers, setBarbers] = useState<Barber[]>([]);
  
  const [commissions, setCommissions] = useState<Record<string, CommissionRecord>>({});
  const [vouchers, setVouchers] = useState<Voucher[]>([]);
  const [guarantees, setGuarantees] = useState<Record<string, BarberGuarantee>>({});
  
  const [expandedBarbers, setExpandedBarbers] = useState<string[]>([]);
  const [settingsModalBarber, setSettingsModalBarber] = useState<string | null>(null);
  const [tempGuarantee, setTempGuarantee] = useState<{value: string, until: string}>({value: '', until: ''});
  const [saving, setSaving] = useState(false);
  const [notification, setNotification] = useState<{type: 'success' | 'error', message: string} | null>(null);
  const [manageProfessionalsModal, setManageProfessionalsModal] = useState(false);
  const [newProfessional, setNewProfessional] = useState({ name: '', unit_id: '', is_hidden_crm: true });
  const [unitDropdownOpen, setUnitDropdownOpen] = useState(false);
  const unitDropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (unitDropdownRef.current && !unitDropdownRef.current.contains(event.target as Node)) {
        setUnitDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const hubToken = params.get('hub_token');
    const hubUser  = params.get('hub_user');
    const hubPass  = params.get('hub_pass');
    const hubName  = params.get('hub_name');
    const hubRole  = params.get('hub_role');

    async function initAuth() {
      if (hubUser && hubPass) {
        try {
          const password = atob(hubPass);
          const { error: authErr } = await supabase.auth.signInWithPassword({ email: hubUser, password });
          if (authErr) console.warn('[OWN Comissões] signInWithPassword falhou:', authErr.message);
        } catch (e: any) {
          console.warn('[OWN Comissões] Erro ao decodificar hub_pass:', e.message);
        }
      }

      if (hubUser && (hubToken || hubPass)) {
        let finalRole = 'operador';
        if (hubRole === 'admin' || hubRole === 'administrador') finalRole = 'administrador';
        const userSession = { name: hubName || 'Usuário', email: hubUser, role: finalRole };
        setSession(userSession);
        localStorage.setItem('@own-comissoes:session', JSON.stringify(userSession));
        window.history.replaceState({}, document.title, window.location.pathname);
      } else {
        const saved = localStorage.getItem('@own-comissoes:session');
        if (saved) {
          const { data: { session: supaSession } } = await supabase.auth.getSession();
          if (supaSession) setSession(JSON.parse(saved));
          else localStorage.removeItem('@own-comissoes:session');
        }
      }
    }
    initAuth();
  }, []);

  useEffect(() => {
    if (!session) return;
    async function fetchData() {
      try {
        const { data: unitsData, error: unitsError } = await supabase.from('previa_units').select('*');
        if (unitsError) showNotification('error', `Falha ao carregar unidades: ${unitsError.message}`);
        if (unitsData) setUnits(unitsData);
      } catch (err) {
        showNotification('error', 'Erro de conexão com o banco de dados.');
      }
    }
    fetchData();
  }, [session]);

  const loadExistingData = async (barberList: Barber[]) => {
    if (!selectedPeriod || !selectedUnit) return;

    let commQuery = supabase.from('previa_manual_payments').select('*').eq('period', selectedPeriod);
    if (selectedUnit !== 'all') commQuery = commQuery.eq('unit_id', selectedUnit);
    const { data: commData } = await commQuery;

    const newComm: Record<string, CommissionRecord> = {};
    barberList.forEach(b => {
      newComm[b.id] = { barber_id: b.id, unit_id: b.unit_id, quinzena_1: 0, quinzena_2_avulso: 0, mes_assinatura: 0, status_q1: 'pending', status_q2: 'pending' };
    });

    if (commData) {
      commData.forEach(c => {
        if (newComm[c.barber_id]) {
          newComm[c.barber_id].quinzena_1 = c.quinzena_1;
          newComm[c.barber_id].quinzena_2_avulso = c.quinzena_2_avulso;
          newComm[c.barber_id].mes_assinatura = c.mes_assinatura;
          newComm[c.barber_id].status_q1 = c.status_q1 || 'pending';
          newComm[c.barber_id].status_q2 = c.status_q2 || 'pending';
        }
      });
    }
    setCommissions(newComm);

    const { data: voucherData } = await supabase
      .from('previa_barber_vouchers')
      .select('*')
      .eq('period', selectedPeriod)
      .in('barber_id', barberList.map(b => b.id));

    if (voucherData) {
      setVouchers(voucherData.map(v => ({...v, deduct_from: v.deduct_from || 'q1'})));
    } else {
      setVouchers([]);
    }

    const { data: guarData } = await supabase
      .from('previa_barber_guarantees')
      .select('*')
      .in('barber_id', barberList.map(b => b.id));

    if (guarData) {
      const gMap: Record<string, BarberGuarantee> = {};
      guarData.forEach(g => { gMap[g.barber_id] = g; });
      setGuarantees(gMap);
    }
  };

  useEffect(() => {
    if (!selectedUnit) return;
    async function fetchBarbers() {
      let query = supabase.from('previa_barbers').select('*');
      if (selectedUnit !== 'all') {
        query = query.eq('unit_id', selectedUnit);
      }
      const { data, error } = await query;
      if (error) console.error('Error fetching barbers:', error);
      if (data) {
        setBarbers(data);
        if (selectedPeriod) loadExistingData(data);
      }
    }
    fetchBarbers();
  }, [selectedUnit]);

  useEffect(() => {
    if (barbers.length > 0 && selectedPeriod) {
      loadExistingData(barbers);
    }
  }, [selectedPeriod]);

  // Agrupa barbeiros por nome quando está na visão "Todas as Unidades"
  const groupedBarbers = useMemo(() => {
    if (selectedUnit !== 'all') {
      return barbers.map(b => ({ id: b.id, all_ids: [b.id], name: b.name }));
    }
    const map = new Map<string, { id: string; all_ids: string[]; name: string }>();
    barbers.forEach(b => {
      const key = b.name.trim().toLowerCase();
      if (map.has(key)) {
        map.get(key)!.all_ids.push(b.id);
      } else {
        map.set(key, { id: b.id, all_ids: [b.id], name: b.name });
      }
    });
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [barbers, selectedUnit]);

  const showNotification = (type: 'success' | 'error', message: string) => {
    setNotification({ type, message });
    setTimeout(() => setNotification(null), 3000);
  };

  const getDaysInMonth = (period: string) => {
    if (!period) return 30;
    const [year, month] = period.split('-');
    return new Date(parseInt(year), parseInt(month), 0).getDate();
  };

  const getGuaranteeForBarber = (barberId: string) => {
    const g = guarantees[barberId];
    if (!g || !g.valid_until || !g.guarantee_value) return null;
    if (selectedPeriod > g.valid_until) return null;

    const totalDays = getDaysInMonth(selectedPeriod);
    const q1 = (g.guarantee_value / totalDays) * 15;
    const q2 = (g.guarantee_value / totalDays) * (totalDays - 15);
    return { q1, q2 };
  };

  const getUnifiedSums = (all_ids: string[]) => {
    let sumQ1 = 0;
    let sumQ2 = 0;
    let sumAssin = 0;
    all_ids.forEach(id => {
      const c = commissions[id];
      if (c) {
        sumQ1 += c.quinzena_1 || 0;
        sumQ2 += c.quinzena_2_avulso || 0;
        sumAssin += c.mes_assinatura || 0;
      }
    });
    return { sumQ1, sumQ2, sumAssin };
  };

  const calculateTotals = (primaryId: string, all_ids: string[]) => {
    const sums = getUnifiedSums(all_ids);
    const guar = getGuaranteeForBarber(primaryId);
    
    const baseQ1 = guar ? Math.max(sums.sumQ1, guar.q1) : sums.sumQ1;
    const baseQ2 = guar ? Math.max(sums.sumQ2, guar.q2 - sums.sumAssin) : sums.sumQ2;
    
    const barberVouchers = vouchers.filter(v => all_ids.includes(v.barber_id));
    const vQ1 = barberVouchers.filter(v => v.deduct_from === 'q1').reduce((acc, v) => acc + (parseFloat(v.value as any) || 0), 0);
    const vQ2 = barberVouchers.filter(v => v.deduct_from === 'q2').reduce((acc, v) => acc + (parseFloat(v.value as any) || 0), 0);
    
    return {
      q1: baseQ1 - vQ1,
      q2: (baseQ2 + sums.sumAssin) - vQ2,
      vQ1,
      vQ2
    };
  };

  const saveGuarantee = async () => {
    if (!settingsModalBarber) return;
    setSaving(true);
    try {
      const gValue = parseFloat(tempGuarantee.value) || 0;
      if (gValue === 0 || !tempGuarantee.until) {
         await supabase.from('previa_barber_guarantees').delete().eq('barber_id', settingsModalBarber);
         setGuarantees(prev => { const next = {...prev}; delete next[settingsModalBarber]; return next; });
      } else {
         const newG = { barber_id: settingsModalBarber, guarantee_value: gValue, valid_until: tempGuarantee.until };
         await supabase.from('previa_barber_guarantees').upsert(newG);
         setGuarantees(prev => ({...prev, [settingsModalBarber]: newG}));
      }
      showNotification('success', 'Garantia atualizada!');
      setSettingsModalBarber(null);
    } catch (e: any) {
      showNotification('error', `Erro: ${e.message}`);
    } finally {
      setSaving(false);
    }
  };

  const handleCommissionChange = (barberId: string, field: keyof CommissionRecord, value: any) => {
    setCommissions(prev => ({
      ...prev,
      [barberId]: {
        ...prev[barberId],
        [field]: value
      }
    }));
  };

  const toggleUnifiedStatus = (all_ids: string[], field: 'status_q1' | 'status_q2', currentStatus: 'pending' | 'paid') => {
    const newStatus = currentStatus === 'paid' ? 'pending' : 'paid';
    setCommissions(prev => {
      const next = { ...prev };
      all_ids.forEach(id => {
        if (next[id]) {
          next[id] = { ...next[id], [field]: newStatus };
        }
      });
      return next;
    });
  };

  const handleSave = async () => {
    if (!selectedPeriod || !selectedUnit) return;
    setSaving(true);

    try {
      const commToSave = Object.values(commissions).map(c => {
        return {
          unit_id: c.unit_id,
          period: selectedPeriod,
          barber_id: c.barber_id,
          quinzena_1: c.quinzena_1,
          quinzena_2_avulso: c.quinzena_2_avulso,
          mes_assinatura: c.mes_assinatura,
          status_q1: c.status_q1 || 'pending',
          status_q2: c.status_q2 || 'pending',
          updated_at: new Date().toISOString()
        };
      });

      const { error: commError } = await supabase.from('previa_manual_payments').upsert(commToSave, { onConflict: 'barber_id,period' });
      if (commError) throw commError;

      const { error: delError } = await supabase.from('previa_barber_vouchers').delete()
        .eq('period', selectedPeriod).in('barber_id', barbers.map(b => b.id));
      if (delError) throw delError;

      if (vouchers.length > 0) {
        const vouchersToSave = vouchers.map(v => ({
          barber_id: v.barber_id,
          period: selectedPeriod,
          value: parseFloat(v.value as any) || 0,
          description: v.description,
          deduct_from: v.deduct_from,
          date: v.date
        }));
        const { error: vouchError } = await supabase.from('previa_barber_vouchers').insert(vouchersToSave);
        if (vouchError) throw vouchError;
      }
      showNotification('success', 'Dados salvos com sucesso!');
    } catch (error: any) {
      showNotification('error', `Erro ao salvar: ${error.message}`);
    } finally {
      setSaving(false);
    }
  };

  const handleSaveIndividual = async (barberId: string, allIds: string[]) => {
    if (!selectedPeriod) return;
    setSaving(true);
    try {
      const commToSave = allIds.map(id => {
        const c = commissions[id];
        return {
          unit_id: c?.unit_id || barbers.find(b => b.id === id)?.unit_id,
          period: selectedPeriod,
          barber_id: id,
          quinzena_1: c?.quinzena_1 || 0,
          quinzena_2_avulso: c?.quinzena_2_avulso || 0,
          mes_assinatura: c?.mes_assinatura || 0,
          status_q1: c?.status_q1 || 'pending',
          status_q2: c?.status_q2 || 'pending',
          updated_at: new Date().toISOString()
        };
      });

      const { error: commError } = await supabase.from('previa_manual_payments').upsert(commToSave, { onConflict: 'barber_id,period' });
      if (commError) throw commError;

      // Update vouchers for these specific barbers
      const { error: delError } = await supabase.from('previa_barber_vouchers').delete()
        .eq('period', selectedPeriod).in('barber_id', allIds);
      if (delError) throw delError;

      const barberVouchers = vouchers.filter(v => allIds.includes(v.barber_id));
      if (barberVouchers.length > 0) {
        const vouchersToSave = barberVouchers.map(v => ({
          barber_id: v.barber_id,
          period: selectedPeriod,
          value: parseFloat(v.value as any) || 0,
          description: v.description,
          deduct_from: v.deduct_from,
          date: v.date
        }));
        const { error: vouchError } = await supabase.from('previa_barber_vouchers').insert(vouchersToSave);
        if (vouchError) throw vouchError;
      }

      showNotification('success', `Dados de ${barbers.find(b => b.id === barberId)?.name} salvos!`);
    } catch (error: any) {
      showNotification('error', `Erro: ${error.message}`);
    } finally {
      setSaving(false);
    }
  };

  const toggleExpand = (barberId: string) => {
    if (expandedBarbers.includes(barberId)) setExpandedBarbers(prev => prev.filter(id => id !== barberId));
    else setExpandedBarbers(prev => [...prev, barberId]);
  };

  const addVoucher = (primaryId: string) => {
    setVouchers([...vouchers, { barber_id: primaryId, value: 0, description: '', deduct_from: 'q1', date: new Date().toISOString().split('T')[0] }]);
  };

  if (!session) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 relative overflow-hidden" style={{ background: 'radial-gradient(ellipse at 50% 0%, rgba(225,6,0,0.08) 0%, #000 60%)' }}>
        <div className="absolute inset-0 bg-grid z-0" />
        <div className="max-w-md w-full relative z-10 text-center">
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-[22px] bg-white/5 border border-white/10 shadow-[0_16px_40px_rgba(0,0,0,0.5)] mb-5 overflow-hidden p-3">
            <img src="/logo.png" alt="OWN" className="w-full h-full object-contain brightness-0 invert" />
          </div>
          <div className="font-display italic font-black text-4xl tracking-tighter uppercase mb-1">
            OWN <span className="text-brand">COMISSÕES</span>
          </div>
          <div className="text-[11px] font-semibold text-zinc-500 tracking-[0.25em] uppercase mb-12">
            Acesso Restrito
          </div>
          
          <div className="bg-white/5 border border-white/10 rounded-[24px] p-9 backdrop-blur-md shadow-2xl">
            <h1 className="font-display text-2xl font-black mb-2 italic uppercase">Autenticação Necessária</h1>
            <p className="text-zinc-400 text-sm mb-8 leading-relaxed">Este sistema é exclusivo para operadores autorizados. Por favor, autentique-se via hub.</p>
            
            <a 
              href="https://ownpainel.vercel.app" 
              className="flex items-center justify-center gap-2 bg-brand text-white w-full py-4 rounded-xl text-[13px] font-bold uppercase tracking-widest hover:bg-brand-light hover:-translate-y-px transition-all shadow-[0_8px_24px_rgba(225,6,0,0.25)] hover:shadow-[0_12px_32px_rgba(225,6,0,0.4)] active:scale-[0.98]"
            >
              Ir para o Hub
            </a>
          </div>
          
          <div className="mt-8 text-zinc-600 text-[11px] font-semibold tracking-widest uppercase">
            OWN BARBER CLUB © {new Date().getFullYear()}
          </div>
        </div>
      </div>
    );
  }

  const isAdmin = session.role === 'administrador';
  const isUnifiedView = selectedUnit === 'all';

  return (
    <div className="min-h-screen bg-black text-zinc-100 font-sans selection:bg-brand/30 relative overflow-hidden">
      {/* Background Decor */}
      <div className="fixed inset-0 z-0 overflow-hidden pointer-events-none">
        <div 
          className="absolute inset-0 opacity-40"
          style={{ background: 'radial-gradient(circle at 50% -20%, rgba(225,6,0,0.15) 0%, rgba(0,0,0,0) 70%)' }}
        />
        <div className="absolute inset-0 bg-grid opacity-20" />
      </div>

      <header className="bg-black/60 backdrop-blur-md border-b border-white/5 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-8">
            <div className="flex items-center gap-3">
               <div className="w-10 h-10 bg-white/5 rounded-xl overflow-hidden border border-white/10 p-1.5 shadow-lg flex items-center justify-center">
                  <img src="/logo.png" alt="OWN" className="w-full h-full object-contain brightness-0 invert" />
               </div>
               <h1 className="text-xl font-display font-black tracking-tighter text-white hidden sm:block uppercase italic">
                 OWN <span className="text-brand">COMISSÕES</span>
               </h1>
            </div>
          </div>
            <div className="flex items-center gap-3">
              <button 
                onClick={handleSave}
                disabled={saving || isUnifiedView}
                className={`hidden lg:flex items-center gap-2 px-6 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest transition-all border ${saving ? 'bg-zinc-800 text-zinc-500 border-zinc-700 cursor-not-allowed' : 'bg-brand hover:bg-brand-light text-white border-brand shadow-lg shadow-brand/20 active:scale-95'}`}
              >
                <Save size={14} /> {saving ? 'Salvando...' : 'Salvar Alterações'}
              </button>
              {isAdmin && (
                <button 
                  onClick={() => setManageProfessionalsModal(true)}
                  className="hidden sm:flex items-center gap-2 bg-white/5 hover:bg-white/10 text-white px-4 py-2 rounded-xl text-xs font-black uppercase tracking-widest border border-white/10 transition-all"
                >
                  <UserIcon size={14} className="text-brand" /> Profissionais
                </button>
              )}
              <div className="hidden md:flex flex-col items-end">
              <p className="text-sm font-display font-black text-white flex items-center gap-2 italic uppercase">
                {isAdmin ? <ShieldCheck size={14} className="text-brand" /> : <UserIcon size={14} className="text-zinc-500" />}
                {session.name}
              </p>
              <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">{session.role}</p>
            </div>
            <button 
              onClick={() => { localStorage.removeItem('@own-comissoes:session'); setSession(null); }} 
              className="p-2.5 text-zinc-500 hover:text-brand hover:bg-brand/10 rounded-xl transition-all border border-transparent hover:border-brand/10"
            >
              <LogOut size={20} />
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 pb-40 space-y-8 relative z-10">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-2xl p-6 flex flex-col gap-3 group hover:border-brand/30 transition-all shadow-xl relative z-[60]" ref={unitDropdownRef}>
            <div className="flex items-center gap-2 text-zinc-500">
              <Store size={16} className="group-hover:text-brand transition-colors" />
              <label className="text-xs font-black uppercase tracking-widest text-zinc-500">Unidade</label>
            </div>
            
            <button 
              onClick={() => setUnitDropdownOpen(!unitDropdownOpen)}
              className="w-full flex items-center justify-between text-xl font-display font-black text-white italic uppercase text-left group/btn"
            >
              <span className={selectedUnit === 'all' ? 'text-brand' : ''}>
                {selectedUnit === 'all' ? '🌟 Todas as Unidades' : units.find(u => u.id === selectedUnit)?.name || 'Selecione...'}
              </span>
              <ChevronDown size={20} className={`transition-transform duration-300 ${unitDropdownOpen ? 'rotate-180 text-brand' : 'text-zinc-500 group-hover/btn:text-white'}`} />
            </button>

            <AnimatePresence>
              {unitDropdownOpen && (
                <motion.div 
                  initial={{ opacity: 0, y: -10, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -10, scale: 0.95 }}
                  className="absolute top-full left-0 right-0 mt-2 z-[100] bg-zinc-950/95 backdrop-blur-xl border border-white/10 rounded-2xl shadow-2xl overflow-hidden py-2"
                >
                  <button 
                    onClick={() => { setSelectedUnit('all'); setUnitDropdownOpen(false); }}
                    className={`w-full px-5 py-4 text-left flex items-center justify-between transition-colors hover:bg-white/5 ${selectedUnit === 'all' ? 'bg-brand/10 border-l-4 border-brand' : ''}`}
                  >
                    <span className="text-sm font-display font-black italic uppercase text-brand">🌟 Todas as Unidades (Unificado)</span>
                    {selectedUnit === 'all' && <CheckCircle2 size={16} className="text-brand" />}
                  </button>
                  
                  <div className="h-px bg-white/5 mx-2 my-1" />
                  
                  <div className="max-h-[300px] overflow-y-auto custom-scrollbar">
                    {units.map(u => (
                      <button 
                        key={u.id}
                        onClick={() => { setSelectedUnit(u.id); setUnitDropdownOpen(false); }}
                        className={`w-full px-5 py-4 text-left flex items-center justify-between transition-colors hover:bg-white/5 ${selectedUnit === u.id ? 'bg-white/10 border-l-4 border-brand' : ''}`}
                      >
                        <span className="text-sm font-display font-black italic uppercase text-white">{u.name}</span>
                        {selectedUnit === u.id && <CheckCircle2 size={16} className="text-brand" />}
                      </button>
                    ))}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          <div className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-2xl p-6 flex flex-col gap-3 group hover:border-brand/30 transition-all shadow-xl">
            <div className="flex items-center gap-2 text-zinc-500">
              <CalendarDays size={16} className="group-hover:text-brand transition-colors" />
              <label className="text-xs font-black uppercase tracking-widest text-zinc-500">Mês de Referência</label>
            </div>
            <input type="month" className="bg-transparent text-xl font-display font-black text-white outline-none cursor-pointer appearance-none italic uppercase" value={selectedPeriod} onChange={(e) => setSelectedPeriod(e.target.value)} />
          </div>
        </div>

        {isUnifiedView && (
          <div className="bg-brand/10 border border-brand/20 p-6 rounded-2xl flex items-start gap-4 backdrop-blur-md animate-fade-in">
            <AlertCircle className="text-brand shrink-0 mt-0.5" size={24} />
            <div>
              <h3 className="text-lg font-display font-black italic uppercase text-brand mb-1">Visão Unificada (Leitura e Fechamento)</h3>
              <p className="text-sm font-medium text-zinc-400 leading-relaxed">
                Nesta tela os valores dos barbeiros de múltiplas unidades estão <strong>somados</strong>. 
                Os campos de digitação estão bloqueados para proteger os dados individuais. Use esta tela para conferir a Garantia global, adicionar vales e realizar a baixa do pagamento.
              </p>
            </div>
          </div>
        )}

        <div className="relative">
          {selectedUnit ? (
            <AnimatePresence mode="wait">
              <motion.div key="comm" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-3xl shadow-2xl overflow-hidden">
                {groupedBarbers.length === 0 ? (
                  <div className="py-20 text-center"><p className="text-zinc-500 font-medium">Nenhum barbeiro encontrado.</p></div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse whitespace-nowrap min-w-[900px]">
                      <thead>
                        <tr className="bg-white/5 border-b border-white/10">
                          <th className="p-6 text-xs font-black text-zinc-500 uppercase tracking-widest">Barbeiro</th>
                          <th className="p-6 text-xs font-black text-zinc-500 uppercase tracking-widest w-72">Quinzena 1</th>
                          <th className="p-6 text-xs font-black text-zinc-500 uppercase tracking-widest w-[400px]">Quinzena 2</th>
                          <th className="p-6 text-xs font-black text-zinc-500 uppercase tracking-widest w-40 text-center">Ações</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/5">
                        {groupedBarbers.map(barber => {
                          const isExpanded = expandedBarbers.includes(barber.id);
                          const sums = getUnifiedSums(barber.all_ids);
                          const totals = calculateTotals(barber.id, barber.all_ids);
                          const barberVouchers = vouchers.filter(v => barber.all_ids.includes(v.barber_id));
                          
                          // O status exibido será baseado no primeiro ID da lista
                          const statusQ1 = commissions[barber.all_ids[0]]?.status_q1 || 'pending';
                          const statusQ2 = commissions[barber.all_ids[0]]?.status_q2 || 'pending';

                          return (
                            <React.Fragment key={barber.id}>
                              <tr className="hover:bg-white/[0.02] transition-colors group">
                                <td className="p-6 align-top">
                                  <div className="flex items-center gap-4">
                                    <div className="w-14 h-14 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center text-zinc-400 font-display font-black text-base uppercase shadow-inner group-hover:border-brand/30 transition-all">
                                      {barber.name.substring(0, 2)}
                                    </div>
                                    <div>
                                      <p className="text-base font-display font-black text-white group-hover:text-brand transition-colors italic uppercase tracking-tight">{barber.name}</p>
                                      <p className="text-xs text-zinc-500 font-bold mt-1 uppercase tracking-widest opacity-60">
                                        {isUnifiedView && barber.all_ids.length > 1 ? `${barber.all_ids.length} Lojas Consolidadas` : barber.id.slice(0, 8)}
                                      </p>
                                    </div>
                                  </div>
                                </td>
                                      <td className="p-6 align-top bg-white/[0.01]">
                                  <div className="space-y-5">
                                    <div>
                                      <label className="text-xs font-black text-zinc-600 uppercase mb-2 block tracking-widest">Bruto (Dia 01-15)</label>
                                      <div className="relative">
                                        <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-600" size={16} />
                                        <input 
                                          type="number"
                                          disabled={isUnifiedView}
                                          className={`w-full border rounded-xl py-3 pl-10 pr-3 text-white font-bold outline-none transition-all text-base ${isUnifiedView ? 'bg-white/5 border-transparent text-zinc-500 cursor-not-allowed' : 'bg-white/5 border-white/10 focus:border-brand/50 focus:ring-1 focus:ring-brand/20'}`}
                                          placeholder="0,00"
                                          value={isUnifiedView ? sums.sumQ1 : (commissions[barber.id]?.quinzena_1 === 0 ? '' : commissions[barber.id]?.quinzena_1)}
                                          onChange={(e) => handleCommissionChange(barber.id, 'quinzena_1', parseFloat(e.target.value) || 0)}
                                        />
                                      </div>
                                    </div>
                                    <div className="bg-black/40 p-5 rounded-2xl border border-white/5 shadow-inner">
                                      <div className="flex justify-between items-center mb-3">
                                        <span className="text-xs font-black uppercase text-zinc-500 tracking-widest">Líquido A Pagar</span>
                                        <span className={`text-lg font-display font-black italic ${statusQ1 === 'paid' ? 'text-emerald-500' : 'text-white'}`}>R$ {totals.q1.toFixed(2)}</span>
                                      </div>
                                      <button 
                                        onClick={() => toggleUnifiedStatus(barber.all_ids, 'status_q1', statusQ1)}
                                        className={`w-full py-3 rounded-xl text-xs font-black uppercase tracking-widest transition-all border ${statusQ1 === 'paid' ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-500 shadow-[0_0_15px_rgba(16,185,129,0.1)]' : 'bg-white/5 border-white/10 text-zinc-500 hover:bg-white/10 hover:text-white'}`}
                                      >
                                        {statusQ1 === 'paid' ? '✅ Já Pago' : 'Pendente'}
                                      </button>
                                    </div>
                                  </div>
                                </td>
                                <td className="p-6 align-top">
                                  <div className="space-y-5">
                                    <div className="flex gap-4">
                                      <div className="flex-1">
                                        <label className="text-xs font-black text-zinc-600 uppercase mb-2 block tracking-widest">Bruto Avulso (16-Fim)</label>
                                        <div className="relative">
                                          <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-600" size={16} />
                                          <input 
                                            type="number"
                                            disabled={isUnifiedView}
                                            className={`w-full border rounded-xl py-3 pl-9 pr-2 text-white font-bold outline-none transition-all text-base ${isUnifiedView ? 'bg-white/5 border-transparent text-zinc-500 cursor-not-allowed' : 'bg-white/5 border-white/10 focus:border-brand/50'}`}
                                            placeholder="0"
                                            value={isUnifiedView ? sums.sumQ2 : (commissions[barber.id]?.quinzena_2_avulso === 0 ? '' : commissions[barber.id]?.quinzena_2_avulso)}
                                            onChange={(e) => handleCommissionChange(barber.id, 'quinzena_2_avulso', parseFloat(e.target.value) || 0)}
                                          />
                                        </div>
                                      </div>
                                      <div className="flex-1">
                                        <label className="text-[10px] font-black text-zinc-600 uppercase mb-2 block tracking-widest">Bruto Assinaturas</label>
                                        <div className="relative">
                                          <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-600" size={16} />
                                          <input 
                                            type="number"
                                            disabled={isUnifiedView}
                                            className={`w-full border rounded-xl py-3 pl-9 pr-2 text-white font-bold outline-none transition-all text-base ${isUnifiedView ? 'bg-white/5 border-transparent text-zinc-500 cursor-not-allowed' : 'bg-white/5 border-white/10 focus:border-brand/50'}`}
                                            placeholder="0"
                                            value={isUnifiedView ? sums.sumAssin : (commissions[barber.id]?.mes_assinatura === 0 ? '' : commissions[barber.id]?.mes_assinatura)}
                                            onChange={(e) => handleCommissionChange(barber.id, 'mes_assinatura', parseFloat(e.target.value) || 0)}
                                          />
                                        </div>
                                      </div>
                                    </div>
                                    <div className="bg-black/40 p-5 rounded-2xl border border-white/5 shadow-inner">
                                      <div className="flex justify-between items-center mb-3">
                                        <span className="text-[11px] font-black uppercase text-zinc-500 tracking-widest">Líquido A Pagar</span>
                                        <span className={`text-lg font-display font-black italic ${statusQ2 === 'paid' ? 'text-emerald-500' : 'text-white'}`}>R$ {totals.q2.toFixed(2)}</span>
                                      </div>
                                      <button 
                                        onClick={() => toggleUnifiedStatus(barber.all_ids, 'status_q2', statusQ2)}
                                        className={`w-full py-3 rounded-xl text-xs font-black uppercase tracking-widest transition-all border ${statusQ2 === 'paid' ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-500 shadow-[0_0_15px_rgba(16,185,129,0.1)]' : 'bg-white/5 border-white/10 text-zinc-500 hover:bg-white/10 hover:text-white'}`}
                                      >
                                        {statusQ2 === 'paid' ? '✅ Já Pago' : 'Pendente'}
                                      </button>
                                    </div>
                                  </div>
                                </td>
                                <td className="p-6 align-top text-center">
                                  <div className="flex flex-col items-center gap-3">
                                    <button 
                                      onClick={() => handleSaveIndividual(barber.id, barber.all_ids)}
                                      disabled={saving || isUnifiedView}
                                      className={`w-full p-4 rounded-xl text-xs font-black uppercase tracking-widest transition-all border flex items-center justify-center gap-2 ${saving ? 'bg-zinc-800 text-zinc-600 border-zinc-700' : 'bg-emerald-500 hover:bg-emerald-600 text-white border-emerald-500/50 shadow-lg shadow-emerald-500/20 active:scale-95'}`}
                                    >
                                      <Save size={18} /> {saving ? '...' : 'Salvar'}
                                    </button>

                                    <button 
                                      onClick={() => {
                                        setSettingsModalBarber(barber.id);
                                        const g = guarantees[barber.id];
                                        setTempGuarantee(g ? { value: g.guarantee_value.toString(), until: g.valid_until } : { value: '', until: '' });
                                      }}
                                      className="w-full p-3 bg-white/5 text-zinc-500 hover:text-brand hover:bg-brand/10 border border-white/10 hover:border-brand/30 rounded-xl transition-all flex items-center justify-center gap-2"
                                      title="Configurar Garantia"
                                    >
                                      <Settings size={16} /> <span className="text-[10px] font-black uppercase tracking-widest">Garantia</span>
                                    </button>
                                    
                                    <button 
                                      onClick={() => toggleExpand(barber.id)}
                                      className={`w-full p-3 border rounded-xl transition-all flex items-center justify-center gap-2 text-[10px] font-black uppercase tracking-widest ${isExpanded || barberVouchers.length > 0 ? 'bg-brand/10 text-brand border-brand/30' : 'bg-white/5 text-zinc-500 border-white/10 hover:bg-white/10'}`}
                                    >
                                      <Wallet size={16} /> 
                                      {barberVouchers.length > 0 ? `${barberVouchers.length} Vales` : 'Add Vale'}
                                      {isExpanded ? <ChevronUp size={16}/> : <ChevronDown size={16}/>}
                                    </button>
                                  </div>
                                </td>
                              </tr>

                              {/* Linha Expansível para Vales */}
                              <AnimatePresence>
                                {isExpanded && (
                                  <motion.tr
                                    initial={{ opacity: 0, height: 0 }}
                                    animate={{ opacity: 1, height: 'auto' }}
                                    exit={{ opacity: 0, height: 0 }}
                                    className="bg-black/60 border-b-4 border-black shadow-inner"
                                  >
                                    <td colSpan={4} className="p-8">
                                      <div className="flex items-center justify-between mb-6">
                                        <div className="flex items-center gap-3">
                                          <div className="w-10 h-10 rounded-xl bg-brand/10 flex items-center justify-center text-brand">
                                            <Wallet size={20}/>
                                          </div>
                                          <div>
                                            <h4 className="text-sm font-display font-black text-white italic uppercase tracking-wider">Gestão de Vales e Adiantamentos</h4>
                                            <p className="text-[10px] text-zinc-500 font-bold uppercase tracking-widest">Descontos diretos na comissão líquida</p>
                                          </div>
                                        </div>
                                        <button onClick={() => addVoucher(barber.id)} className="flex items-center gap-2 text-white bg-brand hover:bg-brand-light transition-all text-[10px] font-black uppercase tracking-widest px-4 py-2 rounded-xl shadow-lg shadow-brand/20">
                                          <Plus size={14} /> Novo Vale
                                        </button>
                                      </div>
                                      
                                      {barberVouchers.length === 0 ? (
                                        <div className="bg-white/[0.02] border border-white/5 rounded-2xl p-8 text-center">
                                          <p className="text-xs text-zinc-600 font-medium italic">Nenhum vale lançado para este barbeiro neste mês.</p>
                                        </div>
                                      ) : (
                                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                          {barberVouchers.map((v, idx) => {
                                            const globalIdx = vouchers.indexOf(v);
                                            return (
                                              <div key={idx} className="bg-white/5 border border-white/10 p-5 rounded-2xl flex flex-col gap-4 shadow-xl hover:border-brand/20 transition-all">
                                                <div className="flex gap-4">
                                                  <div className="flex-1">
                                                    <label className="text-[9px] font-black text-zinc-500 uppercase mb-1.5 block tracking-widest">Descrição</label>
                                                    <input type="text" className="w-full bg-black/40 border border-white/5 rounded-xl p-2.5 text-white text-xs outline-none focus:border-brand/50 transition-all" placeholder="Ex: Adiantamento" value={v.description} onChange={(e) => { const updated = [...vouchers]; updated[globalIdx].description = e.target.value; setVouchers(updated); }} />
                                                  </div>
                                                  <div className="w-28">
                                                    <label className="text-[9px] font-black text-zinc-500 uppercase mb-1.5 block tracking-widest">Valor (R$)</label>
                                                    <input type="number" className="w-full bg-black/40 border border-white/5 rounded-xl p-2.5 text-white text-xs font-bold outline-none focus:border-brand/50 transition-all" placeholder="0" value={v.value || ''} onChange={(e) => { const updated = [...vouchers]; updated[globalIdx].value = parseFloat(e.target.value) || 0; setVouchers(updated); }} />
                                                  </div>
                                                </div>
                                                <div className="flex items-center justify-between">
                                                  <div className="flex items-center gap-1.5 bg-black/40 p-1 rounded-xl border border-white/5">
                                                    <button onClick={() => { const updated = [...vouchers]; updated[globalIdx].deduct_from = 'q1'; setVouchers(updated); }} className={`px-3 py-1.5 text-[9px] font-black uppercase rounded-lg transition-all ${v.deduct_from === 'q1' ? 'bg-brand text-white shadow-lg shadow-brand/20' : 'text-zinc-500 hover:text-zinc-300'}`}>
                                                      Q1
                                                    </button>
                                                    <button onClick={() => { const updated = [...vouchers]; updated[globalIdx].deduct_from = 'q2'; setVouchers(updated); }} className={`px-3 py-1.5 text-[9px] font-black uppercase rounded-lg transition-all ${v.deduct_from === 'q2' ? 'bg-brand text-white shadow-lg shadow-brand/20' : 'text-zinc-500 hover:text-zinc-300'}`}>
                                                      Q2
                                                    </button>
                                                  </div>
                                                  <button onClick={() => setVouchers(vouchers.filter((_, i) => i !== globalIdx))} className="p-2 text-zinc-600 hover:text-brand hover:bg-brand/10 rounded-xl transition-all" title="Excluir Vale">
                                                    <Trash2 size={16} />
                                                  </button>
                                                </div>
                                              </div>
                                            )
                                          })}
                                        </div>
                                      )}
                                    </td>
                                  </motion.tr>
                                )}
                              </AnimatePresence>
                            </React.Fragment>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </motion.div>
            </AnimatePresence>
          ) : (
            <div className="bg-white/5 border-2 border-dashed border-white/10 rounded-[40px] p-24 text-center backdrop-blur-sm">
              <div className="w-24 h-24 bg-brand/5 rounded-full flex items-center justify-center mx-auto mb-8 shadow-inner border border-brand/10">
                <AlertCircle className="text-brand opacity-40" size={48} />
              </div>
              <h2 className="text-2xl font-display font-black text-white mb-3 italic uppercase">Selecione uma unidade para começar</h2>
              <p className="text-zinc-500 max-w-sm mx-auto text-sm">Escolha no topo a unidade desejada ou a visão unificada para visualizar os fechamentos.</p>
            </div>
          )}
        </div>
      </main>

      {selectedUnit && (
        <div className="fixed bottom-10 inset-x-0 flex justify-center z-50 pointer-events-none">
          <div className="pointer-events-auto">
            <button 
              onClick={handleSave} 
              disabled={saving} 
              className={`group flex items-center gap-3 px-12 py-5 rounded-[24px] text-base font-display font-black italic uppercase tracking-widest shadow-2xl transition-all active:scale-95 ${saving ? 'bg-zinc-800 text-zinc-600 cursor-not-allowed' : 'bg-brand text-white hover:bg-brand-light shadow-brand/40 hover:-translate-y-1'}`}
            >
              {saving ? (
                <><motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1, ease: "linear" }}><History size={24} /></motion.div>Salvando...</>
              ) : (
                <><Save size={24} className="group-hover:scale-110 transition-transform" /> Salvar Alterações</>
              )}
            </button>
          </div>
        </div>
      )}

      <AnimatePresence>
        {notification && (
          <motion.div initial={{ opacity: 0, x: 100, scale: 0.9 }} animate={{ opacity: 1, x: 0, scale: 1 }} exit={{ opacity: 0, x: 100, scale: 0.9 }} className={`fixed top-24 right-8 z-[100] px-6 py-4 rounded-2xl flex items-center gap-4 shadow-2xl border backdrop-blur-xl ${notification.type === 'success' ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' : 'bg-brand/10 border-brand/20 text-brand'}`}>
            {notification.type === 'success' ? <div className="w-10 h-10 bg-emerald-500/20 rounded-full flex items-center justify-center shadow-lg shadow-emerald-500/20"><CheckCircle2 size={20} /></div> : <div className="w-10 h-10 bg-brand/20 rounded-full flex items-center justify-center shadow-lg shadow-brand/20"><AlertCircle size={20} /></div>}
            <div>
              <p className="font-bold text-[13px] uppercase tracking-wider font-display italic">{notification.type === 'success' ? 'Sucesso' : 'Erro'}</p>
              <p className="text-xs opacity-80">{notification.message}</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Floating Save Button */}
      {!isUnifiedView && (
        <motion.div 
          initial={{ y: 100 }} 
          animate={{ y: 0 }} 
          className="fixed bottom-8 right-8 z-50 lg:hidden"
        >
          <button 
            onClick={handleSave}
            disabled={saving}
            className={`flex items-center gap-3 px-8 py-4 rounded-2xl font-display font-black italic uppercase text-sm tracking-widest transition-all shadow-2xl ${saving ? 'bg-zinc-800 text-zinc-500' : 'bg-brand text-white hover:bg-brand-light active:scale-95 shadow-brand/40'}`}
          >
            <Save size={20} /> {saving ? 'Sincronizando...' : 'Salvar Tudo'}
          </button>
        </motion.div>
      )}

      {/* Notification Toast */}
      <AnimatePresence>
        {notification && (
          <motion.div 
            initial={{ opacity: 0, y: 50, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 50, scale: 0.9 }}
            className="fixed bottom-24 left-1/2 -translate-x-1/2 z-[100] w-full max-w-md px-6"
          >
            <div className={`p-5 rounded-2xl border backdrop-blur-xl shadow-2xl flex items-center gap-4 ${notification.type === 'success' ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400' : 'bg-brand/10 border-brand/30 text-brand'}`}>
              {notification.type === 'success' ? <CheckCircle2 size={24} /> : <AlertCircle size={24} />}
              <p className="text-sm font-black uppercase tracking-widest">{notification.message}</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Modal de Garantia */}
      <AnimatePresence>
        {settingsModalBarber && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-6 bg-black/90 backdrop-blur-md">
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="bg-zinc-950 border border-white/10 rounded-[32px] w-full max-w-md p-10 shadow-2xl relative overflow-hidden">
              <div className="absolute top-0 left-0 w-full h-1 bg-brand opacity-50" />
              <button onClick={() => setSettingsModalBarber(null)} className="absolute top-8 right-8 text-zinc-500 hover:text-white transition-colors"><X size={24} /></button>
              
              <div className="flex items-center gap-4 mb-8">
                <div className="w-12 h-12 rounded-2xl bg-brand/10 flex items-center justify-center text-brand">
                  <ShieldCheck size={28} />
                </div>
                <div>
                  <h2 className="text-2xl font-display font-black text-white italic uppercase tracking-tight">Garantia Prometida</h2>
                  <p className="text-[10px] text-zinc-500 font-bold uppercase tracking-widest">Configuração de produção mínima</p>
                </div>
              </div>

              <div className="space-y-6">
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest ml-1">Valor Total do Mês (R$)</label>
                  <div className="relative">
                    <DollarSign className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-600" size={18} />
                    <input type="number" className="w-full bg-white/5 border border-white/10 rounded-2xl p-4 pl-10 text-white font-bold outline-none focus:border-brand/50 transition-all text-lg" placeholder="Ex: 3000" value={tempGuarantee.value} onChange={(e) => setTempGuarantee(prev => ({...prev, value: e.target.value}))} />
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest ml-1">Válido Até (Mês)</label>
                  <div className="relative">
                    <CalendarDays className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-600" size={18} />
                    <input type="month" className="w-full bg-white/5 border border-white/10 rounded-2xl p-4 pl-10 text-white font-bold outline-none focus:border-brand/50 transition-all" value={tempGuarantee.until} onChange={(e) => setTempGuarantee(prev => ({...prev, until: e.target.value}))} />
                  </div>
                </div>
                <div className="bg-brand/5 p-5 rounded-2xl border border-brand/10">
                  <p className="text-[11px] text-brand/80 leading-relaxed font-medium">
                    <strong>Atenção:</strong> O sistema dividirá o valor pelo número de dias do mês e aplicará a fração na quinzena correspondente. O barbeiro receberá o maior valor entre a produção real e a garantia.
                  </p>
                </div>
                <button 
                  onClick={saveGuarantee} 
                  disabled={saving} 
                  className="w-full mt-2 bg-brand text-white py-5 rounded-2xl font-display font-black italic uppercase text-sm tracking-widest hover:bg-brand-light transition-all shadow-lg shadow-brand/20 active:scale-95"
                >
                  {saving ? 'Processando...' : 'Salvar Configuração'}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Modal de Gestão de Profissionais */}
      <AnimatePresence>
        {manageProfessionalsModal && (
          <div className="fixed inset-0 z-[70] flex items-center justify-center p-6 bg-black/90 backdrop-blur-md">
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="bg-zinc-950 border border-white/10 rounded-[32px] w-full max-w-2xl p-10 shadow-2xl relative overflow-hidden flex flex-col max-h-[90vh]">
              <div className="absolute top-0 left-0 w-full h-1 bg-brand opacity-50" />
              <button onClick={() => setManageProfessionalsModal(false)} className="absolute top-8 right-8 text-zinc-500 hover:text-white transition-colors"><X size={24} /></button>
              
              <div className="flex items-center gap-4 mb-8">
                <div className="w-12 h-12 rounded-2xl bg-brand/10 flex items-center justify-center text-brand">
                  <UserIcon size={28} />
                </div>
                <div>
                  <h2 className="text-2xl font-display font-black text-white italic uppercase tracking-tight">Gestão de Profissionais</h2>
                  <p className="text-[10px] text-zinc-500 font-bold uppercase tracking-widest">Controle de quem entra nos fechamentos e CRM</p>
                </div>
              </div>

              <div className="bg-white/5 border border-white/10 rounded-2xl p-6 mb-8">
                <h3 className="text-xs font-black text-white uppercase tracking-widest mb-4">Novo Profissional</h3>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <input 
                    type="text" 
                    placeholder="Nome Completo" 
                    className="bg-black/40 border border-white/10 rounded-xl p-3 text-white text-sm outline-none focus:border-brand/50 transition-all"
                    value={newProfessional.name}
                    onChange={(e) => setNewProfessional({...newProfessional, name: e.target.value})}
                  />
                  <select 
                    className="bg-black/40 border border-white/10 rounded-xl p-3 text-white text-sm outline-none focus:border-brand/50 transition-all appearance-none"
                    value={newProfessional.unit_id}
                    onChange={(e) => setNewProfessional({...newProfessional, unit_id: e.target.value})}
                  >
                    <option value="" className="bg-zinc-950">Selecione Unidade</option>
                    {units.map(u => <option key={u.id} value={u.id} className="bg-zinc-950">{u.name}</option>)}
                  </select>
                  <button 
                    onClick={async () => {
                      if (!newProfessional.name || !newProfessional.unit_id) return showNotification('error', 'Preencha nome e unidade');
                      const { data, error } = await supabase.from('previa_barbers').insert([newProfessional]).select();
                      if (error) return showNotification('error', error.message);
                      setBarbers([...barbers, data[0]]);
                      setNewProfessional({ name: '', unit_id: '', is_hidden_crm: true });
                      showNotification('success', 'Profissional adicionado!');
                    }}
                    className="bg-brand text-white py-3 rounded-xl font-display font-black italic uppercase text-xs tracking-widest hover:bg-brand-light transition-all"
                  >
                    Adicionar
                  </button>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto custom-scrollbar pr-2">
                <table className="w-full text-left">
                  <thead className="sticky top-0 bg-zinc-950 z-10">
                    <tr className="border-b border-white/10">
                      <th className="py-3 text-[10px] font-black text-zinc-500 uppercase tracking-widest">Nome</th>
                      <th className="py-3 text-[10px] font-black text-zinc-500 uppercase tracking-widest">Unidade</th>
                      <th className="py-3 text-[10px] font-black text-zinc-500 uppercase tracking-widest text-center">Ocultar no CRM</th>
                      <th className="py-3 text-[10px] font-black text-zinc-500 uppercase tracking-widest text-center">Ações</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {barbers.sort((a,b) => a.name.localeCompare(b.name)).map(b => (
                      <tr key={b.id} className="group">
                        <td className="py-4 text-sm font-bold text-white italic uppercase">{b.name}</td>
                        <td className="py-4 text-xs text-zinc-500 font-bold">{units.find(u => u.id === b.unit_id)?.name}</td>
                        <td className="py-4 text-center">
                          <button 
                            onClick={async () => {
                              const newVal = !b.is_hidden_crm;
                              const { error } = await supabase.from('previa_barbers').update({ is_hidden_crm: newVal }).eq('id', b.id);
                              if (error) return showNotification('error', error.message);
                              setBarbers(barbers.map(x => x.id === b.id ? {...x, is_hidden_crm: newVal} : x));
                            }}
                            className={`px-3 py-1.5 rounded-lg text-[9px] font-black uppercase transition-all border ${b.is_hidden_crm ? 'bg-brand/10 border-brand/30 text-brand' : 'bg-white/5 border-white/10 text-zinc-600 hover:text-white'}`}
                          >
                            {b.is_hidden_crm ? '✅ Sim' : 'Não'}
                          </button>
                        </td>
                        <td className="py-4 text-center">
                          <button 
                            onClick={async () => {
                              if (!confirm(`Excluir ${b.name}?`)) return;
                              const { error } = await supabase.from('previa_barbers').delete().eq('id', b.id);
                              if (error) return showNotification('error', error.message);
                              setBarbers(barbers.filter(x => x.id !== b.id));
                            }}
                            className="p-2 text-zinc-700 hover:text-brand transition-colors"
                          >
                            <Trash2 size={16} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default App;
