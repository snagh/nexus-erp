import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../lib/supabase'
import { toast } from 'sonner'
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  Tooltip, 
  ResponsiveContainer, 
  LineChart, 
  Line,
  PieChart,
  Pie,
  Cell
} from 'recharts'
import { 
  Calendar, 
  FileSpreadsheet,
  FileDown,
  X,
  FileText,
  RefreshCw
} from 'lucide-react'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '../components/ui/card'
import { Button } from '../components/ui/button'
import { Badge } from '../components/ui/badge'
import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import * as XLSX from 'xlsx'

interface LogEntry {
  id: string
  user_id: string
  display_name: string
  nivel: string
  setor: string
  page: string
  page_friendly: string
  session_id: string
  duration_seconds: number
  logged_at: string
  logged_out_at: string | null
  device_type: string
  day_of_week: number
  hour_of_day: number
}

const COLORS = ['#6366f1', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4', '#14b8a6']

export function NexusAnalytics() {
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [timeRange, setTimeRange] = useState<7 | 30 | 90>(7)

  const [loading, setLoading] = useState<boolean>(true)

  // Estados para geração de relatório avançado
  const [showReportModal, setShowReportModal] = useState(false)
  const [reportType, setReportType] = useState<'consolidado' | 'usuario' | 'tela' | 'usuario_tela'>('consolidado')
  const [reportFormat, setReportFormat] = useState<'xlsx' | 'pdf'>('xlsx')

  // Fetch telemetry logs (Paginação automática para buscar todo o histórico do período)
  const fetchLogs = async () => {
    setLoading(true)
    try {
      const daysAgoObj = new Date()
      daysAgoObj.setDate(daysAgoObj.getDate() - timeRange)
      const startDateIso = daysAgoObj.toISOString()
      
      let allLogs: LogEntry[] = []
      let page = 0
      const pageSize = 1000
      let hasMore = true

      while (hasMore && page < 50) { // Suporta até 50.000 logs de telemetria por período
        const { data, error } = await (supabase as any)
          .from('usage_logs')
          .select('*')
          .gte('logged_at', startDateIso)
          .order('logged_at', { ascending: false })
          .range(page * pageSize, (page + 1) * pageSize - 1)

        if (error) throw error
        if (!data || data.length === 0) {
          hasMore = false
        } else {
          allLogs = allLogs.concat(data)
          if (data.length < pageSize) {
            hasMore = false
          } else {
            page++
          }
        }
      }

      setLogs(allLogs)
    } catch (err: any) {
      toast.error('Erro ao carregar telemetria: ' + err.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchLogs()
  }, [timeRange])

  // --- CLIENT-SIDE AGGREGATIONS ---

  // 1. General Metrics
  const totalPageViews = logs.length
  const uniqueUsers = new Set(logs.map(l => l.user_id)).size
  
  // Page distribution
  const pageCounts = logs.reduce((acc, curr) => {
    const name = curr.page_friendly || curr.page || 'Desconhecido'
    acc[name] = (acc[name] || 0) + 1
    return acc
  }, {} as Record<string, number>)

  const mostActivePage = Object.entries(pageCounts).reduce(
    (max, curr) => (curr[1] > max[1] ? curr : max),
    ['Nenhuma', 0]
  )[0]

  // Hour counts
  const hourCounts = logs.reduce((acc, curr) => {
    const hr = curr.hour_of_day ?? new Date(curr.logged_at).getHours()
    acc[hr] = (acc[hr] || 0) + 1
    return acc
  }, {} as Record<number, number>)

  const peakHour = Object.entries(hourCounts).reduce(
    (max, curr) => (curr[1] > max[1] ? curr : max),
    ['-1', 0]
  )[0]

  // Sector counts
  const sectorCounts = logs.reduce((acc, curr) => {
    const sec = curr.setor || 'GERAL'
    acc[sec] = (acc[sec] || 0) + 1
    return acc
  }, {} as Record<string, number>)

  const mostActiveSector = Object.entries(sectorCounts).reduce(
    (max, curr) => (curr[1] > max[1] ? curr : max),
    ['Nenhum', 0]
  )[0]

  // 2. Timeline chart data (Grouped by date)
  const timelineData = useMemo(() => {
    const groups: Record<string, { date: string; views: number; duration: number; count: number }> = {}
    
    // Fill all dates in range with 0 to avoid empty charts
    for (let i = timeRange - 1; i >= 0; i--) {
      const d = new Date()
      d.setDate(d.getDate() - i)
      const dateStr = d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
      groups[dateStr] = { date: dateStr, views: 0, duration: 0, count: 0 }
    }

    logs.forEach(l => {
      const dateStr = new Date(l.logged_at).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
      if (groups[dateStr]) {
        groups[dateStr].views += 1
        groups[dateStr].duration += l.duration_seconds || 0
        groups[dateStr].count += 1
      }
    })

    return Object.values(groups).map(g => ({
      ...g,
      avg_minutes: g.count > 0 ? parseFloat(((g.duration / g.count) / 60).toFixed(1)) : 0
    }))
  }, [logs, timeRange])

  // 3. Hourly profile chart data
  const hourlyData = useMemo(() => {
    const hours = Array.from({ length: 24 }, (_, i) => ({
      hour: `${String(i).padStart(2, '0')}:00`,
      views: 0
    }))

    logs.forEach(l => {
      const hr = l.hour_of_day ?? new Date(l.logged_at).getHours()
      if (hr >= 0 && hr < 24) {
        hours[hr].views += 1
      }
    })

    return hours
  }, [logs])

  // 4. Device type distribution
  const deviceData = useMemo(() => {
    const devices: Record<string, number> = { desktop: 0, mobile: 0, tablet: 0 }
    logs.forEach(l => {
      const dev = l.device_type || 'desktop'
      if (devices[dev] !== undefined) {
        devices[dev] += 1
      }
    })
    return Object.entries(devices).map(([name, value]) => ({ name: name.toUpperCase(), value }))
  }, [logs])

  // 5. Ranking Tables
  // Page Rankings (Views + Avg duration)
  const pageRankings = useMemo(() => {
    const stats: Record<string, { name: string; views: number; totalDuration: number }> = {}
    logs.forEach(l => {
      const name = l.page_friendly || l.page || 'Desconhecido'
      if (!stats[name]) {
        stats[name] = { name, views: 0, totalDuration: 0 }
      }
      stats[name].views += 1
      stats[name].totalDuration += l.duration_seconds || 0
    })

    return Object.values(stats)
      .sort((a, b) => b.views - a.views)
      .slice(0, 10) // Top 10
  }, [logs])

  // User Rankings
  const userRankings = useMemo(() => {
    const stats: Record<string, { display_name: string; setor: string; views: number; totalDuration: number }> = {}
    logs.forEach(l => {
      const key = l.user_id
      if (!stats[key]) {
        stats[key] = { display_name: l.display_name, setor: l.setor || 'GERAL', views: 0, totalDuration: 0 }
      }
      stats[key].views += 1
      stats[key].totalDuration += l.duration_seconds || 0
    })

    return Object.values(stats)
      .sort((a, b) => b.totalDuration - a.totalDuration)
  }, [logs])

  // Export logs to CSV
  const handleExportCSV = () => {
    if (logs.length === 0) {
      toast.warning('Nenhum log para exportar.')
      return
    }

    const headers = ['ID', 'Usuario', 'Nivel', 'Setor', 'Pagina', 'Nome Amigavel', 'Dispositivo', 'Acessado Em', 'Duracao (Segundos)']
    const csvRows = [headers.join(';')]

    logs.forEach(l => {
      const row = [
        l.id,
        l.display_name,
        l.nivel,
        l.setor,
        l.page,
        l.page_friendly || '',
        l.device_type,
        l.logged_at,
        l.duration_seconds
      ]
      csvRows.push(row.map(val => `"${String(val).replace(/"/g, '""')}"`).join(';'))
    })

    const blob = new Blob([new Uint8Array([0xEF, 0xBB, 0xBF]), csvRows.join('\n')], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.setAttribute('href', url)
    link.setAttribute('download', `nexus_telemetry_${timeRange}d_${new Date().toISOString().split('T')[0]}.csv`)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  // Gera relatório em formato Excel (.xlsx)
  const generateExcelReport = () => {
    const wb = XLSX.utils.book_new()
    const fileName = `relatorio_telemetria_${reportType}_${timeRange}d_${new Date().toISOString().split('T')[0]}.xlsx`

    if (reportType === 'consolidado') {
      const summaryData = [
        { Metrica: 'Total Page Views', Valor: totalPageViews },
        { Metrica: 'Usuarios Unicos', Valor: uniqueUsers },
        { Metrica: 'Tempo Total de Uso', Valor: `${Math.round(logs.reduce((acc, curr) => acc + (curr.duration_seconds || 0), 0) / 60)} min` },
        { Metrica: 'Fuso de Pico (Hora)', Valor: `${peakHour}:00` },
        { Metrica: 'Setor Mais Ativo', Valor: mostActiveSector },
        { Metrica: 'Tela Mais Acessada', Valor: mostActivePage }
      ]
      const wsSummary = XLSX.utils.json_to_sheet(summaryData)
      XLSX.utils.book_append_sheet(wb, wsSummary, 'Resumo Geral')

      const pagesData = pageRankings.map((p, idx) => ({
        Ranking: idx + 1,
        'Pagina / Tela': p.name,
        Acessos: p.views,
        'Tempo Total (Minutos)': parseFloat((p.totalDuration / 60).toFixed(1)),
        'Tempo Medio (Segundos)': p.views > 0 ? Math.round(p.totalDuration / p.views) : 0
      }))
      const wsPages = XLSX.utils.json_to_sheet(pagesData)
      XLSX.utils.book_append_sheet(wb, wsPages, 'Acessos por Tela')

      const usersData = userRankings.map((u, idx) => ({
        Ranking: idx + 1,
        Colaborador: u.display_name,
        Setor: u.setor,
        Acessos: u.views,
        'Tempo Total (Minutos)': parseFloat((u.totalDuration / 60).toFixed(1)),
        'Tempo Medio (Segundos)': u.views > 0 ? Math.round(u.totalDuration / u.views) : 0
      }))
      const wsUsers = XLSX.utils.json_to_sheet(usersData)
      XLSX.utils.book_append_sheet(wb, wsUsers, 'Acessos por Usuario')

    } else if (reportType === 'usuario') {
      const usersData = userRankings.map((u, idx) => ({
        Ranking: idx + 1,
        Colaborador: u.display_name,
        Setor: u.setor,
        'Total Page Views': u.views,
        'Tempo Total Acumulado (Minutos)': parseFloat((u.totalDuration / 60).toFixed(1)),
        'Tempo Medio por Pagina (Segundos)': u.views > 0 ? Math.round(u.totalDuration / u.views) : 0
      }))
      const wsUsers = XLSX.utils.json_to_sheet(usersData)
      XLSX.utils.book_append_sheet(wb, wsUsers, 'Relatorio por Usuario')

    } else if (reportType === 'tela') {
      const pagesData = pageRankings.map((p, idx) => ({
        Ranking: idx + 1,
        'Pagina / Tela': p.name,
        'Total Acessos': p.views,
        'Tempo Total Gasto (Minutos)': parseFloat((p.totalDuration / 60).toFixed(1)),
        'Tempo Medio por Acesso (Segundos)': p.views > 0 ? Math.round(p.totalDuration / p.views) : 0
      }))
      const wsPages = XLSX.utils.json_to_sheet(pagesData)
      XLSX.utils.book_append_sheet(wb, wsPages, 'Relatorio por Tela')

    } else if (reportType === 'usuario_tela') {
      const stats: Record<string, { user: string; setor: string; page: string; views: number; totalDuration: number }> = {}
      logs.forEach(l => {
        const pageName = l.page_friendly || l.page || 'Desconhecido'
        const key = `${l.user_id}_${pageName}`
        if (!stats[key]) {
          stats[key] = {
            user: l.display_name,
            setor: l.setor || 'GERAL',
            page: pageName,
            views: 0,
            totalDuration: 0
          }
        }
        stats[key].views += 1
        stats[key].totalDuration += l.duration_seconds || 0
      })

      const rawData = Object.values(stats).sort((a, b) => b.totalDuration - a.totalDuration)
      const excelData = rawData.map(item => ({
        Colaborador: item.user,
        Setor: item.setor,
        'Pagina / Tela': item.page,
        Acessos: item.views,
        'Tempo Gasto (Minutos)': parseFloat((item.totalDuration / 60).toFixed(1)),
        'Tempo Medio (Segundos)': item.views > 0 ? Math.round(item.totalDuration / item.views) : 0
      }))

      const ws = XLSX.utils.json_to_sheet(excelData)
      XLSX.utils.book_append_sheet(wb, ws, 'Por Usuario e Tela')
    }

    XLSX.writeFile(wb, fileName)
    toast.success('Relatório Excel gerado e baixado com sucesso!')
    setShowReportModal(false)
  }

  // Gera relatório em formato PDF (.pdf)
  const generatePdfReport = () => {
    const doc = new jsPDF({ orientation: 'portrait' })
    const titleRange = `${timeRange} dias`
    const dateStr = new Date().toLocaleDateString('pt-BR')

    doc.setFontSize(16)
    doc.setTextColor(24, 24, 27)
    doc.text('Relatorio de Telemetria e Uso - Nexus', 14, 20)
    doc.setFontSize(10)
    doc.setTextColor(113, 113, 122)
    doc.text(`Periodo de Analise: Ultimos ${titleRange} | Gerado em: ${dateStr}`, 14, 26)
    
    doc.setDrawColor(228, 228, 231)
    doc.line(14, 30, 196, 30)

    if (reportType === 'consolidado') {
      doc.setFontSize(12)
      doc.setTextColor(24, 24, 27)
      doc.text('1. Resumo Geral de Metricas', 14, 38)

      const totalTimeMin = Math.round(logs.reduce((acc, curr) => acc + (curr.duration_seconds || 0), 0) / 60)
      const avgTimeSec = logs.length > 0 ? Math.round(logs.reduce((acc, curr) => acc + (curr.duration_seconds || 0), 0) / logs.length) : 0

      autoTable(doc, {
        startY: 42,
        head: [['Metrica de Uso', 'Valor Calculado']],
        body: [
          ['Total Page Views (Acessos)', String(totalPageViews)],
          ['Usuarios Unicos (Colaboradores)', String(uniqueUsers)],
          ['Tempo Total Acumulado', `${totalTimeMin} min`],
          ['Tempo Medio por Acesso', `${avgTimeSec} segundos`],
          ['Fuso de Pico Operacional', `${peakHour}:00`],
          ['Setor Mais Ativo no Nexus', mostActiveSector],
          ['Tela Mais Requisitada', mostActivePage]
        ],
        theme: 'striped',
        headStyles: { fillColor: [99, 102, 241], fontSize: 9, fontStyle: 'bold' },
        bodyStyles: { fontSize: 8 }
      })

      const lastY = (doc as any).lastAutoTable.finalY || 90
      doc.setFontSize(12)
      doc.text('2. Top 5 Telas Mais Acessadas', 14, lastY + 10)

      autoTable(doc, {
        startY: lastY + 14,
        head: [['Posicao', 'Pagina / Tela', 'Acessos', 'Tempo Total', 'Tempo Medio']],
        body: pageRankings.slice(0, 5).map((p, idx) => [
          `#${idx + 1}`,
          p.name,
          String(p.views),
          `${parseFloat((p.totalDuration / 60).toFixed(1))}m`,
          `${p.views > 0 ? Math.round(p.totalDuration / p.views) : 0}s`
        ]),
        theme: 'striped',
        headStyles: { fillColor: [16, 185, 129], fontSize: 9, fontStyle: 'bold' },
        bodyStyles: { fontSize: 8 }
      })

    } else if (reportType === 'usuario') {
      doc.setFontSize(12)
      doc.text('Engajamento Acumulado por Usuario', 14, 38)

      autoTable(doc, {
        startY: 42,
        head: [['Pos.', 'Colaborador', 'Setor', 'Page Views', 'Tempo Acumulado', 'Tempo Medio']],
        body: userRankings.map((u, idx) => [
          `#${idx + 1}`,
          u.display_name,
          u.setor,
          String(u.views),
          `${parseFloat((u.totalDuration / 60).toFixed(1))} min`,
          `${u.views > 0 ? Math.round(u.totalDuration / u.views) : 0}s`
        ]),
        theme: 'striped',
        headStyles: { fillColor: [99, 102, 241], fontSize: 9, fontStyle: 'bold' },
        bodyStyles: { fontSize: 8 }
      })

    } else if (reportType === 'tela') {
      doc.setFontSize(12)
      doc.text('Engajamento e Tempo Gasto por Tela', 14, 38)

      autoTable(doc, {
        startY: 42,
        head: [['Pos.', 'Pagina / Tela', 'Total Acessos', 'Tempo Acumulado', 'Tempo Medio']],
        body: pageRankings.map((p, idx) => [
          `#${idx + 1}`,
          p.name,
          String(p.views),
          `${parseFloat((p.totalDuration / 60).toFixed(1))} min`,
          `${p.views > 0 ? Math.round(p.totalDuration / p.views) : 0}s`
        ]),
        theme: 'striped',
        headStyles: { fillColor: [99, 102, 241], fontSize: 9, fontStyle: 'bold' },
        bodyStyles: { fontSize: 8 }
      })

    } else if (reportType === 'usuario_tela') {
      doc.setFontSize(12)
      doc.text('Detalhamento de Uso por Usuario e Tela', 14, 38)

      const stats: Record<string, { user: string; setor: string; page: string; views: number; totalDuration: number }> = {}
      logs.forEach(l => {
        const pageName = l.page_friendly || l.page || 'Desconhecido'
        const key = `${l.user_id}_${pageName}`
        if (!stats[key]) {
          stats[key] = {
            user: l.display_name,
            setor: l.setor || 'GERAL',
            page: pageName,
            views: 0,
            totalDuration: 0
          }
        }
        stats[key].views += 1
        stats[key].totalDuration += l.duration_seconds || 0
      })

      const sortedData = Object.values(stats).sort((a, b) => b.totalDuration - a.totalDuration)

      autoTable(doc, {
        startY: 42,
        head: [['Colaborador', 'Setor', 'Pagina / Tela', 'Acessos', 'Tempo Total', 'Tempo Medio']],
        body: sortedData.map(item => [
          item.user,
          item.setor,
          item.page,
          String(item.views),
          `${parseFloat((item.totalDuration / 60).toFixed(1))}m`,
          `${item.views > 0 ? Math.round(item.totalDuration / item.views) : 0}s`
        ]),
        theme: 'striped',
        headStyles: { fillColor: [99, 102, 241], fontSize: 9, fontStyle: 'bold' },
        bodyStyles: { fontSize: 8 }
      })
    }

    doc.save(`relatorio_telemetria_${reportType}_${timeRange}d_${new Date().toISOString().split('T')[0]}.pdf`)
    toast.success('Relatório PDF gerado e baixado com sucesso!')
    setShowReportModal(false)
  }

  // Handler geral para o botão de geração de relatório
  const handleGenerateReport = () => {
    if (logs.length === 0) {
      toast.warning('Nenhum log disponível no período para gerar relatório.')
      return
    }

    if (reportFormat === 'xlsx') {
      generateExcelReport()
    } else {
      generatePdfReport()
    }
  }

  return (
    <div className="space-y-6">
      
      {/* Filters and Controls */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 bg-zinc-50 dark:bg-zinc-900/40 p-4 border border-zinc-200 dark:border-zinc-800 rounded-2xl">
        <div className="flex items-center gap-2">
          <Calendar className="w-4 h-4 text-zinc-500" />
          <span className="text-xs font-bold text-zinc-500 uppercase flex items-center gap-1.5">
            Período de Análise:
            {loading && <RefreshCw className="w-3 h-3 text-brand-accent animate-spin" />}
          </span>
          <div className="flex bg-white dark:bg-zinc-950 p-1 border border-zinc-200 dark:border-zinc-850 rounded-xl gap-1">
            {[7, 30, 90].map((days) => (
              <button
                key={days}
                onClick={() => setTimeRange(days as any)}
                className={`px-3 py-1 text-[10px] font-black uppercase rounded-lg transition-all ${
                  timeRange === days
                    ? 'bg-brand-accent text-white shadow-sm'
                    : 'text-zinc-500 hover:text-zinc-950 dark:hover:text-white'
                }`}
              >
                {days} Dias
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button
            onClick={() => setShowReportModal(true)}
            className="h-8 gap-2 text-[10px] font-black uppercase bg-brand-accent hover:opacity-90 text-white shadow shadow-brand-accent/10 cursor-pointer"
          >
            <FileDown className="w-3.5 h-3.5" />
            Gerar Relatório Completo
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={handleExportCSV}
            className="h-8 gap-2 text-[10px] font-black uppercase border-zinc-200 dark:border-zinc-800 cursor-pointer"
          >
            <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
            Exportar CSV
          </Button>
        </div>
      </div>

      {/* General Metrics Row */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        
        <Card className="bg-white dark:bg-zinc-950 border-zinc-200 dark:border-zinc-900">
          <CardContent className="pt-4 flex flex-col justify-between h-24">
            <p className="text-[9px] font-black text-zinc-400 dark:text-zinc-500 uppercase tracking-widest">Total Page Views</p>
            <h3 className="text-2xl font-extrabold font-mono text-zinc-900 dark:text-white mt-1">
              {totalPageViews}
            </h3>
            <Badge variant="outline" className="w-fit text-[8px] bg-indigo-50 dark:bg-indigo-950/20 text-indigo-600 dark:text-indigo-400 border-none px-1.5 py-0 font-bold uppercase">
              Acessos Totais
            </Badge>
          </CardContent>
        </Card>

        <Card className="bg-white dark:bg-zinc-950 border-zinc-200 dark:border-zinc-900">
          <CardContent className="pt-4 flex flex-col justify-between h-24">
            <p className="text-[9px] font-black text-zinc-400 dark:text-zinc-500 uppercase tracking-widest">Usuários Ativos</p>
            <h3 className="text-2xl font-extrabold font-mono text-zinc-900 dark:text-white mt-1">
              {uniqueUsers}
            </h3>
            <Badge variant="outline" className="w-fit text-[8px] bg-emerald-50 dark:bg-emerald-950/20 text-emerald-600 dark:text-emerald-400 border-none px-1.5 py-0 font-bold uppercase">
              Colaboradores
            </Badge>
          </CardContent>
        </Card>

        <Card className="bg-white dark:bg-zinc-950 border-zinc-200 dark:border-zinc-900">
          <CardContent className="pt-4 flex flex-col justify-between h-24">
            <p className="text-[9px] font-black text-zinc-400 dark:text-zinc-500 uppercase tracking-widest">Página Campeã</p>
            <h3 className="text-xs font-bold text-zinc-900 dark:text-white mt-1 truncate uppercase" title={mostActivePage}>
              {mostActivePage}
            </h3>
            <Badge variant="outline" className="w-fit text-[8px] bg-violet-50 dark:bg-violet-950/20 text-violet-600 dark:text-violet-400 border-none px-1.5 py-0 font-bold uppercase">
              Mais Acessada
            </Badge>
          </CardContent>
        </Card>

        <Card className="bg-white dark:bg-zinc-950 border-zinc-200 dark:border-zinc-900">
          <CardContent className="pt-4 flex flex-col justify-between h-24">
            <p className="text-[9px] font-black text-zinc-400 dark:text-zinc-500 uppercase tracking-widest">Horário de Pico</p>
            <h3 className="text-2xl font-extrabold font-mono text-zinc-900 dark:text-white mt-1">
              {peakHour !== '-1' ? `${peakHour}:00` : '—'}
            </h3>
            <Badge variant="outline" className="w-fit text-[8px] bg-amber-50 dark:bg-amber-950/20 text-amber-600 dark:text-amber-400 border-none px-1.5 py-0 font-bold uppercase">
              Maior Tráfego
            </Badge>
          </CardContent>
        </Card>

        <Card className="bg-white dark:bg-zinc-950 border-zinc-200 dark:border-zinc-900">
          <CardContent className="pt-4 flex flex-col justify-between h-24">
            <p className="text-[9px] font-black text-zinc-400 dark:text-zinc-500 uppercase tracking-widest">Setor Mais Ativo</p>
            <h3 className="text-sm font-bold text-zinc-900 dark:text-white mt-1 truncate uppercase">
              {mostActiveSector}
            </h3>
            <Badge variant="outline" className="w-fit text-[8px] bg-rose-50 dark:bg-rose-950/20 text-rose-600 dark:text-rose-400 border-none px-1.5 py-0 font-bold uppercase">
              Líder de Uso
            </Badge>
          </CardContent>
        </Card>

      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Main accesses chart */}
        <Card className="lg:col-span-2 bg-white dark:bg-zinc-950 border-zinc-200 dark:border-zinc-900">
          <CardHeader>
            <CardTitle className="text-xs font-black uppercase tracking-widest text-zinc-400">Tráfego de Acessos por Dia</CardTitle>
            <CardDescription className="text-[10px]">Visão evolutiva de page views nas páginas do Nexus.</CardDescription>
          </CardHeader>
          <CardContent className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={timelineData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <XAxis dataKey="date" stroke="#888888" fontSize={9} tickLine={false} axisLine={false} />
                <YAxis stroke="#888888" fontSize={9} tickLine={false} axisLine={false} />
                <Tooltip 
                  contentStyle={{ backgroundColor: 'rgba(24, 24, 27, 0.95)', border: '1px solid #3f3f46', borderRadius: '8px' }}
                  labelStyle={{ fontSize: '10px', color: '#a1a1aa', fontWeight: 'bold' }}
                  itemStyle={{ fontSize: '11px', color: '#f4f4f5' }}
                />
                <Bar dataKey="views" name="Acessos" fill="#6366f1" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Device breakdown & hourly peaks */}
        <Card className="bg-white dark:bg-zinc-950 border-zinc-200 dark:border-zinc-900">
          <CardHeader>
            <CardTitle className="text-xs font-black uppercase tracking-widest text-zinc-400">Distribuição por Dispositivo</CardTitle>
            <CardDescription className="text-[10px]">De onde os colaboradores acessam o ERP.</CardDescription>
          </CardHeader>
          <CardContent className="h-64 flex flex-col justify-between">
            <div className="h-40">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={deviceData}
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={70}
                    paddingAngle={3}
                    dataKey="value"
                  >
                    {deviceData.map((_: any, index: number) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{ backgroundColor: 'rgba(24, 24, 27, 0.95)', border: '1px solid #3f3f46', borderRadius: '8px' }}
                    itemStyle={{ fontSize: '11px', color: '#f4f4f5' }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
            
            <div className="grid grid-cols-3 gap-2 text-center text-[10px] border-t border-zinc-100 dark:border-zinc-900 pt-3">
              {deviceData.map((d: any, i: number) => (
                <div key={d.name} className="flex flex-col items-center">
                  <div className="flex items-center gap-1">
                    <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: COLORS[i] }} />
                    <span className="font-extrabold text-zinc-800 dark:text-zinc-200 uppercase">{d.name}</span>
                  </div>
                  <span className="font-mono font-bold text-zinc-500 mt-0.5">{d.value}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

      </div>

      {/* Hourly profile and tables row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        
        {/* Hourly Distribution Profile */}
        <Card className="bg-white dark:bg-zinc-950 border-zinc-200 dark:border-zinc-900">
          <CardHeader>
            <CardTitle className="text-xs font-black uppercase tracking-widest text-zinc-400">Perfil de Acessos por Hora</CardTitle>
            <CardDescription className="text-[10px]">Fusos operacionais de pico na empresa.</CardDescription>
          </CardHeader>
          <CardContent className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={hourlyData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <XAxis dataKey="hour" stroke="#888888" fontSize={9} tickLine={false} axisLine={false} interval={2} />
                <YAxis stroke="#888888" fontSize={9} tickLine={false} axisLine={false} />
                <Tooltip 
                  contentStyle={{ backgroundColor: 'rgba(24, 24, 27, 0.95)', border: '1px solid #3f3f46', borderRadius: '8px' }}
                  labelStyle={{ fontSize: '10px', color: '#a1a1aa', fontWeight: 'bold' }}
                  itemStyle={{ fontSize: '11px', color: '#f4f4f5' }}
                />
                <Line type="monotone" dataKey="views" name="Acessos" stroke="#10b981" strokeWidth={3} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Page Rankings */}
        <Card className="bg-white dark:bg-zinc-950 border-zinc-200 dark:border-zinc-900">
          <CardHeader>
            <CardTitle className="text-xs font-black uppercase tracking-widest text-zinc-400">Top 5 Páginas Mais Acessadas</CardTitle>
            <CardDescription className="text-[10px]">Rankeamento por volume total de page views.</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y divide-zinc-100 dark:divide-zinc-900">
              {pageRankings.slice(0, 5).map((page: any, index: number) => (
                <div key={page.name} className="flex items-center justify-between p-3.5 text-xs">
                  <div className="flex items-center gap-3">
                    <span className="font-extrabold font-mono text-zinc-400 w-4 text-center">#{index + 1}</span>
                    <span className="font-bold text-zinc-800 dark:text-zinc-200 uppercase tracking-tight truncate max-w-[200px]" title={page.name}>{page.name}</span>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="text-right">
                      <span className="block font-mono font-black text-zinc-900 dark:text-white">{page.views}</span>
                      <span className="block text-[8px] font-semibold text-zinc-400 uppercase">Acessos</span>
                    </div>
                    <div className="text-right w-16">
                      <span className="block font-mono font-bold text-indigo-600 dark:text-indigo-400">
                        {page.views > 0 ? `${(page.totalDuration / page.views / 60).toFixed(1)}m` : '—'}
                      </span>
                      <span className="block text-[8px] font-semibold text-zinc-400 uppercase">Tempo Médio</span>
                    </div>
                  </div>
                </div>
              ))}
              {pageRankings.length === 0 && (
                <div className="p-8 text-center text-zinc-500 font-bold uppercase tracking-wider text-xs">
                  Nenhuma página registrada.
                </div>
              )}
            </div>
          </CardContent>
        </Card>

      </div>

      {/* User Rankings Panel */}
      <Card className="bg-white dark:bg-zinc-950 border-zinc-200 dark:border-zinc-900">
        <CardHeader>
          <CardTitle className="text-xs font-black uppercase tracking-widest text-zinc-400">Engajamento de Usuários (Top Tempo de Uso)</CardTitle>
          <CardDescription className="text-[10px]">Lista completa de colaboradores e tempo total acumulado em minutos.</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead className="bg-zinc-50 dark:bg-zinc-900/60 text-[9px] font-black uppercase text-zinc-400 tracking-wider">
                <tr>
                  <th className="p-4">Colaborador</th>
                  <th className="p-4">Setor</th>
                  <th className="p-4 text-right">Page Views</th>
                  <th className="p-4 text-right">Tempo Total</th>
                  <th className="p-4 text-right">Média por Página</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 dark:divide-zinc-900">
                {userRankings.map((userStats: any) => (
                  <tr key={userStats.display_name} className="hover:bg-zinc-50 dark:hover:bg-zinc-900/20">
                    <td className="p-4 font-bold text-zinc-900 dark:text-white uppercase">{userStats.display_name}</td>
                    <td className="p-4">
                      <Badge variant="outline" className="text-[9px] font-bold bg-zinc-100 dark:bg-zinc-900 text-zinc-600 dark:text-zinc-400 border-none px-2 py-0.5 uppercase">
                        {userStats.setor === 'VENDAS' ? 'VENDAS PÚBLICO' : userStats.setor}
                      </Badge>
                    </td>
                    <td className="p-4 text-right font-mono font-bold text-zinc-700 dark:text-zinc-300">{userStats.views}</td>
                    <td className="p-4 text-right font-mono font-black text-brand-accent">
                      {Math.round(userStats.totalDuration / 60)} min
                    </td>
                    <td className="p-4 text-right font-mono text-zinc-500">
                      {userStats.views > 0 ? `${Math.round(userStats.totalDuration / userStats.views)}s` : '—'}
                    </td>
                  </tr>
                ))}
                {userRankings.length === 0 && (
                  <tr>
                    <td colSpan={5} className="p-8 text-center text-zinc-500 font-bold uppercase tracking-wider">
                      Nenhum dado de uso capturado no período.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* 📊 ADVANCED REPORT GENERATOR MODAL */}
      {showReportModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <Card className="w-full max-w-md bg-white dark:bg-zinc-950 border-zinc-200 dark:border-zinc-900 text-zinc-900 dark:text-zinc-100 shadow-2xl overflow-hidden">
            <CardHeader className="bg-zinc-50 dark:bg-zinc-900/50 border-b border-zinc-200 dark:border-zinc-900 pb-4">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-black text-brand-accent flex items-center gap-2 tracking-wider uppercase">
                  <FileText className="w-5 h-5 shrink-0 text-brand-accent" />
                  Gerador de Relatórios
                </CardTitle>
                <button 
                  onClick={() => setShowReportModal(false)}
                  className="text-zinc-400 hover:text-zinc-650 dark:hover:text-white transition-colors p-1 cursor-pointer"
                >
                  <X size={18} />
                </button>
              </div>
              <CardDescription className="text-zinc-450 dark:text-zinc-500 text-[10px] mt-1 leading-relaxed">
                Configure os filtros abaixo para gerar um relatório analítico sob medida para a sua tomada de decisões.
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-5 pb-6 space-y-4 text-xs">
              {/* Tipo de Relatório */}
              <div className="space-y-1.5">
                <label className="text-[10px] font-black text-zinc-400 dark:text-zinc-500 uppercase tracking-widest">Tipo de Relatório</label>
                <select
                  value={reportType}
                  onChange={e => setReportType(e.target.value as any)}
                  className="w-full h-10 bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-brand-accent rounded-lg px-3 text-xs outline-none focus:border-brand-accent transition-colors cursor-pointer font-semibold"
                >
                  <option value="consolidado">Consolidado (Métricas, Telas & Usuários)</option>
                  <option value="usuario">Por Usuário (Acessos & Tempo Acumulado)</option>
                  <option value="tela">Por Tela / Página (Visualizações & Tempo Médio)</option>
                  <option value="usuario_tela">Por Usuário e Tela (Detalhamento Cruzado)</option>
                </select>
              </div>

              {/* Formato de Exportação */}
              <div className="space-y-1.5">
                <label className="text-[10px] font-black text-zinc-400 dark:text-zinc-500 uppercase tracking-widest">Formato do Arquivo</label>
                <div className="grid grid-cols-2 gap-3">
                  {[
                    { format: 'xlsx', label: 'Planilha Excel (.xlsx)', icon: FileSpreadsheet, color: 'text-emerald-500' },
                    { format: 'pdf', label: 'Documento PDF (.pdf)', icon: FileText, color: 'text-red-500' }
                  ].map(opt => {
                    const Icon = opt.icon
                    const isSelected = reportFormat === opt.format
                    return (
                      <div
                        key={opt.format}
                        onClick={() => setReportFormat(opt.format as any)}
                        className={`flex items-center gap-2 p-3 rounded-lg border cursor-pointer transition-all ${
                          isSelected
                            ? 'bg-zinc-50 dark:bg-zinc-900 border-brand-accent text-brand-accent font-bold shadow-sm'
                            : 'bg-zinc-50 dark:bg-zinc-900/50 border-zinc-200 dark:border-zinc-800 text-zinc-555 hover:border-zinc-350 dark:hover:border-zinc-700'
                        }`}
                      >
                        <Icon className={`w-4 h-4 ${opt.color}`} />
                        <span className="text-[11px]">{opt.label}</span>
                      </div>
                    )
                  })}
                </div>
              </div>

              {/* Action Button */}
              <button
                type="button"
                onClick={handleGenerateReport}
                className="w-full h-11 bg-brand-accent hover:opacity-90 text-white font-black text-xs uppercase tracking-widest rounded-xl shadow-lg shadow-brand-accent/10 active:scale-98 transition-all flex items-center justify-center gap-2 mt-4 cursor-pointer"
              >
                <FileDown className="w-4 h-4 shrink-0" />
                Gerar e Baixar Relatório
              </button>
            </CardContent>
          </Card>
        </div>
      )}

    </div>
  )
}
