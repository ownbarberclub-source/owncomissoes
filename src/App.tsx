import { useState, useEffect } from 'react';
import { supabase } from './lib/supabaseClient';
import type { Unit, Barber, Cycle, CommissionRecord, Voucher, UserSession } from './types';
import { 
  Scissors, 
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
  Lock as LockIcon
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

function App() {
  const [session, setSession] = useState<UserSession | null>(null);
  const [units, setUnits] = useState<Unit[]>([]);
  const [selectedUnit, setSelectedUnit] = useState<string>('');
  const [cycles, setCycles] = useState<Cycle[]>([]);
  const [selectedCycle, setSelectedCycle] = useState<string>('');
  const [barbers, setBarbers] = useState<Barber[]>([]);
  const [commissions, setCommissions] = useState<Record<string, CommissionRecord>>({});
  const [vouchers, setVouchers] = useState<Voucher[]>([]);
  const [activeTab, setActiveTab] = useState<'commissions' | 'vouchers'>('commissions');
  const [saving, setSaving] = useState(false);
  const [notification, setNotification] = useState<{type: 'success' | 'error', message: string} | null>(null);

  // Auth via Hub (Token Relay)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const hubToken = params.get('hub_token');
    const hubUser = params.get('hub_user');
    const hubName = params.get('hub_name');
    const hubRole = params.get('hub_role');

    if (hubToken && hubUser) {
      const userSession = {
        name: hubName || 'Usuário',
        email: hubUser,
        role: hubRole || 'operador'
      };
      setSession(userSession);
      localStorage.setItem('@own-comissoes:session', JSON.stringify(userSession));
      window.history.replaceState({}, document.title, window.location.pathname);
    } else {
      const saved = localStorage.getItem('@own-comissoes:session');
      if (saved) {
        setSession(JSON.parse(saved));
      }
    }
  }, []);

  // Fetch initial data
  useEffect(() => {
    if (!session) return;

    async function fetchData() {
      const { data: unitsData } = await supabase.from('previa_units').select('*');
      const { data: cyclesData } = await supabase.from('previa_cycles').select('*').order('created_at', { ascending: false });

      if (unitsData) setUnits(unitsData);
      if (cyclesData) {
        setCycles(cyclesData);
        if (cyclesData.length > 0) setSelectedCycle(cyclesData[0].id);
      }
    }

    fetchData();
  }, [session]);

  const loadExistingData = async (barberList: Barber[]) => {
    if (!selectedCycle || !selectedUnit) return;

    const { data: commData } = await supabase
      .from('previa_manual_payments')
      .select('*')
      .eq('cycle_id', selectedCycle)
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
      .eq('cycle_id', selectedCycle)
      .in('barber_id', barberList.map(b => b.id));

    if (voucherData) {
      setVouchers(voucherData);
    }
  };

  useEffect(() => {
    if (!selectedUnit) return;

    async function fetchBarbers() {
      const { data } = await supabase
        .from('previa_barbers')
        .select('*')
        .eq('unit_id', selectedUnit);
      
      if (data) {
        setBarbers(data);
        if (selectedCycle) loadExistingData(data);
      }
    }

    fetchBarbers();
  }, [selectedUnit]);

  useEffect(() => {
    if (barbers.length > 0 && selectedCycle) {
      loadExistingData(barbers);
    }
  }, [selectedCycle]);

  const showNotification = (type: 'success' | 'error', message: string) => {
    setNotification({ type, message });
    setTimeout(() => setNotification(null), 3000);
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
    if (!selectedCycle || !selectedUnit) return;
    setSaving(true);

    try {
      const commToSave = Object.values(commissions).map(c => ({
        unit_id: selectedUnit,
        cycle_id: selectedCycle,
        barber_id: c.barber_id,
        quinzena_1: c.quinzena_1,
        quinzena_2_avulso: c.quinzena_2_avulso,
        mes_assinatura: c.mes_assinatura,
        updated_at: new Date().toISOString()
      }));

      const { error: commError } = await supabase
        .from('previa_manual_payments')
        .upsert(commToSave, { onConflict: 'barber_id,cycle_id' });

      if (commError) throw commError;

      const { error: delError } = await supabase
        .from('previa_barber_vouchers')
        .delete()
        .eq('cycle_id', selectedCycle)
        .in('barber_id', barbers.map(b => b.id));

      if (delError) throw delError;

      if (vouchers.length > 0) {
        const vouchersToSave = vouchers.map(v => ({
          barber_id: v.barber_id,
          cycle_id: selectedCycle,
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
          <div className="w-20 h-20 bg-brand rounded-2xl flex items-center justify-center mx-auto mb-8 shadow-xl shadow-brand/20">
            <LockIcon className="text-white" size={36} />
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

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 font-sans selection:bg-brand/30">
      <header className="bg-zinc-900 border-b border-zinc-800 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-8">
            <div className="flex items-center gap-3">
               <div className="w-10 h-10 bg-zinc-950 rounded-xl overflow-hidden border border-zinc-800 p-1.5 shadow-lg flex items-center justify-center">
                  <Scissors className="text-brand" size={24} />
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
            <div className="hidden md:block text-right">
              <p className="text-sm font-black text-zinc-200">{session.name}</p>
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
              <label className="text-[10px] font-black uppercase tracking-widest">Ciclo / Mês</label>
            </div>
            <select 
              className="bg-transparent text-lg font-bold text-white outline-none cursor-pointer appearance-none"
              value={selectedCycle}
              onChange={(e) => setSelectedCycle(e.target.value)}
            >
              <option value="" className="bg-zinc-900">Selecione o ciclo</option>
              {cycles.map(c => <option key={c.id} value={c.id} className="bg-zinc-900">{c.month_year}</option>)}
            </select>
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
                  {barbers.map(barber => (
                    <div key={barber.id} className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6 relative overflow-hidden group hover:border-zinc-700 transition-all shadow-xl">
                      <div className="absolute top-0 right-0 p-6 opacity-0 group-hover:opacity-10 transition-opacity">
                        <CreditCard className="text-white" size={64} />
                      </div>
                      
                      <div className="mb-6">
                        <h3 className="text-xl font-black text-white group-hover:text-brand transition-colors">{barber.name}</h3>
                        <p className="text-[10px] text-zinc-500 font-mono mt-1 uppercase tracking-widest">{barber.id.slice(0, 8)}</p>
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
                  ))}
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
                Escolha a unidade e o ciclo de faturamento no menu superior para visualizar os barbeiros e realizar os lançamentos.
              </p>
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
    </div>
  );
}

export default App;
