import React, { useState, useEffect, useMemo } from 'react';
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

  const toggleExpand = (barberId: string) => {
    if (expandedBarbers.includes(barberId)) setExpandedBarbers(prev => prev.filter(id => id !== barberId));
    else setExpandedBarbers(prev => [...prev, barberId]);
  };

  const addVoucher = (primaryId: string) => {
    setVouchers([...vouchers, { barber_id: primaryId, value: 0, description: '', deduct_from: 'q1', date: new Date().toISOString().split('T')[0] }]);
  };

  if (!session) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center p-6 font-sans">
        <div className="max-w-md w-full bg-zinc-900 border border-zinc-800 rounded-3xl p-10 text-center shadow-2xl">
          <h1 className="text-2xl font-black text-white mb-4 tracking-tight uppercase italic">Acesso Restrito</h1>
          <p className="text-zinc-400 mb-8 leading-relaxed">Este sistema é exclusivo para operadores autorizados.</p>
          <a href="https://ownpainel.vercel.app" className="flex items-center justify-center gap-3 bg-brand text-white px-8 py-4 rounded-2xl text-sm font-black uppercase tracking-widest hover:bg-brand-light transition-all shadow-lg shadow-brand/20 active:scale-95">
            → Ir para o Hub
          </a>
        </div>
      </div>
    );
  }

  const isAdmin = session.role === 'administrador';
  const isUnifiedView = selectedUnit === 'all';

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 font-sans selection:bg-brand/30">
      <header className="bg-zinc-900 border-b border-zinc-800 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-8">
            <div className="flex items-center gap-3">
               <div className="w-10 h-10 bg-zinc-950 rounded-xl overflow-hidden border border-zinc-800 p-1.5 shadow-lg flex items-center justify-center">
                  <img src="/logo.png" alt="OWN" className="w-full h-full object-contain brightness-0 invert" />
               </div>
               <h1 className="text-xl font-black tracking-tighter text-zinc-100 hidden sm:block uppercase italic">
                 OWN <span className="text-brand">COMISSÕES</span>
               </h1>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="hidden md:flex flex-col items-end">
              <p className="text-sm font-black text-zinc-200 flex items-center gap-2">
                {isAdmin ? <ShieldCheck size={14} className="text-brand" /> : <UserIcon size={14} className="text-zinc-500" />}
                {session.name}
              </p>
            </div>
            <button onClick={() => { localStorage.removeItem('@own-comissoes:session'); setSession(null); }} className="p-2.5 text-zinc-500 hover:text-brand hover:bg-brand/10 rounded-xl transition-all">
              <LogOut size={20} />
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 pb-40 space-y-8">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 flex flex-col gap-2 group hover:border-zinc-700 transition-all">
            <div className="flex items-center gap-2 text-zinc-500">
              <Store size={14} className="group-hover:text-brand transition-colors" />
              <label className="text-[10px] font-black uppercase tracking-widest">Unidade</label>
            </div>
            <select className="bg-transparent text-lg font-bold text-white outline-none cursor-pointer appearance-none" value={selectedUnit} onChange={(e) => setSelectedUnit(e.target.value)}>
              <option value="" className="bg-zinc-900">Selecione uma unidade</option>
              <option value="all" className="bg-zinc-900 font-bold text-brand">🌟 TODAS AS UNIDADES (UNIFICADO)</option>
              {units.map(u => <option key={u.id} value={u.id} className="bg-zinc-900">{u.name}</option>)}
            </select>
          </div>

          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 flex flex-col gap-2 group hover:border-zinc-700 transition-all">
            <div className="flex items-center gap-2 text-zinc-500">
              <CalendarDays size={14} className="group-hover:text-brand transition-colors" />
              <label className="text-[10px] font-black uppercase tracking-widest">Mês de Referência</label>
            </div>
            <input type="month" className="bg-transparent text-lg font-bold text-white outline-none cursor-pointer appearance-none" value={selectedPeriod} onChange={(e) => setSelectedPeriod(e.target.value)} />
          </div>
        </div>

        {isUnifiedView && (
          <div className="bg-brand/10 border border-brand/20 p-5 rounded-2xl flex items-start gap-4">
            <AlertCircle className="text-brand shrink-0 mt-0.5" size={20} />
            <div>
              <h3 className="font-bold text-brand mb-1">Visão Unificada (Leitura e Fechamento)</h3>
              <p className="text-sm text-zinc-400">
                Nesta tela os valores dos barbeiros de múltiplas unidades estão <strong>somados</strong>. 
                Os campos de digitação estão bloqueados para proteger os dados individuais. Use esta tela para conferir a Garantia global, adicionar vales e realizar a baixa do pagamento (botão Pendente/Pago).
              </p>
            </div>
          </div>
        )}

        <div className="relative">
          {selectedUnit ? (
            <AnimatePresence mode="wait">
              <motion.div key="comm" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="bg-zinc-900 border border-zinc-800 rounded-3xl shadow-xl overflow-hidden">
                {groupedBarbers.length === 0 ? (
                  <div className="py-12 text-center"><p className="text-zinc-500">Nenhum barbeiro encontrado.</p></div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse whitespace-nowrap min-w-[900px]">
                      <thead>
                        <tr className="bg-zinc-950/50 border-b border-zinc-800">
                          <th className="p-5 text-[10px] font-black text-zinc-500 uppercase tracking-widest">Barbeiro</th>
                          <th className="p-5 text-[10px] font-black text-zinc-500 uppercase tracking-widest w-64">Quinzena 1</th>
                          <th className="p-5 text-[10px] font-black text-zinc-500 uppercase tracking-widest w-96">Quinzena 2</th>
                          <th className="p-5 text-[10px] font-black text-zinc-500 uppercase tracking-widest w-32 text-center">Ações</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-zinc-800/50">
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
                              <tr className="hover:bg-zinc-800/20 transition-colors group">
                                <td className="p-5 align-top">
                                  <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 rounded-full bg-zinc-950 border border-zinc-800 flex items-center justify-center text-zinc-400 font-black text-xs uppercase shadow-inner">
                                      {barber.name.substring(0, 2)}
                                    </div>
                                    <div>
                                      <p className="text-sm font-black text-white group-hover:text-brand transition-colors">{barber.name}</p>
                                      <p className="text-[10px] text-zinc-500 font-mono mt-0.5 uppercase">
                                        {isUnifiedView && barber.all_ids.length > 1 ? `${barber.all_ids.length} Lojas Consolidadas` : barber.id.slice(0, 8)}
                                      </p>
                                    </div>
                                  </div>
                                </td>
                                
                                <td className="p-5 align-top bg-zinc-900/30">
                                  <div className="space-y-3">
                                    <div>
                                      <label className="text-[9px] font-black text-zinc-600 uppercase mb-1 block">Bruto (Dia 01-15)</label>
                                      <div className="relative">
                                        <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-600" size={14} />
                                        <input 
                                          type="number"
                                          disabled={isUnifiedView}
                                          className={`w-full border rounded-xl py-2 pl-9 pr-3 text-white font-bold outline-none transition-all text-sm ${isUnifiedView ? 'bg-zinc-950/50 border-transparent text-zinc-400 cursor-not-allowed' : 'bg-zinc-950 border-zinc-800 focus:border-brand/50 focus:ring-1 focus:ring-brand/20'}`}
                                          placeholder="0,00"
                                          value={isUnifiedView ? sums.sumQ1 : (commissions[barber.id]?.quinzena_1 === 0 ? '' : commissions[barber.id]?.quinzena_1)}
                                          onChange={(e) => handleCommissionChange(barber.id, 'quinzena_1', parseFloat(e.target.value) || 0)}
                                        />
                                      </div>
                                    </div>
                                    <div className="bg-zinc-950/50 p-3 rounded-xl border border-zinc-800/50">
                                      <div className="flex justify-between items-center mb-2">
                                        <span className="text-[10px] font-black uppercase text-zinc-500">Líquido A Pagar</span>
                                        <span className={`text-sm font-black ${statusQ1 === 'paid' ? 'text-emerald-500' : 'text-white'}`}>R$ {totals.q1.toFixed(2)}</span>
                                      </div>
                                      <button 
                                        onClick={() => toggleUnifiedStatus(barber.all_ids, 'status_q1', statusQ1)}
                                        className={`w-full py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all border ${statusQ1 === 'paid' ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-500' : 'bg-zinc-800 border-zinc-700 text-zinc-400 hover:bg-zinc-700 hover:text-white'}`}
                                      >
                                        {statusQ1 === 'paid' ? '✅ Já Pago' : 'Pendente'}
                                      </button>
                                    </div>
                                  </div>
                                </td>

                                <td className="p-5 align-top">
                                  <div className="space-y-3">
                                    <div className="flex gap-2">
                                      <div className="flex-1">
                                        <label className="text-[9px] font-black text-zinc-600 uppercase mb-1 block">Bruto Avulso (16-Fim)</label>
                                        <div className="relative">
                                          <DollarSign className="absolute left-2 top-1/2 -translate-y-1/2 text-zinc-600" size={14} />
                                          <input 
                                            type="number"
                                            disabled={isUnifiedView}
                                            className={`w-full border rounded-xl py-2 pl-7 pr-2 text-white font-bold outline-none transition-all text-sm ${isUnifiedView ? 'bg-zinc-950/50 border-transparent text-zinc-400 cursor-not-allowed' : 'bg-zinc-950 border-zinc-800 focus:border-brand/50'}`}
                                            placeholder="0"
                                            value={isUnifiedView ? sums.sumQ2 : (commissions[barber.id]?.quinzena_2_avulso === 0 ? '' : commissions[barber.id]?.quinzena_2_avulso)}
                                            onChange={(e) => handleCommissionChange(barber.id, 'quinzena_2_avulso', parseFloat(e.target.value) || 0)}
                                          />
                                        </div>
                                      </div>
                                      <div className="flex-1">
                                        <label className="text-[9px] font-black text-zinc-600 uppercase mb-1 block">Bruto Assinaturas</label>
                                        <div className="relative">
                                          <DollarSign className="absolute left-2 top-1/2 -translate-y-1/2 text-zinc-600" size={14} />
                                          <input 
                                            type="number"
                                            disabled={isUnifiedView}
                                            className={`w-full border rounded-xl py-2 pl-7 pr-2 text-white font-bold outline-none transition-all text-sm ${isUnifiedView ? 'bg-zinc-950/50 border-transparent text-zinc-400 cursor-not-allowed' : 'bg-zinc-950 border-zinc-800 focus:border-brand/50'}`}
                                            placeholder="0"
                                            value={isUnifiedView ? sums.sumAssin : (commissions[barber.id]?.mes_assinatura === 0 ? '' : commissions[barber.id]?.mes_assinatura)}
                                            onChange={(e) => handleCommissionChange(barber.id, 'mes_assinatura', parseFloat(e.target.value) || 0)}
                                          />
                                        </div>
                                      </div>
                                    </div>
                                    <div className="bg-zinc-950/50 p-3 rounded-xl border border-zinc-800/50">
                                      <div className="flex justify-between items-center mb-2">
                                        <span className="text-[10px] font-black uppercase text-zinc-500">Líquido A Pagar</span>
                                        <span className={`text-sm font-black ${statusQ2 === 'paid' ? 'text-emerald-500' : 'text-white'}`}>R$ {totals.q2.toFixed(2)}</span>
                                      </div>
                                      <button 
                                        onClick={() => toggleUnifiedStatus(barber.all_ids, 'status_q2', statusQ2)}
                                        className={`w-full py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all border ${statusQ2 === 'paid' ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-500' : 'bg-zinc-800 border-zinc-700 text-zinc-400 hover:bg-zinc-700 hover:text-white'}`}
                                      >
                                        {statusQ2 === 'paid' ? '✅ Já Pago' : 'Pendente'}
                                      </button>
                                    </div>
                                  </div>
                                </td>

                                <td className="p-5 align-top text-center">
                                  <div className="flex flex-col items-center gap-2">
                                    <button 
                                      onClick={() => {
                                        setSettingsModalBarber(barber.id);
                                        const g = guarantees[barber.id];
                                        setTempGuarantee(g ? { value: g.guarantee_value.toString(), until: g.valid_until } : { value: '', until: '' });
                                      }}
                                      className="w-full p-2.5 bg-zinc-950 text-zinc-500 hover:text-brand hover:bg-brand/10 border border-zinc-800 hover:border-brand/30 rounded-xl transition-all flex items-center justify-center gap-2"
                                      title="Configurar Garantia"
                                    >
                                      <Settings size={14} /> <span className="text-[10px] font-black uppercase">Garantia</span>
                                    </button>
                                    
                                    <button 
                                      onClick={() => toggleExpand(barber.id)}
                                      className={`w-full p-2.5 border rounded-xl transition-all flex items-center justify-center gap-2 text-[10px] font-black uppercase ${isExpanded || barberVouchers.length > 0 ? 'bg-brand/10 text-brand border-brand/30' : 'bg-zinc-950 text-zinc-500 border-zinc-800 hover:bg-zinc-800'}`}
                                    >
                                      <Wallet size={14} /> 
                                      {barberVouchers.length > 0 ? `${barberVouchers.length} Vales` : 'Add Vale'}
                                      {isExpanded ? <ChevronUp size={14}/> : <ChevronDown size={14}/>}
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
                                    className="bg-zinc-950/80 border-b-4 border-zinc-900"
                                  >
                                    <td colSpan={4} className="p-6">
                                      <div className="flex items-center justify-between mb-4">
                                        <h4 className="text-sm font-black text-brand uppercase tracking-widest flex items-center gap-2"><Wallet size={16}/> Gestão de Vales e Adiantamentos</h4>
                                        <button onClick={() => addVoucher(barber.id)} className="flex items-center gap-2 text-brand hover:text-brand-light transition-all text-[10px] font-black uppercase tracking-widest bg-brand/10 px-3 py-1.5 rounded-lg">
                                          <Plus size={14} /> Novo Vale
                                        </button>
                                      </div>
                                      
                                      {barberVouchers.length === 0 ? (
                                        <p className="text-xs text-zinc-500 italic">Nenhum vale lançado para este barbeiro neste mês.</p>
                                      ) : (
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                          {barberVouchers.map((v, idx) => {
                                            const globalIdx = vouchers.indexOf(v);
                                            return (
                                              <div key={idx} className="bg-zinc-900 border border-zinc-800 p-4 rounded-xl flex flex-col gap-3">
                                                <div className="flex gap-3">
                                                  <div className="flex-1">
                                                    <label className="text-[9px] font-black text-zinc-600 uppercase mb-1 block">Descrição</label>
                                                    <input type="text" className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-2 text-white text-xs outline-none" placeholder="Ex: Adiantamento" value={v.description} onChange={(e) => { const updated = [...vouchers]; updated[globalIdx].description = e.target.value; setVouchers(updated); }} />
                                                  </div>
                                                  <div className="w-24">
                                                    <label className="text-[9px] font-black text-zinc-600 uppercase mb-1 block">Valor (R$)</label>
                                                    <input type="number" className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-2 text-white text-xs font-bold outline-none" placeholder="0" value={v.value || ''} onChange={(e) => { const updated = [...vouchers]; updated[globalIdx].value = parseFloat(e.target.value) || 0; setVouchers(updated); }} />
                                                  </div>
                                                </div>
                                                <div className="flex items-center justify-between mt-1">
                                                  <div className="flex items-center gap-2 bg-zinc-950 p-1 rounded-lg border border-zinc-800">
                                                    <button onClick={() => { const updated = [...vouchers]; updated[globalIdx].deduct_from = 'q1'; setVouchers(updated); }} className={`px-3 py-1 text-[9px] font-black uppercase rounded-md transition-all ${v.deduct_from === 'q1' ? 'bg-brand text-white' : 'text-zinc-500 hover:bg-zinc-800'}`}>
                                                      Descontar Q1
                                                    </button>
                                                    <button onClick={() => { const updated = [...vouchers]; updated[globalIdx].deduct_from = 'q2'; setVouchers(updated); }} className={`px-3 py-1 text-[9px] font-black uppercase rounded-md transition-all ${v.deduct_from === 'q2' ? 'bg-brand text-white' : 'text-zinc-500 hover:bg-zinc-800'}`}>
                                                      Descontar Q2
                                                    </button>
                                                  </div>
                                                  <button onClick={() => setVouchers(vouchers.filter((_, i) => i !== globalIdx))} className="p-1.5 text-zinc-600 hover:text-red-500 hover:bg-red-500/10 rounded-lg transition-all" title="Excluir Vale">
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
            <div className="bg-zinc-900/50 border-2 border-dashed border-zinc-800 rounded-[40px] p-24 text-center">
              <div className="w-24 h-24 bg-zinc-900 rounded-full flex items-center justify-center mx-auto mb-8 shadow-inner border border-zinc-800">
                <AlertCircle className="text-zinc-600" size={48} />
              </div>
              <h2 className="text-2xl font-black text-white mb-3">Selecione uma unidade para começar</h2>
            </div>
          )}
        </div>
      </main>

      {selectedUnit && (
        <div className="fixed bottom-10 inset-x-0 flex justify-center z-50 pointer-events-none">
          <div className="pointer-events-auto">
            <button onClick={handleSave} disabled={saving} className={`flex items-center gap-3 px-10 py-5 rounded-[24px] text-base font-black uppercase tracking-widest shadow-2xl transition-all active:scale-95 ${saving ? 'bg-zinc-800 text-zinc-500 cursor-not-allowed' : 'bg-brand text-white hover:bg-brand-light shadow-brand/40'}`}>
              {saving ? <><motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1, ease: "linear" }}><History size={24} /></motion.div>Salvando...</> : <><Save size={24} /> Salvar Alterações</>}
            </button>
          </div>
        </div>
      )}

      <AnimatePresence>
        {notification && (
          <motion.div initial={{ opacity: 0, y: 50, scale: 0.9 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 50, scale: 0.9 }} className={`fixed top-24 right-8 z-[100] px-6 py-4 rounded-2xl flex items-center gap-4 shadow-2xl border ${notification.type === 'success' ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' : 'bg-brand/10 border-brand/20 text-brand'}`}>
            {notification.type === 'success' ? <div className="w-8 h-8 bg-emerald-500/20 rounded-full flex items-center justify-center"><CheckCircle2 size={20} /></div> : <div className="w-8 h-8 bg-brand/20 rounded-full flex items-center justify-center"><AlertCircle size={20} /></div>}
            <p className="font-bold text-sm">{notification.message}</p>
          </motion.div>
        )}
      </AnimatePresence>

      {settingsModalBarber && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="bg-zinc-900 border border-zinc-800 rounded-3xl w-full max-w-md p-6 shadow-2xl relative">
            <button onClick={() => setSettingsModalBarber(null)} className="absolute top-6 right-6 text-zinc-500 hover:text-white"><X size={24} /></button>
            <h2 className="text-xl font-black text-white mb-6">Garantia Prometida</h2>
            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-xs font-black text-zinc-500 uppercase">Valor Total do Mês (R$)</label>
                <input type="number" className="w-full bg-zinc-950 border border-zinc-800 rounded-xl p-3 text-white outline-none" placeholder="Ex: 3000" value={tempGuarantee.value} onChange={(e) => setTempGuarantee(prev => ({...prev, value: e.target.value}))} />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-black text-zinc-500 uppercase">Válido Até (Mês)</label>
                <input type="month" className="w-full bg-zinc-950 border border-zinc-800 rounded-xl p-3 text-white outline-none" value={tempGuarantee.until} onChange={(e) => setTempGuarantee(prev => ({...prev, until: e.target.value}))} />
              </div>
              <p className="text-xs text-zinc-500 leading-relaxed bg-zinc-950 p-4 rounded-xl border border-zinc-800/50">
                O sistema dividirá o valor pelo número de dias do mês atual e aplicará a fração na hora de salvar, sempre escolhendo o maior valor (digitado vs garantia). Deixe em branco para desativar.
              </p>
              <button onClick={saveGuarantee} disabled={saving} className="w-full mt-4 bg-brand text-white py-4 rounded-xl font-black uppercase text-sm hover:bg-brand-light transition-all">
                {saving ? 'Salvando...' : 'Salvar Garantia'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
