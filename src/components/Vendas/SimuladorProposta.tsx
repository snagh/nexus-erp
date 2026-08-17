import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../AuthContext'
import { toast } from 'sonner'
import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import { Shuffle, FileDown, Loader2, Wand2, Package, AlertCircle } from 'lucide-react'
import { Button } from '../ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select'
import { formatCurrency } from '../../lib/utils'

interface AtaOpcao { id: string; numero_arp: string; entidade_gerenciadora: string | null }

interface ItemAta {
  id: number
  descricao: string
  unidade: string
  valor_unitario: number
  saldo_real: number
}

interface ItemProposta {
  id: number
  descricao: string
  unidade: string
  valor_unitario: number
  saldo_disponivel: number
  qtd_sugerida: number
  valor_total: number
}

// Algoritmo guloso randomizado: embaralha itens e preenche o valor alvo
function gerarProposta(itens: ItemAta[], valorAlvo: number): ItemProposta[] {
  const shuffled = [...itens].sort(() => Math.random() - 0.5)
  const resultado: ItemProposta[] = []
  let restante = valorAlvo

  for (const item of shuffled) {
    if (restante <= 0) break
    if (item.valor_unitario <= 0 || item.saldo_real <= 0) continue

    const maxPorValor = Math.floor(restante / item.valor_unitario)
    const qtd = Math.min(maxPorValor, item.saldo_real)

    if (qtd > 0) {
      resultado.push({
        id: item.id,
        descricao: item.descricao,
        unidade: item.unidade,
        valor_unitario: item.valor_unitario,
        saldo_disponivel: item.saldo_real,
        qtd_sugerida: qtd,
        valor_total: qtd * item.valor_unitario
      })
      restante -= qtd * item.valor_unitario
    }
  }

  return resultado
}

