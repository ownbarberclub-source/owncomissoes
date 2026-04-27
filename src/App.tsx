import { useState, useEffect } from 'react';
import { supabase } from './lib/supabaseClient';
import type { Unit, Barber, BarberGuarantee, CommissionRecord, Voucher, UserSession } from './types';
import { 
  Save, 
  CreditCard, 
  History, 
  LogOut, 
  Plus, 
  Trash2,
  AlertCircle,
  CheckCircle2,
  DollarSign,
  CalendarDays,
  Store,
  Wallet,
  ShieldCheck,
  User as UserIcon,
  Settings,
  X
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

function App() {
  const [session, setSession] = useState<UserSession | null>(null);
  const [units, setUnits] = useState<Unit[]>([]);
  const [selectedUnit, setSelectedUnit] = useState<string>('');
  const [selectedPeriod, setSelectedPeriod] = useState<string>(new Date().toISOString().slice(0, 7));
  const [barbers, setBarbers] = useState<Barber[]>([]);
  const [commissions, setCommissions] = useState<Record<string, CommissionRecord>>({});
  const [vouchers, setVouchers] = useState<Voucher[]>([]);
  const [guarantees, setGuarantees] = useState<Record<string, BarberGuarantee>>({});
  const [activeTab, setActiveTab] = useState<'commissions' | 'vouchers'>('commissions');
  const [settingsModalBarber, setSettingsModalBarber] = useState<string | null>(null);
  const [tempGuarantee, setTempGuarantee] = useState<{value: string, until: string}>({value: '', until: ''});
  const [saving, setSaving] = useState(false);
  const [notification, setNotification] = useState<{type: 'success' | 'error', message: string} | null>(null);

  // Auth via Hub (Token Relay) + Supabase signIn
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const hubToken = params.get('hub_token');
    const hubUser  = params.get('hub_user');
    const hubPass  = params.get('hub_pass');
    const hubName  = params.get('hub_name');
    const hubRole  = params.get('hub_role');

    async function initAuth() {
      // 1. Tenta autenticar no Supabase via senha relay (igual ao own-contatos)
      if (hubUser && hubPass) {
        try {
          const password = atob(hubPass);
          const { error: authErr } = await supabase.auth.signInWithPassword({ email: hubUser, password });
          if (authErr) {
            console.warn('[OWN Comissões] signInWithPassword falhou:', authErr.message);
          } else {
            console.log('[OWN Comissões] Autenticado no Supabase com sucesso.');
          }
        } catch (e: any) {
          console.warn('[OWN Comissões] Erro ao decodificar hub_pass:', e.message);
        }
      }

      // 2. Define sessão local da interface
      if (hubUser && (hubToken || hubPass)) {
        let finalRole = 'operador';
        if (hubRole === 'admin' || hubRole === 'administrador') {
          finalRole = 'administrador';
        }
        const userSession = {
          name: hubName || 'Usuário',
          email: hubUser,
          role: finalRole
        };
        setSession(userSession);
        localStorage.setItem('@own-comissoes:session', JSON.stringify(userSession));
        window.history.replaceState({}, document.title, window.location.pathname);
      } else {
        // 3. Tenta restaurar sessão existente do localStorage
        const saved = localStorage.getItem('@own-comissoes:session');
        if (saved) {
          // Verifica se há sessão ativa no Supabase
          const { data: { session: supaSession } } = await supabase.auth.getSession();
          if (supaSession) {
            setSession(JSON.parse(saved));
          } else {
            // Sessão Supabase expirou — limpa e exige reautenticação via Hub
            console.warn('[OWN Comissões] Sessão Supabase expirada. Redirecionando ao Hub.');
            localStorage.removeItem('@own-comissoes:session');
          }
        }
      }
    }

    initAuth();
  }, []);

  // Fetch initial data
  useEffect(() => {
    if (!session) return;

    async function fetchData() {
      try {
        console.log('[OWN Comissões] Buscando unidades...');
        const { data: unitsData, error: unitsError } = await supabase.from('previa_units').select('*');

        console.log('[OWN Comissões] Unidades:', unitsData, '| Erro:', unitsError);

        if (unitsError) {
          console.error('[OWN Comissões] Error fetching units:', unitsError);
          showNotification('error', `Falha ao carregar unidades: ${unitsError.message}`);
        }

        if (unitsData) setUnits(unitsData);
      } catch (err) {
        console.error('[OWN Comissões] Fetch initial data failed:', err);
        showNotification('error', 'Erro de conexão com o banco de dados.');
      }
    }

    fetchData();
  }, [session]);

  const loadExistingData = async (barberList: Barber[]) => {
    if (!selectedPeriod || !selectedUnit) return;

    const { data: commData } = await supabase
      .from('previa_manual_payments')
      .select('*')
      .eq('period', selectedPeriod)
      .eq('unit_id', selectedUnit);

    if (commData) {
      const newComm: Record<string, CommissionRecord> = {};
      barberList.forEach(b => {
        newComm[b.id] = { barber_id: b.id, quinzena_1: 0, quinzena_2_avulso: 0, mes_assinatura: 0 };
      });
      commData.forEach(c => {
        newComm[c.barber_id] = {
          barber_id: c.barber_id,
          quinzena_1: c.quinzena_1,
          quinzena_2_avulso: c.quinzena_2_avulso,
          mes_assinatura: c.mes_assinatura
        };
      });
      setCommissions(newComm);
    }

    const { data: voucherData } = await supabase
      .from('previa_barber_vouchers')
      .select('*')
      .eq('period', selectedPeriod)
      .in('barber_id', barberList.map(b => b.id));

    if (voucherData) {
      setVouchers(voucherData);
    }

    const { data: guarData } = await supabase
      .from('previa_barber_guarantees')
      .select('*')
      .in('barber_id', barberList.map(b => b.id));

    if (guarData) {
      const gMap: Record<string, BarberGuarantee> = {};
      guarData.forEach(g => {
        gMap[g.barber_id] = g;
      });
      setGuarantees(gMap);
    }
  };

  useEffect(() => {
    if (!selectedUnit) return;

    async function fetchBarbers() {
      const { data, error } = await supabase
        .from('previa_barbers')
        .select('*')
        .eq('unit_id', selectedUnit);
      
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
    if (selectedPeriod > g.valid_until) return null; // Vencido

    const totalDays = getDaysInMonth(selectedPeriod);
    const q1 = (g.guarantee_value / totalDays) * 15;
    const q2 = (g.guarantee_value / totalDays) * (totalDays - 15);
    return { q1, q2 };
  };

  const saveGuarantee = async () => {
    if (!settingsModalBarber) return;
    setSaving(true);
    try {
      const gValue = parseFloat(tempGuarantee.value) || 0;
      
      if (gValue === 0 || !tempGuarantee.until) {
         // Remove guarantee
         await supabase.from('previa_barber_guarantees').delete().eq('barber_id', settingsModalBarber);
         setGuarantees(prev => {
            const next = {...prev};
            delete next[settingsModalBarber];
            return next;
         });
      } else {
         const newG = {
            barber_id: settingsModalBarber,
            guarantee_value: gValue,
            valid_until: tempGuarantee.until
         };
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

  const handleCommissionChange = (barberId: string, field: keyof CommissionRecord, value: string) => {
    const numValue = parseFloat(value) || 0;
    setCommissions(prev => ({
      ...prev,
      [barberId]: {
        ...prev[barberId],
        [field]: numValue
      }
    }));
  };

  const handleSave = async () => {
    if (!selectedPeriod || !selectedUnit) return;
    setSaving(true);

    try {
      const commToSave = Object.values(commissions).map(c => {
        const guar = getGuaranteeForBarber(c.barber_id);
        const finalQ1 = guar ? Math.max(c.quinzena_1, guar.q1) : c.quinzena_1;
        const finalQ2 = guar ? Math.max(c.quinzena_2_avulso, guar.q2) : c.quinzena_2_avulso;

        return {
          unit_id: selectedUnit,
          period: selectedPeriod,
          barber_id: c.barber_id,
          quinzena_1: finalQ1,
          quinzena_2_avulso: finalQ2,
          mes_assinatura: c.mes_assinatura,
          updated_at: new Date().toISOString()
        };
      });

      const { error: commError } = await supabase
        .from('previa_manual_payments')
        .upsert(commToSave, { onConflict: 'barber_id,period' });

      if (commError) throw commError;

      const { error: delError } = await supabase
        .from('previa_barber_vouchers')
        .delete()
        .eq('period', selectedPeriod)
        .in('barber_id', barbers.map(b => b.id));

      if (delError) throw delError;

      if (vouchers.length > 0) {
        const vouchersToSave = vouchers.map(v => ({
          barber_id: v.barber_id,
          period: selectedPeriod,
          value: v.value,
          description: v.description,
          date: v.date
        }));

        const { error: vouchError } = await supabase
          .from('previa_barber_vouchers')
          .insert(vouchersToSave);

        if (vouchError) throw vouchError;
      }
      
      showNotification('success', 'Dados salvos com sucesso!');
    } catch (error: any) {
      console.error(error);
      showNotification('error', `Erro ao salvar: ${error.message}`);
    } finally {
      setSaving(false);
    }
  };

  const addVoucher = (barberId: string) => {
    const newVoucher: Voucher = {
      barber_id: barberId,
      value: 0,
      description: '',
      date: new Date().toISOString().split('T')[0]
    };
    setVouchers([...vouchers, newVoucher]);
  };

  const updateVoucher = (index: number, field: keyof Voucher, value: any) => {
    const updated = [...vouchers];
    updated[index] = { ...updated[index], [field]: value };
    setVouchers(updated);
  };

  const removeVoucher = (index: number) => {
    setVouchers(vouchers.filter((_, i) => i !== index));
  };

  if (!session) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center p-6 font-sans">
        <div className="max-w-md w-full bg-zinc-900 border border-zinc-800 rounded-3xl p-10 text-center shadow-2xl">
          <div className="w-20 h-20 bg-zinc-950 rounded-2xl flex items-center justify-center mx-auto mb-8 shadow-xl border border-zinc-800 p-4">
            <img src="/logo.png" alt="OWN Logo" className="w-full h-full object-contain brightness-0 invert" />
          </div>
          <h1 className="text-2xl font-black text-white mb-4 tracking-tight uppercase italic">Acesso Restrito</h1>
          <p className="text-zinc-400 mb-8 leading-relaxed">
            Este sistema é exclusivo para operadores autorizados.<br />Por favor, acesse pelo <strong className="text-white font-bold">OWN Hub</strong>.
          </p>
          <a 
            href="https://ownpainel.vercel.app" 
            className="flex items-center justify-center gap-3 bg-brand text-white px-8 py-4 rounded-2xl text-sm font-black uppercase tracking-widest hover:bg-brand-light transition-all shadow-lg shadow-brand/20 active:scale-95"
          >
            → Ir para o Hub
          </a>
        </div>
      </div>
    );
  }

  const isAdmin = session.role === 'administrador';

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
            
            <nav className="flex items-center gap-2">
              <button
                onClick={() => setActiveTab('commissions')}
                className={`px-4 py-2 rounded-xl text-sm font-bold transition-all ${
                  activeTab === 'commissions' 
                    ? 'bg-zinc-800 text-brand shadow-inner' 
                    : 'text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800/50'
                }`}
              >
                Comissões
              </button>
              <button
                onClick={() => setActiveTab('vouchers')}
                className={`px-4 py-2 rounded-xl text-sm font-bold transition-all ${
                  activeTab === 'vouchers' 
                    ? 'bg-zinc-800 text-brand shadow-inner' 
                    : 'text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800/50'
                }`}
              >
                Vales
              </button>
            </nav>
          </div>

          <div className="flex items-center gap-4">
            <div className="hidden md:flex flex-col items-end">
              <p className="text-sm font-black text-zinc-200 flex items-center gap-2">
                {isAdmin ? <ShieldCheck size={14} className="text-brand" /> : <UserIcon size={14} className="text-zinc-500" />}
                {session.name}
              </p>
              <p className="text-[10px] text-zinc-500 uppercase tracking-widest font-mono">{session.role}</p>
            </div>
            <button
              onClick={() => { localStorage.removeItem('@own-comissoes:session'); setSession(null); }}
              className="p-2.5 text-zinc-500 hover:text-brand hover:bg-brand/10 rounded-xl transition-all border border-transparent hover:border-brand/20"
              title="Sair"
            >
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
            <select 
              className="bg-transparent text-lg font-bold text-white outline-none cursor-pointer appearance-none"
              value={selectedUnit}
              onChange={(e) => setSelectedUnit(e.target.value)}
            >
              <option value="" className="bg-zinc-900">Selecione uma unidade</option>
              {units.map(u => <option key={u.id} value={u.id} className="bg-zinc-900">{u.name}</option>)}
            </select>
          </div>

          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 flex flex-col gap-2 group hover:border-zinc-700 transition-all">
            <div className="flex items-center gap-2 text-zinc-500">
              <CalendarDays size={14} className="group-hover:text-brand transition-colors" />
              <label className="text-[10px] font-black uppercase tracking-widest">Mês de Referência</label>
            </div>
            <input 
              type="month"
              className="bg-transparent text-lg font-bold text-white outline-none cursor-pointer appearance-none"
              value={selectedPeriod}
              onChange={(e) => setSelectedPeriod(e.target.value)}
            />
          </div>
        </div>

        <div className="relative">
          {selectedUnit ? (
            <AnimatePresence mode="wait">
              {activeTab === 'commissions' ? (
                <motion.div 
                  key="comm"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6"
                >
                  {barbers.length === 0 ? (
                    <div className="col-span-full py-12 text-center bg-zinc-900 border border-zinc-800 rounded-3xl">
                      <p className="text-zinc-500">Nenhum barbeiro encontrado para esta unidade.</p>
                    </div>
                  ) : (
                    barbers.map(barber => (
                      <div key={barber.id} className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6 relative overflow-hidden group hover:border-zinc-700 transition-all shadow-xl">
                        <div className="absolute top-0 right-0 p-6 opacity-0 group-hover:opacity-10 transition-opacity pointer-events-none">
                          <CreditCard className="text-white" size={64} />
                        </div>
                        
                        <div className="mb-6 flex justify-between items-start relative z-10">
                          <div>
                            <h3 className="text-xl font-black text-white group-hover:text-brand transition-colors">{barber.name}</h3>
                            <p className="text-[10px] text-zinc-500 font-mono mt-1 uppercase tracking-widest">{barber.id.slice(0, 8)}</p>
                          </div>
                          <button 
                            onClick={() => {
                              setSettingsModalBarber(barber.id);
                              const g = guarantees[barber.id];
                              setTempGuarantee(g ? { value: g.guarantee_value.toString(), until: g.valid_until } : { value: '', until: '' });
                            }}
                            className="p-2 bg-zinc-950 text-zinc-500 hover:text-brand border border-zinc-800 rounded-xl transition-all relative z-20 cursor-pointer"
                            title="Configurar Garantia"
                          >
                            <Settings size={16} />
                          </button>
                        </div>

                        <div className="space-y-5">
                          <div className="space-y-2">
                            <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest flex items-center gap-1.5">
                              <span className="w-1 h-1 bg-brand rounded-full" /> Período 01-15
                            </label>
                            <div className="relative">
                              <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-600" size={16} />
                              <input 
                                type="number"
                                className="w-full bg-zinc-950 border border-zinc-800 rounded-xl py-3 pl-10 pr-4 text-white font-bold outline-none focus:border-brand/50 focus:ring-1 focus:ring-brand/20 transition-all"
                                placeholder="0,00"
                                value={commissions[barber.id]?.quinzena_1 || ''}
                                onChange={(e) => handleCommissionChange(barber.id, 'quinzena_1', e.target.value)}
                              />
                            </div>
                            {getGuaranteeForBarber(barber.id) && (
                              <p className="text-[10px] text-brand/80 mt-1">Garantia base: R$ {getGuaranteeForBarber(barber.id)?.q1.toFixed(2)}</p>
                            )}
                          </div>

                          <div className="space-y-2">
                            <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest flex items-center gap-1.5">
                              <span className="w-1 h-1 bg-brand rounded-full" /> 16-Fim (Avulsos)
                            </label>
                            <div className="relative">
                              <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-600" size={16} />
                              <input 
                                type="number"
                                className="w-full bg-zinc-950 border border-zinc-800 rounded-xl py-3 pl-10 pr-4 text-white font-bold outline-none focus:border-brand/50 focus:ring-1 focus:ring-brand/20 transition-all"
                                placeholder="0,00"
                                value={commissions[barber.id]?.quinzena_2_avulso || ''}
                                onChange={(e) => handleCommissionChange(barber.id, 'quinzena_2_avulso', e.target.value)}
                              />
                            </div>
                            {getGuaranteeForBarber(barber.id) && (
                              <p className="text-[10px] text-brand/80 mt-1">Garantia base: R$ {getGuaranteeForBarber(barber.id)?.q2.toFixed(2)}</p>
                            )}
                          </div>

                          <div className="space-y-2">
                            <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest flex items-center gap-1.5">
                              <span className="w-1 h-1 bg-brand rounded-full" /> Assinaturas (Mês)
                            </label>
                            <div className="relative">
                              <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-600" size={16} />
                              <input 
                                type="number"
                                className="w-full bg-zinc-950 border border-zinc-800 rounded-xl py-3 pl-10 pr-4 text-white font-bold outline-none focus:border-brand/50 focus:ring-1 focus:ring-brand/20 transition-all"
                                placeholder="0,00"
                                value={commissions[barber.id]?.mes_assinatura || ''}
                                onChange={(e) => handleCommissionChange(barber.id, 'mes_assinatura', e.target.value)}
                              />
                            </div>
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </motion.div>
              ) : (
                <motion.div 
                  key="vouch"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="space-y-6"
                >
                  {barbers.map(barber => (
                    <div key={barber.id} className="bg-zinc-900 border border-zinc-800 rounded-3xl p-8 shadow-xl">
                      <div className="flex items-center justify-between mb-8">
                        <div>
                          <h3 className="text-2xl font-black text-white">{barber.name}</h3>
                          <p className="text-[10px] text-zinc-500 uppercase tracking-widest mt-1">Gestão de Vales e Adiantamentos</p>
                        </div>
                        <button 
                          onClick={() => addVoucher(barber.id)}
                          className="flex items-center gap-2 text-brand hover:text-brand-light transition-all text-xs font-black uppercase tracking-widest"
                        >
                          <Plus size={18} /> Adicionar Vale
                        </button>
                      </div>

                      <div className="space-y-4">
                        {vouchers.filter(v => v.barber_id === barber.id).length === 0 ? (
                          <div className="py-12 text-center border-2 border-dashed border-zinc-800 rounded-2xl">
                             <Wallet className="text-zinc-700 mx-auto mb-3" size={32} />
                             <p className="text-zinc-600 text-sm font-medium">Nenhum vale lançado para este barbeiro.</p>
                          </div>
                        ) : (
                          vouchers.map((v, idx) => v.barber_id === barber.id && (
                            <motion.div 
                              key={idx} 
                              initial={{ opacity: 0, x: -20 }}
                              animate={{ opacity: 1, x: 0 }}
                              className="flex flex-col md:flex-row gap-4 items-end bg-zinc-950 border border-zinc-800 p-5 rounded-2xl hover:border-zinc-700 transition-all group"
                            >
                              <div className="flex-1 w-full space-y-2">
                                <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">Descrição do Lançamento</label>
                                <input 
                                  type="text"
                                  className="w-full bg-zinc-900 border border-zinc-800 rounded-xl p-3 text-white outline-none focus:border-brand/50 transition-all"
                                  placeholder="Ex: Vale combustível, Adiantamento, Ajuste..."
                                  value={v.description}
                                  onChange={(e) => updateVoucher(vouchers.indexOf(v), 'description', e.target.value)}
                                />
                              </div>
                              <div className="w-full md:w-48 space-y-2">
                                <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">Valor</label>
                                <div className="relative">
                                  <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-600" size={16} />
                                  <input 
                                    type="number"
                                    className="w-full bg-zinc-900 border border-zinc-800 rounded-xl py-3 pl-10 pr-4 text-white font-bold outline-none focus:border-brand/50 transition-all"
                                    placeholder="0,00"
                                    value={v.value || ''}
                                    onChange={(e) => updateVoucher(vouchers.indexOf(v), 'value', parseFloat(e.target.value) || 0)}
                                  />
                                </div>
                              </div>
                              <button 
                                onClick={() => removeVoucher(vouchers.indexOf(v))}
                                className="p-3.5 text-zinc-600 hover:text-brand hover:bg-brand/10 rounded-xl transition-all border border-transparent hover:border-brand/20"
                                title="Remover Vale"
                              >
                                <Trash2 size={20} />
                              </button>
                            </motion.div>
                          ))
                        )}
                      </div>
                    </div>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          ) : (
            <div className="bg-zinc-900/50 border-2 border-dashed border-zinc-800 rounded-[40px] p-24 text-center">
              <div className="w-24 h-24 bg-zinc-900 rounded-full flex items-center justify-center mx-auto mb-8 shadow-inner border border-zinc-800">
                <AlertCircle className="text-zinc-600" size={48} />
              </div>
              <h2 className="text-2xl font-black text-white mb-3">Selecione uma unidade para começar</h2>
              <p className="text-zinc-500 max-w-md mx-auto leading-relaxed">
                Escolha a unidade e o mês de referência no menu superior para visualizar os barbeiros e realizar os lançamentos.
              </p>
            </div>
          )}
        </div>
      </main>

      {(selectedUnit && (isAdmin || activeTab === 'commissions')) && (
        <div className="fixed bottom-10 inset-x-0 flex justify-center z-50 pointer-events-none">
          <div className="pointer-events-auto">
            <button 
              onClick={handleSave}
              disabled={saving}
              className={`flex items-center gap-3 px-10 py-5 rounded-[24px] text-base font-black uppercase tracking-widest shadow-2xl transition-all active:scale-95 ${
                saving 
                  ? 'bg-zinc-800 text-zinc-500 cursor-not-allowed' 
                  : 'bg-brand text-white hover:bg-brand-light shadow-brand/40'
              }`}
            >
              {saving ? (
                <>
                  <motion.div 
                    animate={{ rotate: 360 }}
                    transition={{ repeat: Infinity, duration: 1, ease: "linear" }}
                  >
                    <History size={24} />
                  </motion.div>
                  Salvando no Banco...
                </>
              ) : (
                <>
                  <Save size={24} /> Salvar Alterações
                </>
              )}
            </button>
          </div>
        </div>
      )}

      <AnimatePresence>
        {notification && (
          <motion.div 
            initial={{ opacity: 0, y: 50, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 50, scale: 0.9 }}
            className={`fixed top-24 right-8 z-[100] px-6 py-4 rounded-2xl flex items-center gap-4 shadow-2xl border ${
              notification.type === 'success' 
                ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' 
                : 'bg-brand/10 border-brand/20 text-brand'
            }`}
          >
            {notification.type === 'success' ? (
              <div className="w-8 h-8 bg-emerald-500/20 rounded-full flex items-center justify-center">
                <CheckCircle2 size={20} />
              </div>
            ) : (
              <div className="w-8 h-8 bg-brand/20 rounded-full flex items-center justify-center">
                <AlertCircle size={20} />
              </div>
            )}
            <p className="font-bold text-sm">{notification.message}</p>
          </motion.div>
        )}
      </AnimatePresence>

      {settingsModalBarber && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="bg-zinc-900 border border-zinc-800 rounded-3xl w-full max-w-md p-6 shadow-2xl relative">
            <button 
              onClick={() => setSettingsModalBarber(null)}
              className="absolute top-6 right-6 text-zinc-500 hover:text-white"
            >
              <X size={24} />
            </button>
            <h2 className="text-xl font-black text-white mb-6">Garantia Prometida</h2>
            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-xs font-black text-zinc-500 uppercase">Valor Total do Mês (R$)</label>
                <input 
                  type="number"
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-xl p-3 text-white outline-none"
                  placeholder="Ex: 3000"
                  value={tempGuarantee.value}
                  onChange={(e) => setTempGuarantee(prev => ({...prev, value: e.target.value}))}
                />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-black text-zinc-500 uppercase">Válido Até (Mês)</label>
                <input 
                  type="month"
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-xl p-3 text-white outline-none"
                  value={tempGuarantee.until}
                  onChange={(e) => setTempGuarantee(prev => ({...prev, until: e.target.value}))}
                />
              </div>
              <p className="text-xs text-zinc-500 leading-relaxed bg-zinc-950 p-4 rounded-xl border border-zinc-800/50">
                O sistema dividirá o valor pelo número de dias do mês atual e aplicará a fração na hora de salvar, sempre escolhendo o maior valor (digitado vs garantia). Deixe em branco para desativar.
              </p>
              <button 
                onClick={saveGuarantee}
                disabled={saving}
                className="w-full mt-4 bg-brand text-white py-4 rounded-xl font-black uppercase text-sm hover:bg-brand-light transition-all"
              >
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
