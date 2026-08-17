import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { BaixaPorNF } from '../components/Empenhos/BaixaPorNF'
import { NFsLancadas } from '../components/Empenhos/NFsLancadas'
import { FileText, History } from 'lucide-react'

export function PaginaBaixaNF() {
  const [tab, setTab] = useState<'nova' | 'historico'>('nova')
  const navigate = useNavigate()

  return (
    <div className="space-y-6 max-w-[1600px] mx-auto">
      {/* Tabs */}
      <div className="flex gap-1 bg-zinc-100 dark:bg-zinc-900 p-1 rounded-2xl border border-zinc-200 dark:border-zinc-800 w-fit">
        <button
          onClick={() => setTab('nova')}
          className={`flex items-center gap-2 px-5 py-2 rounded-xl text-xs font-bold uppercase tracking-widest transition-all ${
            tab === 'nova'
              ? 'bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 shadow-sm'
              : 'text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300'
          }`}
        >
          <FileText className="w-3.5 h-3.5" />
          Nova Baixa por NF
        </button>
        <button
          onClick={() => setTab('historico')}
          className={`flex items-center gap-2 px-5 py-2 rounded-xl text-xs font-bold uppercase tracking-widest transition-all ${
            tab === 'historico'
              ? 'bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 shadow-sm'
              : 'text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300'
          }`}
        >
          <History className="w-3.5 h-3.5" />
          NFs Lançadas
        </button>
      </div>

      {/* Conteúdo */}
      {tab === 'nova' ? (
        <BaixaPorNF
          onSuccess={() => navigate('/empenhos')}
        />
      ) : (
        <NFsLancadas onRevertida={() => setTab('historico')} />
      )}
    </div>
  )
}