export function SimuladorProposta() {
  const { user, profile } = useAuth()
  const isOP = profile?.nivel === 'OP'

  const [atas, setAtas] = useState<AtaOpcao[]>([])
  const [selectedAtaId, setSelectedAtaId] = useState<string>('')
  const [itensAta, setItensAta] = useState<ItemAta[]>([])
  const [loadingAta, setLoadingAta] = useState(false)
  const [valorAlvoRaw, setValorAlvoRaw] = useState('')
  const [proposta, setProposta] = useState<ItemProposta[]>([])
  const [totalProposta, setTotalProposta] = useState(0)
  const [gerado, setGerado] = useState(false)

  const valorAlvo = parseFloat(valorAlvoRaw.replace(/\./g, '').replace(',', '.')) || 0

  useEffect(() => { if (user) fetchAtas() }, [user])

  async function fetchAtas() {
    if (!user) return
    let query = supabase.from('atas').select('id, numero_arp, entidade_gerenciadora').order('numero_arp')
    if (isOP) query = query.or(`owner_id.eq.${user.id},assigned_to.eq.${user.id}`)
    const { data } = await query
    if (data) setAtas(data as AtaOpcao[])
  }

  async function fetchItensAta(ataId: string) {
    setLoadingAta(true)
    setProposta([])
    setGerado(false)
    try {
      const { data: itensRaw, error } = await supabase
        .from('itens_ata')
        .select('id, descricao, unidade, valor_unitario, quantidade_registrada')
        .eq('ata_id', ataId)

      if (error) throw error

      const ids = (itensRaw || []).map(i => i.id)
      let historicoMap: Record<number, number> = {}

      if (ids.length > 0) {
        const { data: hist } = await supabase
          .from('historico_entregas')
          .select('item_ata_id, quantidade_entregue')
          .in('item_ata_id', ids)
        for (const h of (hist || [])) {
          if (h.item_ata_id)
            historicoMap[h.item_ata_id] = (historicoMap[h.item_ata_id] || 0) + (h.quantidade_entregue || 0)
        }
      }

      const itens: ItemAta[] = (itensRaw || [])
        .map(i => ({
          id: i.id,
          descricao: i.descricao || '',
          unidade: i.unidade || 'UN',
          valor_unitario: i.valor_unitario || 0,
          saldo_real: Math.max(0, (i.quantidade_registrada || 0) - (historicoMap[i.id] || 0))
        }))
        .filter(i => i.saldo_real > 0 && i.valor_unitario > 0)

      setItensAta(itens)
    } catch (err) {
      toast.error('Erro ao carregar itens da ATA')
    } finally {
      setLoadingAta(false)
    }
  }

  function handleSelectAta(id: string) {
    setSelectedAtaId(id)
    setProposta([])
    setGerado(false)
    fetchItensAta(id)
  }

  function handleGerar() {
    if (!selectedAtaId) return toast.error('Selecione uma ATA')
    if (valorAlvo <= 0) return toast.error('Informe um valor válido')
    if (itensAta.length === 0) return toast.error('Nenhum item com saldo disponível nesta ATA')
    const resultado = gerarProposta(itensAta, valorAlvo)
    setProposta(resultado)
    setTotalProposta(resultado.reduce((acc, i) => acc + i.valor_total, 0))
    setGerado(true)
  }

  function handleRegenerar() {
    const resultado = gerarProposta(itensAta, valorAlvo)
    setProposta(resultado)
    setTotalProposta(resultado.reduce((acc, i) => acc + i.valor_total, 0))
  }

  function handleExportPDF() {
    const ata = atas.find(a => a.id === selectedAtaId)
    const doc = new jsPDF({ orientation: 'landscape' })

    doc.setFillColor(15, 23, 42)
    doc.rect(0, 0, 297, 35, 'F')
    doc.setTextColor(255, 255, 255)
    doc.setFontSize(18)
    doc.setFont('helvetica', 'bold')
    doc.text('SIMULAÇÃO DE PROPOSTA', 14, 16)
    doc.setFontSize(9)
    doc.setFont('helvetica', 'normal')
    doc.text(`ATA: ${ata?.numero_arp || '—'}  |  ${ata?.entidade_gerenciadora || ''}`, 14, 24)
    doc.text(`Valor Alvo: ${formatCurrency(valorAlvo)}  |  Valor Simulado: ${formatCurrency(totalProposta)}`, 14, 30)
    doc.text(`Gerado em: ${new Date().toLocaleString('pt-BR')}`, 283, 30, { align: 'right' })

    const rows = proposta.map(i => [
      i.descricao,
      i.unidade,
      i.saldo_disponivel,
      i.qtd_sugerida,
      formatCurrency(i.valor_unitario),
      formatCurrency(i.valor_total)
    ])

    autoTable(doc, {
      startY: 42,
      head: [['Descrição', 'Und', 'Saldo Disp.', 'Qtd Sugerida', 'Valor Unit.', 'Valor Total']],
      body: rows,
      theme: 'striped',
      headStyles: { fillColor: [30, 41, 59], fontSize: 8, textColor: 255 },
      styles: { fontSize: 8, cellPadding: 2 },
      columnStyles: {
        0: { cellWidth: 'auto' },
        1: { cellWidth: 20, halign: 'center' },
        2: { cellWidth: 25, halign: 'center' },
        3: { cellWidth: 28, halign: 'center', fontStyle: 'bold' },
        4: { cellWidth: 30, halign: 'right' },
        5: { cellWidth: 35, halign: 'right', fontStyle: 'bold' }
      }
    })

    // @ts-expect-error autotable
    const finalY = doc.lastAutoTable.finalY + 8
    doc.setFontSize(10)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(30, 41, 59)
    doc.text(`TOTAL SIMULADO: ${formatCurrency(totalProposta)}`, 283, finalY, { align: 'right' })

    const limitStr = (str: string, maxLen: number) => {
      if (!str) return '—'
      return str.length <= maxLen ? str : str.substring(0, maxLen) + '...'
    }
    const arpClean = limitStr(ata?.numero_arp || '—', 25)
    const clientClean = limitStr(ata?.entidade_gerenciadora || '—', 40)

    const pageCount = doc.getNumberOfPages()
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i)
      doc.setFontSize(9)
      doc.setTextColor(100)
      doc.text(`Página ${i} de ${pageCount} | ARP: ${arpClean} | Órgão Gerenciador: ${clientClean}`, 14, 202)
    }

    doc.save(`Simulacao_Proposta_${ata?.numero_arp || 'ATA'}_${new Date().toISOString().split('T')[0]}.pdf`)
    toast.success('PDF exportado!')
  }

  const ataSelected = atas.find(a => a.id === selectedAtaId)
  const pct = valorAlvo > 0 ? Math.min(100, (totalProposta / valorAlvo) * 100) : 0

  return (
    <div className="space-y-5">
      {/* Aviso */}
      <div className="flex items-start gap-3 p-3 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 rounded-xl text-amber-700 dark:text-amber-400">
        <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
        <p className="text-xs font-medium">
          <strong>Simulação apenas.</strong> Nenhum valor é abatido da ATA. Esta ferramenta monta uma sugestão de itens para preencher um valor alvo com base no saldo disponível.
        </p>
      </div>

      {/* Controles */}
      <Card className="border-zinc-200 dark:border-zinc-800">
        <CardContent className="p-4 flex flex-wrap gap-4 items-end">
          {/* Seletor de ATA */}
          <div className="flex flex-col gap-1.5 flex-1 min-w-[200px]">
            <label className="text-[10px] font-black uppercase tracking-widest text-zinc-500">ATA</label>
            <Select value={selectedAtaId} onValueChange={handleSelectAta}>
              <SelectTrigger className="h-9 text-xs">
                <SelectValue placeholder="Selecione uma ATA..." />
              </SelectTrigger>
              <SelectContent>
                {atas.map(a => (
                  <SelectItem key={a.id} value={a.id}>
                    {a.numero_arp}{a.entidade_gerenciadora ? ` — ${a.entidade_gerenciadora.substring(0, 25)}` : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Valor Alvo */}
          <div className="flex flex-col gap-1.5 flex-1 min-w-[180px]">
            <label className="text-[10px] font-black uppercase tracking-widest text-zinc-500">Valor Alvo (R$)</label>
            <input
              type="text"
              inputMode="decimal"
              placeholder="Ex: 50000,00"
              value={valorAlvoRaw}
              onChange={e => setValorAlvoRaw(e.target.value)}
              className="h-9 px-3 text-sm font-bold border border-zinc-200 dark:border-zinc-800 rounded-md bg-white dark:bg-zinc-950 focus:outline-none focus:ring-2 focus:ring-brand-accent/30 focus:border-brand-accent"
            />
          </div>

          {/* Botões */}
          <div className="flex gap-2">
            <Button
              onClick={handleGerar}
              disabled={!selectedAtaId || valorAlvo <= 0 || loadingAta}
              className="h-9 gap-2 bg-brand-accent hover:opacity-90 text-white font-bold shadow shadow-brand-accent/20"
            >
              {loadingAta ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wand2 className="w-4 h-4" />}
              Gerar Proposta
            </Button>
            {gerado && (
              <>
                <Button variant="outline" onClick={handleRegenerar} className="h-9 gap-1.5 font-bold text-xs">
                  <Shuffle className="w-3.5 h-3.5" /> Regenerar
                </Button>
                <Button
                  variant="outline"
                  onClick={handleExportPDF}
                  className="h-9 gap-1.5 font-bold text-xs text-red-600 border-red-200 hover:bg-red-50"
                >
                  <FileDown className="w-3.5 h-3.5" /> PDF
                </Button>
              </>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Resultado */}
      {loadingAta ? (
        <div className="h-40 flex items-center justify-center gap-2 text-zinc-400">
          <Loader2 className="w-5 h-5 animate-spin" />
          <span className="text-sm">Carregando itens da ATA...</span>
        </div>
      ) : gerado && (
        <div className="space-y-3">
          {/* Resumo */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Card className="border-zinc-200 dark:border-zinc-800 p-4">
              <p className="text-[10px] font-black uppercase text-zinc-400 tracking-widest">Valor Alvo</p>
              <p className="text-xl font-black text-zinc-900 dark:text-zinc-100 mt-1">{formatCurrency(valorAlvo)}</p>
            </Card>
            <Card className="border-zinc-200 dark:border-zinc-800 p-4">
              <p className="text-[10px] font-black uppercase text-zinc-400 tracking-widest">Total Simulado</p>
              <p className={`text-xl font-black mt-1 ${pct >= 95 ? 'text-emerald-600' : pct >= 70 ? 'text-amber-600' : 'text-red-500'}`}>
                {formatCurrency(totalProposta)}
              </p>
              <div className="w-full h-1 bg-zinc-100 dark:bg-zinc-800 rounded-full mt-2 overflow-hidden">
                <div className={`h-full rounded-full transition-all ${pct >= 95 ? 'bg-emerald-500' : pct >= 70 ? 'bg-amber-500' : 'bg-red-500'}`} style={{ width: `${pct}%` }} />
              </div>
            </Card>
            <Card className="border-zinc-200 dark:border-zinc-800 p-4">
              <p className="text-[10px] font-black uppercase text-zinc-400 tracking-widest">Aproveitamento</p>
              <p className={`text-xl font-black mt-1 ${pct >= 95 ? 'text-emerald-600' : 'text-amber-600'}`}>{pct.toFixed(1)}%</p>
              <p className="text-[10px] text-zinc-400 mt-1">{proposta.length} itens · Saldo livre: {formatCurrency(valorAlvo - totalProposta)}</p>
            </Card>
          </div>

          {/* ATA info */}
          {ataSelected && (
            <p className="text-[10px] text-zinc-400 font-medium px-1">
              <span className="font-black text-brand-accent">{ataSelected.numero_arp}</span>
              {ataSelected.entidade_gerenciadora && ` — ${ataSelected.entidade_gerenciadora}`}
              &nbsp;·&nbsp; {itensAta.length} itens com saldo disponível
            </p>
          )}

          {/* Tabela */}
          {proposta.length === 0 ? (
            <div className="h-40 flex flex-col items-center justify-center gap-2 text-zinc-400 border-2 border-dashed border-zinc-200 dark:border-zinc-800 rounded-xl">
              <Package className="w-10 h-10 opacity-20" />
              <p className="text-sm font-bold">Não foi possível montar uma proposta</p>
              <p className="text-xs">O valor alvo pode ser menor que o menor item disponível, ou tente regenerar.</p>
            </div>
          ) : (
            <Card className="border-zinc-200 dark:border-zinc-800 overflow-hidden">
              <CardHeader className="pb-2 px-4 pt-3">
                <CardTitle className="text-sm font-bold flex items-center gap-2">
                  <Wand2 className="w-4 h-4 text-brand-accent" />
                  Itens Selecionados pela Simulação
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-zinc-100 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/50">
                        <th className="text-left px-4 py-2.5 font-black text-zinc-500 uppercase text-[10px] tracking-wider">Descrição</th>
                        <th className="text-center px-3 py-2.5 font-black text-zinc-500 uppercase text-[10px] tracking-wider">Und</th>
                        <th className="text-center px-3 py-2.5 font-black text-zinc-500 uppercase text-[10px] tracking-wider">Saldo Disp.</th>
                        <th className="text-center px-3 py-2.5 font-black text-zinc-500 uppercase text-[10px] tracking-wider">Qtd Sugerida</th>
                        <th className="text-right px-3 py-2.5 font-black text-zinc-500 uppercase text-[10px] tracking-wider">Val. Unit.</th>
                        <th className="text-right px-4 py-2.5 font-black text-zinc-500 uppercase text-[10px] tracking-wider">Val. Total</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-50 dark:divide-zinc-900">
                      {proposta.map(item => (
                        <tr key={item.id} className="hover:bg-zinc-50 dark:hover:bg-zinc-900/30 transition-colors">
                          <td className="px-4 py-2.5 font-medium text-zinc-800 dark:text-zinc-200 max-w-[300px]">
                            <p className="line-clamp-2">{item.descricao}</p>
                          </td>
                          <td className="px-3 py-2.5 text-center font-mono text-zinc-500">{item.unidade}</td>
                          <td className="px-3 py-2.5 text-center text-zinc-400">{item.saldo_disponivel}</td>
                          <td className="px-3 py-2.5 text-center">
                            <span className="font-black text-brand-accent text-sm">{item.qtd_sugerida}</span>
                          </td>
                          <td className="px-3 py-2.5 text-right text-zinc-600">{formatCurrency(item.valor_unitario)}</td>
                          <td className="px-4 py-2.5 text-right font-bold text-zinc-900 dark:text-zinc-100">{formatCurrency(item.valor_total)}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="border-t-2 border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-900/50">
                        <td colSpan={5} className="px-4 py-3 text-right font-black text-xs uppercase text-zinc-500 tracking-wider">Total Simulado</td>
                        <td className="px-4 py-3 text-right font-black text-base text-emerald-600">{formatCurrency(totalProposta)}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  )
}
