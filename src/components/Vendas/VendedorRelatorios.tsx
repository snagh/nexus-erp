import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../AuthContext'
import { toast } from 'sonner'
import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import {
  Package, Filter, FileText, RefreshCw, FileDown, Loader2,
  Search, ChevronDown
} from 'lucide-react'
import { Button } from '../ui/button'
import { Badge } from '../ui/badge'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../ui/card'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from '../ui/select'
import { formatCurrency } from '../../lib/utils'

export function VendedorRelatorios() {
  const { user, profile } = useAuth()
  const isAdm = profile?.nivel === 'ADM' || profile?.nivel === 'DEV' || profile?.nivel === 'SUP'

  const [loading, setLoading] = useState(false)
  const [atasRaw, setAtasRaw] = useState<any[]>([])
  
  // Selection states
  const [selectedCliente, setSelectedCliente] = useState<string>('')
  const [selectedAtaIds, setSelectedAtaIds] = useState<string[]>([])
  const [ataSearchFilter, setAtaSearchFilter] = useState('')
  const [filterSaldo, setFilterSaldo] = useState<'todos' | 'com_saldo' | 'zerados'>('todos')
  
  // Admin filter states
  const [colaboradores, setColaboradores] = useState<{ id: string; display_name: string }[]>([])
  const [filterColaborador, setFilterColaborador] = useState<string>('me')

  // Client target dropdown states
  const [clientDropdownOpen, setClientDropdownOpen] = useState(false)
  const [clientSearchText, setClientSearchText] = useState('')
  const clientDropdownRef = useRef<HTMLDivElement>(null)

  const targetUserId = filterColaborador === 'me' ? user?.id : filterColaborador

  // Click outside to close client dropdown
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (clientDropdownRef.current && !clientDropdownRef.current.contains(e.target as Node)) {
        setClientDropdownOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // Load collaborators if admin
  useEffect(() => {
    if (isAdm) fetchColaboradores()
  }, [isAdm])

  // Fetch ATAs and deliveries on mount or when filters change
  useEffect(() => {
    fetchAtaData()
  }, [filterColaborador, user])

  async function fetchColaboradores() {
    const { data } = await supabase.from('profiles').select('id, display_name').order('display_name')
    if (data) setColaboradores(data.map(d => ({ id: d.id, display_name: d.display_name || '' })))
  }

  const fetchAtaData = useCallback(async () => {
    if (!user) return
    setLoading(true)
    try {
      let query = supabase
        .from('atas')
        .select(`
          id, 
          numero_arp, 
          entidade_gerenciadora, 
          data_validade,
          owner_id, 
          assigned_to,
          itens_ata(
            id, 
            numero_item,
            descricao, 
            unidade, 
            quantidade_registrada, 
            valor_unitario, 
            marca,
            historico_entregas(
              id,
              quantidade_entregue,
              data_entrega,
              numero_nf,
              data_emissao_nf,
              motivo_pendencia
            )
          )
        `)

      if (!isAdm) {
        query = query.or(`owner_id.eq.${user.id},assigned_to.eq.${user.id}`)
      } else if (filterColaborador !== 'all' && filterColaborador !== 'me') {
        query = query.or(`owner_id.eq.${targetUserId},assigned_to.eq.${targetUserId}`)
      } else if (filterColaborador === 'me') {
        query = query.or(`owner_id.eq.${user.id},assigned_to.eq.${user.id}`)
      }

      const { data: atasData, error } = await query
      if (error) throw error

      setAtasRaw(atasData as any[] || [])
      
      // Reset selections when raw data changes
      setSelectedCliente('')
      setSelectedAtaIds([])
    } catch (err) {
      toast.error('Erro ao carregar dados das ATAs: ' + String(err))
    } finally {
      setLoading(false)
    }
  }, [user, isAdm, filterColaborador, targetUserId])

  // Derive unique clients (Órgãos Gerenciadores)
  const uniqueClientes = useMemo(() => {
    const clients = Array.from(new Set(atasRaw.map(a => (a.entidade_gerenciadora || 'SEM ÓRGÃO').trim())))
    return clients.filter(Boolean).sort()
  }, [atasRaw])

  // Filter clients based on dropdown search input
  const filteredClientes = useMemo(() => {
    if (!clientSearchText) return uniqueClientes
    const term = clientSearchText.toLowerCase()
    return uniqueClientes.filter(c => c.toLowerCase().includes(term))
  }, [uniqueClientes, clientSearchText])

  // Derive ATAs belonging to the selected client
  const empenhosDeCliente = useMemo(() => {
    if (!selectedCliente) return []
    return atasRaw.filter(a => (a.entidade_gerenciadora || 'SEM ÓRGÃO').trim() === selectedCliente)
  }, [atasRaw, selectedCliente])

  // Filter ATAs based on search text input
  const filteredAtas = useMemo(() => {
    if (!ataSearchFilter) return empenhosDeCliente
    const term = ataSearchFilter.toLowerCase()
    return empenhosDeCliente.filter(a => a.numero_arp.toLowerCase().includes(term))
  }, [empenhosDeCliente, ataSearchFilter])

  // Automatically select all ATAs when the selected client changes
  useEffect(() => {
    if (selectedCliente) {
      setSelectedAtaIds(empenhosDeCliente.map(a => a.id))
    } else {
      setSelectedAtaIds([])
    }
    setAtaSearchFilter('')
  }, [selectedCliente, empenhosDeCliente])

  // Calculate real-time physical and financial summary
  const summary = useMemo(() => {
    let valorGlobal = 0
    let valorConsumido = 0
    let qtdRegistrada = 0
    let qtdConsumida = 0

    const selectedAtas = atasRaw.filter(a => selectedAtaIds.includes(a.id))

    selectedAtas.forEach(a => {
      const itens = a.itens_ata || []
      itens.forEach((i: any) => {
        const qtdReg = i.quantidade_registrada || 0
        const valUnit = i.valor_unitario || 0

        const entregas = i.historico_entregas || []
        const totalEntregue = entregas.reduce((acc: number, h: any) => acc + (h.quantidade_entregue || 0), 0)
        const pendente = Math.max(0, qtdReg - totalEntregue)

        // Apply filter
        if (filterSaldo === 'com_saldo' && pendente <= 0) return
        if (filterSaldo === 'zerados' && pendente > 0) return

        valorGlobal += qtdReg * valUnit
        qtdRegistrada += qtdReg
        valorConsumido += totalEntregue * valUnit
        qtdConsumida += totalEntregue
      })
    })

    const valorSaldo = Math.max(0, valorGlobal - valorConsumido)
    const pctConsumo = valorGlobal > 0 ? Math.round((valorConsumido / valorGlobal) * 100) : 0
    const qtdSaldo = Math.max(0, qtdRegistrada - qtdConsumida)
    const pctQtdConsumo = qtdRegistrada > 0 ? Math.round((qtdConsumida / qtdRegistrada) * 100) : 0

    return {
      valorGlobal,
      valorConsumido,
      valorSaldo,
      qtdRegistrada,
      qtdConsumida,
      qtdSaldo,
      pctConsumo,
      pctQtdConsumo
    }
  }, [atasRaw, selectedAtaIds, filterSaldo])

  // PDF Generation: Relatório de Saldo de ATA
  function handleExportAtaSaldoPDF() {
    const doc = new jsPDF({ orientation: 'portrait' })

    const nomeUsuario = filterColaborador === 'me' || !isAdm
      ? (profile?.display_name || 'Usuário')
      : (colaboradores.find(c => c.id === filterColaborador)?.display_name || 'Todos')

    const activeAtas = atasRaw.filter(a => selectedAtaIds.includes(a.id))

    if (activeAtas.length === 0) {
      toast.warning('Selecione pelo menos uma ATA para exportar.')
      return
    }

    // 1. HEADER LIMPO E ELEGANTE (OTIMIZADO PARA IMPRESSÃO - INK SAVER)
    doc.setDrawColor(30, 41, 59)
    doc.setLineWidth(1)
    doc.line(14, 12, 196, 12)
    doc.setLineWidth(0.2)
    doc.line(14, 14, 196, 14)

    doc.setTextColor(15, 23, 42)
    doc.setFontSize(16)
    doc.setFont('helvetica', 'bold')
    doc.text("RELATÓRIO DE SALDO DE ATA (ARP)", 14, 22)
    
    doc.setFontSize(8)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(100)
    doc.text(`Documento Oficial de Saldo e Consumo | Gerado em: ${new Date().toLocaleDateString('pt-BR')} às ${new Date().toLocaleTimeString('pt-BR')}`, 14, 28)
    doc.text(`Responsável: ${nomeUsuario}`, 14, 33)

    // Calcular totais das ATAs selecionadas
    let totalGeral = 0
    let totalItensGlobais = 0
    let totalEntregueGlobal = 0
    let totalFinanceiroEntregue = 0

    activeAtas.forEach(a => {
      const itens = a.itens_ata || []
      itens.forEach((i: any) => {
        const qtdReg = i.quantidade_registrada || 0
        const unit = i.valor_unitario || 0

        const entregas = i.historico_entregas || []
        const entregue = entregas.reduce((acc: number, h: any) => acc + (Number(h.quantidade_entregue) || 0), 0)
        const pendente = Math.max(0, qtdReg - entregue)

        // Apply filter
        if (filterSaldo === 'com_saldo' && pendente <= 0) return
        if (filterSaldo === 'zerados' && pendente > 0) return

        totalGeral += (qtdReg * unit)
        totalItensGlobais += qtdReg
        totalEntregueGlobal += entregue
        totalFinanceiroEntregue += (entregue * unit)
      })
    })

    const totalFinanceiroPendente = totalGeral - totalFinanceiroEntregue
    const progressoGlobalQtd = totalItensGlobais > 0 ? Math.round((totalEntregueGlobal / totalItensGlobais) * 100) : 0
    const progressoGlobalFin = totalGeral > 0 ? Math.round((totalFinanceiroEntregue / totalGeral) * 100) : 0

    // 2. CARD DE RESUMO GLOBAL CONSOLIDADO - DESIGN ENFATIZANDO O SALDO
    doc.setDrawColor(30, 41, 59)
    doc.setLineWidth(0.5)
    doc.setFillColor(250, 252, 255)
    doc.roundedRect(14, 38, 182, 32, 1, 1, 'FD')

    doc.setTextColor(30, 41, 59)
    doc.setFontSize(8)
    doc.setFont('helvetica', 'bold')
    doc.text("RESUMO CONSOLIDADO DE SALDO DA ATA", 18, 44)

    doc.setDrawColor(226, 232, 240)
    doc.line(18, 46, 192, 46)

    // Linha 1: Saldos principais destacados
    doc.setFontSize(9)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(185, 28, 28) // Vermelho para ênfase no saldo
    doc.text(`SALDO FINANCEIRO DISPONÍVEL: ${formatCurrency(totalFinanceiroPendente)} (${100 - progressoGlobalFin}% livre)`, 18, 52)
    
    doc.setTextColor(15, 23, 42)
    doc.text(`SALDO FÍSICO DISPONÍVEL: ${totalItensGlobais - totalEntregueGlobal} und de ${totalItensGlobais} und (${100 - progressoGlobalQtd}% livre)`, 18, 57)

    // Divisor fino
    doc.setDrawColor(241, 245, 249)
    doc.line(18, 60, 192, 60)

    // Linha 2: Detalhamento Muted
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(7.5)
    doc.setTextColor(100)
    doc.text(`Valor Global (Teto): ${formatCurrency(totalGeral)}   |   Consumido: ${formatCurrency(totalFinanceiroEntregue)} (${progressoGlobalFin}%)`, 18, 66)
    doc.text(`Qtd Registrada: ${totalItensGlobais} und   |   Consumida: ${totalEntregueGlobal} und (${progressoGlobalQtd}%)`, 115, 66)

    let finalY = 76

    activeAtas.forEach((a) => {
      const itens = a.itens_ata || []

      // Filter items according to the selection
      const filteredItensAta = itens.filter((item: any) => {
        const entregas = item.historico_entregas || []
        const entregue = entregas.reduce((acc: number, h: any) => acc + (Number(h.quantidade_entregue) || 0), 0)
        const pendente = Math.max(0, item.quantidade_registrada - entregue)

        if (filterSaldo === 'com_saldo' && pendente <= 0) return false
        if (filterSaldo === 'zerados' && pendente > 0) return false
        return true
      })

      // Skip this ATA if it has no items matching the filter
      if (filteredItensAta.length === 0) return

      if (finalY > 240) {
        doc.addPage()
        finalY = 20
      }

      // Calcular valores da ATA específica
      let valorGlobalAta = 0
      let valorConsumidoAta = 0
      filteredItensAta.forEach((i: any) => {
        const qtdReg = i.quantidade_registrada || 0
        const unit = i.valor_unitario || 0
        valorGlobalAta += (qtdReg * unit)
        
        const entregas = i.historico_entregas || []
        const entregue = entregas.reduce((acc: number, h: any) => acc + (Number(h.quantidade_entregue) || 0), 0)
        valorConsumidoAta += (entregue * unit)
      })

      const pctAta = valorGlobalAta > 0 ? Math.round((valorConsumidoAta / valorGlobalAta) * 100) : 0

      // 3. CABEÇALHO DA ATA (ARP) - INK SAVER HIGHLIGHT
      doc.setFillColor(245, 247, 250)
      doc.setDrawColor(148, 163, 184)
      doc.roundedRect(14, finalY, 182, 12, 0.5, 0.5, 'FD')
      
      doc.setTextColor(15, 23, 42)
      doc.setFontSize(8.5)
      doc.setFont('helvetica', 'bold')
      doc.text(`ATA DE REGISTRO DE PREÇOS (ARP): ${a.numero_arp}`, 18, finalY + 7.5)
      
      doc.setFont('helvetica', 'normal')
      doc.text(`Global: ${formatCurrency(valorGlobalAta)} | Consumido: ${formatCurrency(valorConsumidoAta)}`, 78, finalY + 7.5)
      
      // Status B&W Pill
      doc.setDrawColor(148, 163, 184)
      doc.setFillColor(255, 255, 255)
      const pillW = 28
      const pillX = 163
      doc.roundedRect(pillX, finalY + 2.5, pillW, 7, 0.5, 0.5, 'FD')
      doc.setTextColor(30, 41, 59)
      doc.setFontSize(6)
      doc.setFont('helvetica', 'bold')
      doc.text(`${pctAta}% EXEC.`, pillX + pillW/2, finalY + 7.2, { align: 'center' })

      finalY += 14

      // Sort items by item number
      const sortedItens = [...filteredItensAta].sort((x, y) => (x.numero_item || 0) - (y.numero_item || 0))

      // 4. DETALHAMENTO DE ITENS DA ATA
      const rows = sortedItens.map((item: any) => {
        const entregas = item.historico_entregas || []
        const entregue = entregas.reduce((acc: number, h: any) => acc + (Number(h.quantidade_entregue) || 0), 0)
        const pendenteRaw = Math.max(0, item.quantidade_registrada - entregue)

        // Column 1: Item / Descrição e Histórico
        let descText = `ITEM ${item.numero_item || '—'}: ${item.descricao.toUpperCase()}`
        if (item.marca) {
          descText += `\nMARCA: ${item.marca.toUpperCase()}`
        }
        if (entregas.length > 0) {
          descText += `\n\n[ HISTÓRICO DE ENTREGAS ]`
          
          const sortedEntregas = [...entregas].sort((x, y) => {
            const dateA = new Date(x.data_emissao_nf || x.data_entrega || 0).getTime()
            const dateB = new Date(y.data_emissao_nf || y.data_entrega || 0).getTime()
            return dateA - dateB
          })

          sortedEntregas.forEach((h: any) => {
            let dateStr = h.data_emissao_nf || h.data_entrega
            let dt = 's/ data'
            if (dateStr) {
              const d = new Date(dateStr)
              if (!isNaN(d.getTime())) {
                dt = d.toLocaleDateString('pt-BR', { timeZone: 'UTC' })
                if (dateStr.includes('T')) dt = new Date(dateStr).toLocaleDateString('pt-BR')
              }
            }
            const nf = h.numero_nf ? `DOC/NF: ${h.numero_nf}` : 'Sem doc/NF'
            const mot = h.motivo_pendencia ? ` | Obs: ${h.motivo_pendencia}` : ''
            descText += `\n- Consumido ${h.quantidade_entregue} ${item.unidade || 'UN'} em ${dt} (${nf}${mot})`
          })
        } else {
          descText += `\n\n[ AGUARDANDO PROGRAMAÇÃO / CONSUMO ]`
        }

        // Column 2: Qtd Reg. / Und
        const qtyText = `${item.quantidade_registrada}\n${item.unidade || 'UN'}`

        // Column 3: Unitário / Total
        const unitVal = item.valor_unitario || 0
        const totalVal = item.quantidade_registrada * unitVal
        const valText = `${formatCurrency(unitVal)}\n${formatCurrency(totalVal)}`

        // Column 4: Qtd Consumida
        const consumText = `${entregue}\n${item.unidade || 'UN'}`

        // Column 5: Saldo Restante (Físico & Financeiro) com Ênfase
        const saldoFin = pendenteRaw * unitVal
        const saldoText = pendenteRaw === 0
          ? 'ZERADO\n(R$ 0,00)'
          : `${pendenteRaw} ${item.unidade || 'UN'}\n${formatCurrency(saldoFin)}`

        return [
          descText,
          qtyText,
          valText,
          consumText,
          saldoText
        ]
      })

      autoTable(doc, {
        startY: finalY,
        head: [['Descrição do Item & Histórico de Consumo', 'Qtd Reg.', 'Unitário / Total', 'Consumido', 'Saldo (Físico / Financeiro)']],
        body: rows,
        theme: 'grid',
        headStyles: { fillColor: [30, 41, 59], fontSize: 7.5, textColor: 255, halign: 'center' },
        styles: { fontSize: 7, cellPadding: 3, valign: 'top', overflow: 'linebreak' },
        columnStyles: {
          0: { cellWidth: 82 },
          1: { cellWidth: 18, halign: 'center', fontStyle: 'bold' },
          2: { cellWidth: 26, halign: 'right' },
          3: { cellWidth: 22, halign: 'center' },
          4: { cellWidth: 34, halign: 'center' }
        },
        willDrawCell: (data) => {
          if (data.section === 'body' && data.column.index === 4) {
            const rawText = data.cell.text.join('\n')
            if (rawText.includes('ZERADO')) {
              data.cell.styles.textColor = [148, 163, 184] // Muted slate gray
              data.cell.styles.fontStyle = 'normal'
            } else {
              data.cell.styles.textColor = [185, 28, 28] // Vermelho de alerta para o saldo restante
              data.cell.styles.fontStyle = 'bold'
            }
          }
        }
      })

      // @ts-expect-error dynamic
      finalY = doc.lastAutoTable.finalY + 12
    })

    // 5. RODAPÉ
    const uniqueARPs = Array.from(new Set(activeAtas.map(a => a.numero_arp).filter(Boolean)))
    const uniqueClients = Array.from(new Set(activeAtas.map(a => a.entidade_gerenciadora).filter(Boolean)))
    const arpText = uniqueARPs.length === 1 ? uniqueARPs[0] : (uniqueARPs.length > 1 ? 'Diversas' : '—')
    const clientText = uniqueClients.length === 1 ? uniqueClients[0] : (uniqueClients.length > 1 ? 'Diversos' : '—')

    const limitStrLocal = (str: string, maxLen: number) => {
      if (!str) return '—'
      return str.length <= maxLen ? str : str.substring(0, maxLen) + '...'
    }
    const arpClean = limitStrLocal(arpText, 25)
    const clientClean = limitStrLocal(clientText, 40)

    const pageCount = doc.getNumberOfPages()
    for(let i = 1; i <= pageCount; i++) {
      doc.setPage(i)
      doc.setFontSize(9)
      doc.setTextColor(100)
      doc.text(`Página ${i} de ${pageCount} | ARP: ${arpClean} | Órgão: ${clientClean}`, 14, 285)
    }

    const clientFileName = selectedCliente ? selectedCliente.replace(/\s+/g, '_') : 'Geral'
    const filterSuffix = filterSaldo === 'todos' ? '' : (filterSaldo === 'com_saldo' ? '_ComSaldo' : '_Zerados')
    doc.save(`Relatorio_Saldo_ATA_${clientFileName}${filterSuffix}_${new Date().toISOString().split('T')[0]}.pdf`)
    toast.success('Relatório de saldo de ATA gerado com sucesso!')
  }

  return (
    <div className="space-y-6">
      {/* Cabeçalho da página de relatórios */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 border-b border-zinc-200 dark:border-zinc-800 pb-5">
        <div>
          <h2 className="text-xl font-bold text-zinc-900 dark:text-zinc-50 flex items-center gap-2">
            <FileText className="w-5 h-5 text-emerald-600 dark:text-emerald-500" />
            Relatório de Saldo de Ata (ARP)
          </h2>
          <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1 max-w-2xl leading-relaxed">
            Consolidação física e financeira do saldo de atas de registro de preços, com histórico detalhado de consumo e entregas por órgão gerenciador.
          </p>
        </div>
        
        <div className="flex items-center gap-2 shrink-0">
          {isAdm && (
            <div className="flex items-center gap-1.5 bg-white dark:bg-zinc-900 px-3 py-1 rounded-lg border border-zinc-200 dark:border-zinc-800">
              <Filter className="w-3.5 h-3.5 text-zinc-400" />
              <span className="text-[11px] text-zinc-500 dark:text-zinc-400 font-bold uppercase tracking-wider shrink-0">Responsável:</span>
              <Select value={filterColaborador} onValueChange={setFilterColaborador}>
                <SelectTrigger className="h-8 w-44 text-xs border-none shadow-none focus:ring-0 bg-transparent py-0 px-1 font-semibold text-zinc-700 dark:text-zinc-300">
                  <SelectValue placeholder="Filtrar colaborador..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="me">Meus registros</SelectItem>
                  <SelectItem value="all">Todos</SelectItem>
                  {colaboradores.map(c => (
                    <SelectItem key={c.id} value={c.id}>{c.display_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          
          <Button
            variant="outline"
            size="sm"
            onClick={fetchAtaData}
            className="h-9 gap-1.5 text-xs font-bold bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 text-zinc-700 dark:text-zinc-300"
            disabled={loading}
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            Atualizar
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="h-64 flex flex-col items-center justify-center gap-3 text-zinc-400">
          <Loader2 className="w-8 h-8 animate-spin text-emerald-600" />
          <span className="text-sm font-medium">Buscando dados das atas...</span>
        </div>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
          
          {/* Coluna Esquerda: Formulário de Seleção */}
          <div className="xl:col-span-4">
            <Card className="border-zinc-200 dark:border-zinc-800 shadow-sm bg-white dark:bg-zinc-900 overflow-visible">
              <CardHeader className="pb-4 border-b border-zinc-100 dark:border-zinc-800/50">
                <CardTitle className="text-sm font-bold text-zinc-900 dark:text-zinc-50 flex items-center gap-2">
                  <Package className="w-4 h-4 text-emerald-600 dark:text-emerald-500" />
                  Parâmetros de Emissão
                </CardTitle>
                <CardDescription className="text-[11px] text-zinc-500 dark:text-zinc-400">
                  Selecione o órgão e as atas correspondentes para compor o relatório.
                </CardDescription>
              </CardHeader>
              <CardContent className="pt-5 space-y-5 overflow-visible">
                
                {/* Seleção do Cliente (Órgão Gerenciador) */}
                <div className="space-y-2 relative" ref={clientDropdownRef}>
                  <label className="text-[11px] font-black text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">
                    Órgão Gerenciador (Cliente)
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      setClientDropdownOpen(o => !o)
                      setClientSearchText('')
                    }}
                    className="w-full h-10 text-xs flex items-center justify-between gap-2 px-3 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 text-zinc-800 dark:text-zinc-200 hover:border-zinc-300 dark:hover:border-zinc-700 transition-all focus:ring-2 focus:ring-emerald-500/25 outline-none"
                  >
                    <span className="truncate text-left font-medium">
                      {selectedCliente || '-- Selecione o Órgão Gerenciador --'}
                    </span>
                    <ChevronDown className="w-4 h-4 text-zinc-400 shrink-0" />
                  </button>
                  
                  {clientDropdownOpen && (
                    <div className="absolute z-[200] left-0 right-0 mt-1 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg shadow-2xl overflow-hidden animate-in fade-in duration-100">
                      <div className="p-2 border-b border-zinc-100 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900 sticky top-0">
                        <div className="relative">
                          <Search className="w-3.5 h-3.5 text-zinc-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                          <input
                            type="text"
                            placeholder="Pesquisar órgão gerenciador..."
                            value={clientSearchText}
                            onChange={e => setClientSearchText(e.target.value)}
                            className="w-full bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-md p-1.5 pl-8 text-xs text-zinc-800 dark:text-zinc-200 focus:outline-none focus:border-emerald-500"
                          />
                        </div>
                      </div>
                      <div className="max-h-48 overflow-y-auto p-1 space-y-0.5 scrollbar-thin scrollbar-thumb-zinc-200 dark:scrollbar-thumb-zinc-800">
                        {filteredClientes.length === 0 ? (
                          <p className="text-center text-[10px] text-zinc-400 py-3 italic">Nenhum cliente localizado</p>
                        ) : (
                          filteredClientes.map(c => (
                            <button
                              key={c}
                              type="button"
                              onClick={() => {
                                setSelectedCliente(c)
                                setClientDropdownOpen(false)
                              }}
                              className={`w-full text-left px-3 py-2 rounded-md text-xs transition-colors ${
                                selectedCliente === c
                                  ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400 font-bold'
                                  : 'text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800/60'
                              }`}
                            >
                              {c}
                            </button>
                          ))
                        )}
                      </div>
                    </div>
                  )}
                </div>

                {/* Checklist de ATAs do Cliente Selecionado */}
                {selectedCliente && (
                  <div className="space-y-2 animate-in fade-in duration-200">
                    <div className="flex items-center justify-between">
                      <label className="text-[11px] font-black text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">
                        Atas de Registro de Preços (ARPs)
                      </label>
                      <span className="text-[10px] text-zinc-400 font-medium">
                        {selectedAtaIds.length} selecionada(s)
                      </span>
                    </div>

                    <div className="relative">
                      <Search className="w-3.5 h-3.5 text-zinc-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                      <input
                        type="text"
                        placeholder="Filtrar por ARP..."
                        value={ataSearchFilter}
                        onChange={e => setAtaSearchFilter(e.target.value)}
                        className="w-full bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-lg p-2 pl-8 text-xs text-zinc-800 dark:text-zinc-200 focus:outline-none focus:ring-1 focus:ring-emerald-500/50"
                      />
                    </div>

                    <div className="max-h-[260px] overflow-y-auto border border-zinc-200 dark:border-zinc-800 rounded-lg p-1.5 bg-zinc-50/50 dark:bg-zinc-950/20 space-y-1 scrollbar-thin scrollbar-thumb-zinc-200 dark:scrollbar-thumb-zinc-800">
                      {filteredAtas.length === 0 ? (
                        <p className="text-center text-[10px] text-zinc-400 py-3 italic">Nenhuma ATA encontrada</p>
                      ) : (
                        filteredAtas.map(a => {
                          const isSelected = selectedAtaIds.includes(a.id)
                          const totalItens = a.itens_ata?.length || 0
                          return (
                            <div
                              key={a.id}
                              onClick={() => {
                                setSelectedAtaIds(prev =>
                                  prev.includes(a.id) ? prev.filter(id => id !== a.id) : [...prev, a.id]
                                )
                              }}
                              className={`flex items-center justify-between px-3 py-2 rounded-md cursor-pointer border transition-all ${
                                isSelected
                                  ? 'bg-emerald-50/40 text-emerald-700 dark:bg-emerald-950/20 dark:text-emerald-400 border-emerald-100/50 dark:border-emerald-900/15 font-semibold'
                                  : 'hover:bg-zinc-100 dark:hover:bg-zinc-800/40 border-transparent text-zinc-700 dark:text-zinc-300'
                              }`}
                            >
                              <div className="flex items-center gap-2.5 min-w-0">
                                <input
                                  type="checkbox"
                                  checked={isSelected}
                                  onChange={() => {}} // event handled in parent onClick
                                  className="rounded border-zinc-300 dark:border-zinc-850 text-emerald-600 focus:ring-emerald-500/30 cursor-pointer w-3.5 h-3.5"
                                />
                                <div className="flex flex-col min-w-0 leading-tight">
                                  <span className="text-xs font-bold truncate">ARP: {a.numero_arp}</span>
                                  <span className="text-[9px] text-zinc-400 mt-0.5">
                                    {totalItens} {totalItens === 1 ? 'item' : 'itens'}
                                    {a.data_validade && ` | Validade: ${new Date(a.data_validade).toLocaleDateString('pt-BR')}`}
                                  </span>
                                </div>
                              </div>
                            </div>
                          )
                        })
                      )}
                    </div>

                    {/* Checkbox Quick Actions */}
                    <div className="flex gap-2 pt-1">
                      <button
                        type="button"
                        onClick={() => setSelectedAtaIds(empenhosDeCliente.map(a => a.id))}
                        className="text-[10px] flex-1 py-1.5 rounded bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-600 dark:text-zinc-400 font-bold transition-colors uppercase tracking-wider"
                      >
                        Selecionar Todas
                      </button>
                      <button
                        type="button"
                        onClick={() => setSelectedAtaIds([])}
                        className="text-[10px] flex-1 py-1.5 rounded bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-600 dark:text-zinc-400 font-bold transition-colors uppercase tracking-wider"
                      >
                        Limpar Seleção
                      </button>
                    </div>
                  </div>
                )}

                {/* Filtro de Saldo de Itens */}
                {selectedCliente && selectedAtaIds.length > 0 && (
                  <div className="space-y-2 animate-in fade-in duration-200">
                    <label className="text-[11px] font-black text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">
                      Filtro de Saldo dos Itens
                    </label>
                    <Select value={filterSaldo} onValueChange={(val: any) => setFilterSaldo(val)}>
                      <SelectTrigger className="h-10 bg-white dark:bg-zinc-950 border-zinc-200 dark:border-zinc-800 text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                        <SelectValue placeholder="Selecionar filtro..." />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="todos">Todos os Itens (Com e Sem Saldo)</SelectItem>
                        <SelectItem value="com_saldo">Apenas Itens com Saldo Disponível</SelectItem>
                        <SelectItem value="zerados">Apenas Itens Zerados (Totalmente Consumidos)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                )}

                {/* Botão Principal de Exportação */}
                <Button
                  onClick={handleExportAtaSaldoPDF}
                  disabled={!selectedCliente || selectedAtaIds.length === 0}
                  className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-bold gap-2 h-11 rounded-xl shadow-lg shadow-emerald-600/10 dark:shadow-none transition-all active:scale-98"
                >
                  <FileDown className="w-4 h-4" />
                  Gerar Relatório de Saldo de Ata
                </Button>

              </CardContent>
            </Card>
          </div>

          {/* Coluna Direita: Resumo em Tempo Real */}
          <div className="xl:col-span-8 h-full">
            {!selectedCliente || selectedAtaIds.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center border border-dashed border-zinc-200 dark:border-zinc-800 rounded-2xl p-8 bg-zinc-50/20 dark:bg-zinc-900/5 text-center min-h-[350px] transition-colors">
                <FileText className="w-12 h-12 text-zinc-300 dark:text-zinc-700 mb-3 animate-pulse" />
                <h3 className="text-sm font-bold text-zinc-700 dark:text-zinc-300">Resumo de Saldos em Tempo Real</h3>
                <p className="text-xs text-zinc-500 dark:text-zinc-500 max-w-xs mt-1 leading-relaxed">
                  Selecione um Órgão Gerenciador e as ARPs desejadas para visualizar o saldo consolidado físico e financeiro antes de gerar o relatório oficial.
                </p>
              </div>
            ) : (
              <Card className="border-zinc-200 dark:border-zinc-800 shadow-sm h-full flex flex-col bg-white dark:bg-zinc-900 animate-in fade-in duration-300">
                <CardHeader className="pb-3 border-b border-zinc-100 dark:border-zinc-800/60">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <CardTitle className="text-sm font-bold text-zinc-900 dark:text-zinc-50">
                        Resumo Consolidado de Saldo
                      </CardTitle>
                      <p className="text-[11px] text-zinc-500 dark:text-zinc-400 truncate max-w-md mt-0.5 font-medium">
                        Órgão: {selectedCliente}
                      </p>
                    </div>
                    <Badge className="bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400 border border-emerald-100 dark:border-emerald-900/30 text-[10px] shrink-0 font-bold">
                      {selectedAtaIds.length} ARP(s) ativa(s)
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="pt-5 flex-1 flex flex-col justify-between space-y-5">
                  
                  {/* KPI Cards */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="p-4 rounded-xl bg-zinc-50 dark:bg-zinc-950 border border-zinc-150 dark:border-zinc-800/80">
                      <p className="text-[10px] font-black text-zinc-500 dark:text-zinc-455 uppercase tracking-wider">Saldo Financeiro Disponível</p>
                      <h4 className="text-xl font-black text-emerald-600 dark:text-emerald-500 mt-1">
                        {formatCurrency(summary.valorSaldo)}
                      </h4>
                      <p className="text-[10px] text-zinc-400 dark:text-zinc-500 mt-0.5 font-medium">
                        de {formatCurrency(summary.valorGlobal)} global teto ({100 - summary.pctConsumo}% livre)
                      </p>
                    </div>
                    
                    <div className="p-4 rounded-xl bg-zinc-50 dark:bg-zinc-950 border border-zinc-150 dark:border-zinc-800/80">
                      <p className="text-[10px] font-black text-zinc-500 dark:text-zinc-455 uppercase tracking-wider">Saldo Físico Disponível</p>
                      <h4 className="text-xl font-black text-zinc-800 dark:text-zinc-200 mt-1">
                        {summary.qtdSaldo} <span className="text-xs font-normal text-zinc-500">unidades</span>
                      </h4>
                      <p className="text-[10px] text-zinc-400 dark:text-zinc-500 mt-0.5 font-medium">
                        de {summary.qtdRegistrada} registradas ({100 - summary.pctQtdConsumo}% livre)
                      </p>
                    </div>
                  </div>

                  {/* Consumo Progress Bar */}
                  <div className="space-y-2 p-4 rounded-xl bg-zinc-50 dark:bg-zinc-950 border border-zinc-150 dark:border-zinc-800/80">
                    <div className="flex justify-between items-center text-[10px]">
                      <span className="font-black text-zinc-500 dark:text-zinc-455 uppercase tracking-wider">Percentual Consumido (Financeiro)</span>
                      <span className="font-black text-zinc-800 dark:text-zinc-200">{summary.pctConsumo}%</span>
                    </div>
                    <div className="w-full h-2 bg-zinc-200 dark:bg-zinc-800 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full bg-emerald-500 transition-all duration-500"
                        style={{ width: `${summary.pctConsumo}%` }}
                      />
                    </div>
                    <div className="flex justify-between text-[10px] text-zinc-400 dark:text-zinc-500 font-medium">
                      <span>Consumido: {formatCurrency(summary.valorConsumido)}</span>
                      <span>Restante: {formatCurrency(summary.valorSaldo)}</span>
                    </div>
                  </div>

                  {/* ATAs List & Balances */}
                  <div className="space-y-2.5 flex-1">
                    <p className="text-[10px] font-black text-zinc-500 dark:text-zinc-455 uppercase tracking-wider">Detalhamento por ARP</p>
                    <div className="space-y-2 max-h-[240px] overflow-y-auto pr-1 scrollbar-thin scrollbar-thumb-zinc-200 dark:scrollbar-thumb-zinc-800">
                      {atasRaw.filter(a => selectedAtaIds.includes(a.id)).map(a => {
                        let ataGlobal = 0
                        let ataConsumido = 0
                        a.itens_ata?.forEach((i: any) => {
                          const r = i.quantidade_registrada || 0
                          const u = i.valor_unitario || 0
                          
                          const entregas = i.historico_entregas || []
                          const e = entregas.reduce((acc: number, curr: any) => acc + (curr.quantidade_entregue || 0), 0)
                          const pendente = Math.max(0, r - e)

                          // Apply filter
                          if (filterSaldo === 'com_saldo' && pendente <= 0) return
                          if (filterSaldo === 'zerados' && pendente > 0) return

                          ataGlobal += r * u
                          ataConsumido += e * u
                        })

                        // Skip rendering this ATA in the list if it has no items matching the filter
                        if (ataGlobal === 0) return null

                        const ataSaldo = Math.max(0, ataGlobal - ataConsumido)
                        const ataPct = ataGlobal > 0 ? Math.round((ataConsumido / ataGlobal) * 100) : 0

                        return (
                          <div key={a.id} className="flex justify-between items-center text-xs p-2.5 rounded-lg bg-zinc-50 dark:bg-zinc-950 border border-zinc-150 dark:border-zinc-800/80">
                            <div className="min-w-0 pr-3">
                              <p className="font-bold text-zinc-800 dark:text-zinc-200 truncate">ARP {a.numero_arp}</p>
                              <p className="text-[9px] text-zinc-400 mt-0.5">Execução: {ataPct}% consumido</p>
                            </div>
                            <div className="text-right shrink-0">
                              <p className="font-black text-emerald-600 dark:text-emerald-500">{formatCurrency(ataSaldo)}</p>
                              <p className="text-[9px] text-zinc-400 mt-0.5">de {formatCurrency(ataGlobal)} teto</p>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>

        </div>
      )}

      {/* Disclaimer de isolamento */}
      {!isAdm && (
        <p className="text-[10px] text-zinc-400 text-center mt-4">
          Exibindo apenas registros sob sua responsabilidade. Para relatórios consolidados de outros vendedores, contate um administrador.
        </p>
      )}
    </div>
  )
}
