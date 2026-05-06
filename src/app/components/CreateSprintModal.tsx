
import { useState } from 'react';
import { Plus } from 'lucide-react';
import { sprintsService } from '../../services/sprints.service';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: number;
  onCreated?: () => void;
}

export function CreateSprintModal({ open, onOpenChange, projectId, onCreated }: Props) {
  const [name, setName] = useState('');
  const [goal, setGoal] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [creating, setCreating] = useState(false);

  if (!open) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setCreating(true);
    try {
      await sprintsService.create({ project: projectId, name: name.trim(), goal: goal.trim() || undefined, start_date: startDate || undefined, end_date: endDate || undefined });
      onCreated?.();
      setName(''); setGoal(''); setStartDate(''); setEndDate('');
      onOpenChange(false);
    } catch (err) {
      // swallow, UI toast handled by parent if desired
      console.error(err);
      onOpenChange(false);
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-6">
      <div className="bg-card border border-border rounded-[8px] p-6 max-w-lg w-full shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between mb-5">
          <div>
            <h2 className="text-[14px] font-semibold text-foreground">Crear Sprint</h2>
            <p className="text-[11px] text-muted-foreground mt-0.5">Define el periodo del sprint y su objetivo.</p>
          </div>
          <button onClick={() => onOpenChange(false)} className="inline-flex h-8 items-center gap-1 rounded-[4px] border border-border bg-card px-3 text-[11px] font-medium text-foreground shadow-sm transition-colors hover:bg-surface-secondary">Cerrar</button>
        </div>

        <form className="space-y-4" onSubmit={handleSubmit}>
          <div>
            <label className="block text-[11px] font-medium text-foreground mb-1">Nombre *</label>
            <input type="text" required value={name} onChange={(e) => setName(e.target.value)} className="w-full h-9 bg-surface-secondary border border-border rounded-[4px] px-3 text-[12px] text-foreground" />
          </div>

          <div>
            <label className="block text-[11px] font-medium text-foreground mb-1">Objetivo</label>
            <textarea rows={3} value={goal} onChange={(e) => setGoal(e.target.value)} className="w-full bg-surface-secondary border border-border rounded-[4px] px-3 py-2 text-[12px] text-foreground resize-none" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-medium text-foreground mb-1">Inicio</label>
              <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="w-full h-9 bg-surface-secondary border border-border rounded-[4px] px-3 text-[12px] text-foreground" />
            </div>
            <div>
              <label className="block text-[11px] font-medium text-foreground mb-1">Fin</label>
              <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="w-full h-9 bg-surface-secondary border border-border rounded-[4px] px-3 text-[12px] text-foreground" />
            </div>
          </div>

          <div className="flex gap-2 pt-1">
            <button type="button" onClick={() => onOpenChange(false)} className="flex-1 h-9 border border-border rounded-[4px] text-[12px] font-medium">Cancelar</button>
            <button type="submit" disabled={creating} className="flex-1 h-9 bg-primary text-primary-foreground rounded-[4px] text-[12px] font-medium">{creating ? 'Creando...' : 'Crear sprint'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default CreateSprintModal;
