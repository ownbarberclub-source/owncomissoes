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
  DollarSign
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
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="glass p-8 max-w-md w-full text-center">
          <div className="w-16 h-16 bg-brand rounded-full flex items-center justify-center mx-auto mb-6 shadow-lg shadow-brand/20">
            <Scissors className="text-white" size={32} />
          </div>
          <h1 className="text-2xl font-bold mb-2">OWN Comissões</h1>
          <p className="text-text-muted mb-8">Por favor, faça login através do OWN Hub para continuar.</p>
          <a href="https://own-hub.vercel.app" className="btn-primary w-full justify-center">
            Ir para o Hub
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto p-4 md:p-8 pb-32">
      <header className="flex flex-col md:flex-row md:items-center justify-between mb-8 gap-4">
        <div>
          <h1 className="text-3xl font-black text-white flex items-center gap-3">
            <span className="p-2 bg-brand rounded-lg shadow-lg shadow-brand/30"><Scissors size={24} /></span>
            OWN COMISSÕES
          </h1>
          <p className="text-text-muted mt-1">Controle manual de pagamentos e vales</p>
        </div>
        
        <div className="flex items-center gap-4">
          <div className="text-right hidden md:block">
            <p className="text-sm font-semibold">{session.name}</p>
            <p className="text-xs text-text-muted capitalize">{session.role}</p>
          </div>
          <button 
            onClick={() => { localStorage.removeItem('@own-comissoes:session'); setSession(null); }}
            className="p-2 hover:bg-white/5 rounded-full text-text-muted hover:text-brand transition-colors"
          >
            <LogOut size={20} />
          </button>
        </div>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
        <div className="glass p-6">
          <label className="text-xs font-bold text-text-muted uppercase mb-2 block">Unidade</label>
          <select 
            className="w-full bg-white/5 border border-white/10 rounded-lg p-3 text-white outline-none focus:border-brand"
            value={selectedUnit}
            onChange={(e) => setSelectedUnit(e.target.value)}
          >
            <option value="">Selecione uma unidade</option>
            {units.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
          </select>
        </div>
        <div className="glass p-6">
          <label className="text-xs font-bold text-text-muted uppercase mb-2 block">Ciclo / Mês</label>
          <select 
            className="w-full bg-white/5 border border-white/10 rounded-lg p-3 text-white outline-none focus:border-brand"
            value={selectedCycle}
            onChange={(e) => setSelectedCycle(e.target.value)}
          >
            <option value="">Selecione o ciclo</option>
            {cycles.map(c => <option key={c.id} value={c.id}>{c.month_year}</option>)}
          </select>
        </div>
      </div>

      <div className="tabs-nav">
        <button 
          className={`tab-btn ${activeTab === 'commissions' ? 'active' : ''}`}
          onClick={() => setActiveTab('commissions')}
        >
          Comissões
        </button>
        <button 
          className={`tab-btn ${activeTab === 'vouchers' ? 'active' : ''}`}
          onClick={() => setActiveTab('vouchers')}
        >
          Vales / Adiantamentos
        </button>
      </div>

      <main>
        {selectedUnit ? (
          <AnimatePresence mode="wait">
            {activeTab === 'commissions' ? (
              <motion.div 
                key="comm"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="grid grid-cols-1 gap-4"
              >
                {barbers.map(barber => (
                  <div key={barber.id} className="glass p-6 card-barber relative overflow-hidden group">
                    <div className="absolute top-0 right-0 p-4 opacity-0 group-hover:opacity-100 transition-opacity">
                      <CreditCard className="text-brand/20" size={48} />
                    </div>
                    
                    <div className="flex items-center justify-between mb-6">
                      <h3 className="text-xl font-bold">{barber.name}</h3>
                      <div className="bg-white/5 px-3 py-1 rounded-full text-xs font-mono text-text-muted">
                        {barber.id.slice(0, 8)}
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                      <div>
                        <label className="text-xs font-bold text-text-muted uppercase mb-2 block">Período 01-15</label>
                        <div className="relative">
                          <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" size={16} />
                          <input 
                            type="number"
                            className="w-full pl-10"
                            placeholder="0,00"
                            value={commissions[barber.id]?.quinzena_1 || ''}
                            onChange={(e) => handleCommissionChange(barber.id, 'quinzena_1', e.target.value)}
                          />
                        </div>
                      </div>
                      <div>
                        <label className="text-xs font-bold text-text-muted uppercase mb-2 block">16-Fim (Avulsos)</label>
                        <div className="relative">
                          <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" size={16} />
                          <input 
                            type="number"
                            className="w-full pl-10"
                            placeholder="0,00"
                            value={commissions[barber.id]?.quinzena_2_avulso || ''}
                            onChange={(e) => handleCommissionChange(barber.id, 'quinzena_2_avulso', e.target.value)}
                          />
                        </div>
                      </div>
                      <div>
                        <label className="text-xs font-bold text-text-muted uppercase mb-2 block">Assinaturas (Mês)</label>
                        <div className="relative">
                          <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" size={16} />
                          <input 
                            type="number"
                            className="w-full pl-10"
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
                className="space-y-8"
              >
                {barbers.map(barber => (
                  <div key={barber.id} className="glass p-6">
                    <div className="flex items-center justify-between mb-6">
                      <h3 className="text-xl font-bold">{barber.name}</h3>
                      <button 
                        onClick={() => addVoucher(barber.id)}
                        className="text-brand flex items-center gap-2 hover:underline text-sm font-bold"
                      >
                        <Plus size={16} /> Adicionar Vale
                      </button>
                    </div>

                    <div className="space-y-4">
                      {vouchers.filter(v => v.barber_id === barber.id).length === 0 ? (
                        <p className="text-sm text-text-muted italic">Nenhum vale lançado para este barbeiro.</p>
                      ) : (
                        vouchers.map((v, idx) => v.barber_id === barber.id && (
                          <div key={idx} className="flex flex-col md:flex-row gap-4 items-end bg-white/5 p-4 rounded-xl border border-white/5">
                            <div className="flex-1 w-full">
                              <label className="text-[10px] font-bold text-text-muted uppercase mb-1 block">Descrição</label>
                              <input 
                                type="text"
                                className="w-full"
                                placeholder="Ex: Vale combustível, Adiantamento..."
                                value={v.description}
                                onChange={(e) => updateVoucher(vouchers.indexOf(v), 'description', e.target.value)}
                              />
                            </div>
                            <div className="w-full md:w-40">
                              <label className="text-[10px] font-bold text-text-muted uppercase mb-1 block">Valor</label>
                              <div className="relative">
                                <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" size={14} />
                                <input 
                                  type="number"
                                  className="w-full pl-8"
                                  placeholder="0,00"
                                  value={v.value || ''}
                                  onChange={(e) => updateVoucher(vouchers.indexOf(v), 'value', parseFloat(e.target.value) || 0)}
                                />
                              </div>
                            </div>
                            <button 
                              onClick={() => removeVoucher(vouchers.indexOf(v))}
                              className="p-3 text-text-muted hover:text-brand transition-colors"
                            >
                              <Trash2 size={20} />
                            </button>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        ) : (
          <div className="glass p-12 text-center">
            <div className="w-16 h-16 bg-white/5 rounded-full flex items-center justify-center mx-auto mb-4">
              <AlertCircle className="text-text-muted" size={32} />
            </div>
            <h2 className="text-xl font-bold">Selecione uma unidade para começar</h2>
            <p className="text-text-muted">Os barbeiros e seus campos de comissão aparecerão aqui.</p>
          </div>
        )}
      </main>

      {selectedUnit && (
        <div className="fixed bottom-8 right-8 z-50">
          <button 
            onClick={handleSave}
            disabled={saving}
            className="btn-primary px-8 py-4 text-lg shadow-2xl"
          >
            {saving ? (
              <span className="flex items-center gap-2">
                <motion.div 
                  animate={{ rotate: 360 }}
                  transition={{ repeat: Infinity, duration: 1, ease: "linear" }}
                >
                  <History size={20} />
                </motion.div>
                Salvando...
              </span>
            ) : (
              <span className="flex items-center gap-2">
                <Save size={20} /> Salvar Alterações
              </span>
            )}
          </button>
        </div>
      )}

      <AnimatePresence>
        {notification && (
          <motion.div 
            initial={{ opacity: 0, x: 100 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 100 }}
            className={`fixed top-8 right-8 z-[100] glass p-4 flex items-center gap-3 border-l-4 shadow-2xl ${
              notification.type === 'success' ? 'border-l-success' : 'border-l-brand'
            }`}
          >
            {notification.type === 'success' ? (
              <CheckCircle2 className="text-success" size={24} />
            ) : (
              <AlertCircle className="text-brand" size={24} />
            )}
            <p className="font-semibold">{notification.message}</p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default App;
