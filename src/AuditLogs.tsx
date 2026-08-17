import { useEffect, useState, useCallback, useRef } from 'react'
import { supabase } from './lib/supabase'
import { useAuth } from './AuthContext'
import { toast } from 'sonner'
import type { Json } from './supabaseTypes'
import { 
  History, 
  RotateCw, 
  FileJson, 
  User as UserIcon, 
  Database as DatabaseIcon,
  Loader2,
  Search,
  Printer,
  Calendar,
  Filter
} from 'lucide-react'

// Shadcn UI
import { Card, CardHeader, CardTitle, CardContent } from './components/ui/card'
import { Button } from './components/ui/button'
import { Input } from './components/ui/input'
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from './components/ui/table'
import { Badge } from './components/ui/badge'
import { 
    Select, 
    SelectContent, 
    SelectItem, 
    SelectTrigger, 
    SelectValue 
} from './components/ui/select'
import { 
    Dialog, 
    DialogContent, 
    DialogHeader, 
    DialogTitle, 
    DialogDescription 
} from './components/ui/dialog'

interface Log {
    id: number
    created_at: string
    user_email: string
    action: string
    table_name: string
    record_id: string
    details: Json
    user_id?: string
    user_name?: string
}

const ACTION_COLORS: Record<string, string> = {
    CREATE: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400',
    UPDATE: 'bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-400',
    DELETE: 'bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-400',
    EXPORT: 'bg-orange-100 text-orange-700 dark:bg-orange-950/40 dark:text-orange-400',
    LOGIN: 'bg-purple-100 text-purple-700 dark:bg-purple-950/40 dark:text-purple-400',
    VISUALIZACAO: 'bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-400',
    BAIXA_NF: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-200',
    BAIXA_DAV: 'bg-teal-100 text-teal-800 dark:bg-teal-950/60 dark:text-teal-300 border border-teal-200',
    EXCLUIR_EMPENHO: 'bg-red-100 text-red-800 dark:bg-red-950/60 dark:text-red-300 border border-red-200',
    MARCACAO_COMPRAS: 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300 border border-amber-200',
    EXCLUIR_ATA: 'bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-400',
    CADASTRAR_ADITIVO: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-950/60 dark:text-indigo-300',
}

export function renderFriendlyDetails(log: Log) {
    const details = log.details as any
    if (!details) return 'Sem detalhes disponíveis.'
    
    try {
        if (log.action === 'ALTERAR_STATUS_SOLICITACAO') {
            const pedidoId = details.pedido_id || log.record_id
            const desc = details.item_descricao ? ` (${details.item_descricao})` : ''
            return `Status da Solicitação #${pedidoId}${desc} alterado de "${details.status_anterior || '—'}" para "${details.novo_status}"`
        }

        if (log.action === 'REGISTRAR_COMPRA_PEDIDO') {
            const pedidoId = details.pedido_id || log.record_id
            const desc = details.item_descricao ? ` (${details.item_descricao})` : ''
            const precoStr = details.preco ? ` R$ ${Number(details.preco).toFixed(2)}` : ''
            const marcaStr = details.marca ? ` [Marca: ${details.marca}]` : ''
            return `Compra registrada na Solicitação #${pedidoId}${desc}: ${details.qtd_comprada} un${precoStr}${marcaStr}`
        }

        if (log.action === 'ALTERAR_STATUS_EM_MASSA') {
            return `Status de ${details.quantidade_pedidos || 0} solicitações alterado em massa para "${details.novo_status}"`
        }

        if (log.action === 'ATRIBUIR_COMPRADOR') {
            const pedidoId = details.pedido_id || log.record_id
            return `Solicitação #${pedidoId} atribuída ao comprador: ${details.comprador_nome || details.novo_comprador_id}`
        }

        if (log.action === 'JUSTIFICAR_FALHA_COMPRA') {
            const pedidoId = details.pedido_id || log.record_id
            return `Solicitação #${pedidoId} marcada como Falha/Cotação: "${details.justificativa}"`
        }

        if (log.action === 'ENVIAR_CORRECAO_QUARENTENA') {
            const pedidoId = details.pedido_id || log.record_id
            return `Solicitação #${pedidoId} enviada para Quarentena/Correção: "${details.motivo}"`
        }

        if (log.action === 'CONVERTER_PEDIDO_EM_NF') {
            return `Baixa provisória do Pedido convertida e oficializada na NF ${details.numero_nf_oficial}`
        }

        if (log.action === 'VINCULAR_NF_EXISTENTE_ATA') {
            return `Nota Fiscal ${details.numero_nf} existente no sistema vinculada à Ata #${log.record_id}`
        }

        if (log.action === 'EXCLUSAO_SOLICITACAO_PENDENTE') {
            const pedidoId = details.pedido_id || log.record_id
            const desc = details.item_descricao ? ` (${details.item_descricao})` : ''
            const just = details.justificativa ? `: "${details.justificativa}"` : ''
            return `Exclusão da Solicitação #${pedidoId}${desc}${just}`
        }

        if (log.action === 'CORRECAO_PEDIDO' || log.table_name === 'pedidos_compra') {
            const pedidoId = details.pedido_id || log.record_id
            const alt = details.alteracoes || {}
            const changes: string[] = []
            
            if (alt.quantidade_solicitada && alt.quantidade_solicitada.de !== alt.quantidade_solicitada.para) {
                changes.push(`Qtd: ${alt.quantidade_solicitada.de} → ${alt.quantidade_solicitada.para}`)
            }
            if (alt.categoria && alt.categoria.de !== alt.categoria.para) {
                changes.push(`Categoria: ${alt.categoria.de} → ${alt.categoria.para}`)
            }
            if (alt.prazo_limite && alt.prazo_limite.de !== alt.prazo_limite.para) {
                const deDate = alt.prazo_limite.de ? new Date(alt.prazo_limite.de).toLocaleDateString('pt-BR') : 'sem prazo'
                const paraDate = alt.prazo_limite.para ? new Date(alt.prazo_limite.para).toLocaleDateString('pt-BR') : 'sem prazo'
                changes.push(`Prazo: ${deDate} → ${paraDate}`)
            }
            if (alt.observacoes && alt.observacoes.de !== alt.observacoes.para) {
                changes.push(`Obs alterada`)
            }
            
            const changesText = changes.length > 0 ? ` [${changes.join(', ')}]` : ''
            return `Correção no Pedido #${pedidoId}: "${details.justificativa}"${changesText}`
        }

        if (log.table_name === 'notas') {
            const ne = details.numero_ne || details.numero_empenho || log.record_id
            const emissor = details.emissor ? ` - ${details.emissor}` : ''
            if (log.action === 'DELETE') {
                return `Empenho NE ${ne}${emissor} excluído.`
            }
            return `Empenho NE ${ne}${emissor}`
        }
        
        if (log.table_name === 'historico_entregas') {
            const ne = details.numero_ne ? `NE ${details.numero_ne}` : `Empenho #${details.empenho_id || log.record_id}`
            const doc = details.numero_pedido || details.numero_dav || details.numero_nf
            const isProvisoria = details.provisoria || log.action === 'BAIXA_DAV' || String(doc || '').includes('PEDIDO')
            const docLabel = isProvisoria ? 'Pedido Provisório' : (details.numero_nf ? 'NF' : 'Doc')
            if (log.action === 'REVERTER_BAIXA_NF' || log.action === 'REVERTER_BAIXA_DAV') {
                return `Reversão de baixa do ${ne}. ${docLabel}: ${doc || '(sem número)'}`
            }
            return `Baixa no ${ne}. ${docLabel}: ${doc || '(sem número)'}`
        }
        
        if (log.table_name === 'atas') {
            const arp = details.numero_arp || log.record_id
            const orgao = details.entidade_gerenciadora ? ` - ${details.entidade_gerenciadora}` : ''
            return `Ata ARP: ${arp}${orgao}`
        }

        if (log.table_name === 'profiles') {
            const email = details.target_email || details.email || log.record_id
            const role = details.role ? ` (${details.role})` : ''
            return `Perfil: ${email}${role}`
        }
        
        // Fallback: listar os primeiros atributos simples
        const keys = Object.keys(details).filter(k => typeof details[k] !== 'object' && details[k] !== null).slice(0, 3)
        if (keys.length > 0) {
            return keys.map(k => `${k}: ${details[k]}`).join(', ')
        }
    } catch (e) {
        // Ignora erros de parsing
    }
    
    return typeof details === 'string' ? details : JSON.stringify(details)
}

export function AuditLogs() {
    const { session } = useAuth()
    const [logs, setLogs] = useState<Log[]>([])
    const [loading, setLoading] = useState(false)
    const [selectedLog, setSelectedLog] = useState<Log | null>(null)
    const printRef = useRef<HTMLDivElement>(null)

    // Filtros
    const [filterUser, setFilterUser] = useState('')
    const [filterAction, setFilterAction] = useState('ALL')
    const [filterTable, setFilterTable] = useState('')
    const [startDate, setStartDate] = useState('')
    const [endDate, setEndDate] = useState('')

    const fetchLogs = useCallback(async () => {
        setLoading(true)
        try {
            let query = supabase
                .from('audit_logs')
                .select('*')
                .order('created_at', { ascending: false })
            
            if (filterUser) query = query.ilike('user_email', `%${filterUser}%`)
            if (filterAction !== 'ALL') query = query.eq('action', filterAction)
            if (filterTable) query = query.ilike('table_name', `%${filterTable}%`)
            if (startDate) query = query.gte('created_at', startDate)
            if (endDate) query = query.lte('created_at', `${endDate}T23:59:59`)

            const { data, error } = await query.limit(200)
            
            if (error) throw error
            if (data) {
                const results = data as any[]
                const userIds = [...new Set(results.map(log => log.user_id).filter(Boolean))]
                if (userIds.length > 0) {
                    const { data: profiles } = await supabase.from('profiles').select('id, nome, sobrenome').in('id', userIds)
                    const profileMap = (profiles || []).reduce((acc: Record<string, string>, p: any) => {
                        acc[p.id] = [p.nome, p.sobrenome].filter(Boolean).join(' ')
                        return acc
                    }, {})
                    const logsWithNames = results.map(log => ({
                        ...log,
                        user_name: profileMap[log.user_id] || ''
                    }))
                    setLogs(logsWithNames as unknown as Log[])
                } else {
                    setLogs(results as unknown as Log[])
                }
            }
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err)
            toast.error('Erro ao buscar logs: ' + message)
        } finally {
            setLoading(false)
        }
    }, [filterUser, filterAction, filterTable, startDate, endDate])

    useEffect(() => {
        if (session) fetchLogs()
    }, [session, fetchLogs])

    const handlePrint = () => {
        window.print()
    }

    return (
        <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 no-print">
                <div>
                    <h1 className="text-2xl font-bold text-zinc-900 dark:text-white flex items-center gap-2">
                        <History className="w-6 h-6 text-brand-accent" />
                        Trilha de Auditoria
                    </h1>
                    <p className="text-zinc-500 text-sm">Monitoramento global de atividades e alterações de dados.</p>
                </div>
                <div className="flex items-center gap-2">
                    <Button 
                        variant="outline" 
                        size="sm" 
                        onClick={handlePrint}
                        className="gap-2"
                    >
                        <Printer className="w-4 h-4" />
                        Imprimir Relatório
                    </Button>
                    <Button 
                        variant="default" 
                        size="sm" 
                        onClick={fetchLogs} 
                        disabled={loading}
                        className="gap-2 bg-brand-accent"
                    >
                        <RotateCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                        Atualizar
                    </Button>
                </div>
            </div>

            {/* Filtros */}
            <Card className="border-zinc-200 dark:border-zinc-800 shadow-sm no-print">
                <CardHeader className="py-3 px-4 border-b">
                    <CardTitle className="text-xs font-bold uppercase flex items-center gap-2 text-zinc-500">
                        <Filter className="w-3 h-3" /> Filtros de Pesquisa
                    </CardTitle>
                </CardHeader>
                <CardContent className="p-4 grid grid-cols-1 md:grid-cols-5 gap-4">
                    <div className="space-y-1.5">
                        <label className="text-[10px] font-bold uppercase text-zinc-400">Usuário</label>
                        <div className="relative">
                            <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-zinc-400" />
                            <Input 
                                placeholder="E-mail ou nome..." 
                                value={filterUser}
                                onChange={e => setFilterUser(e.target.value)}
                                className="pl-8 h-9 text-xs"
                            />
                        </div>
                    </div>
                    <div className="space-y-1.5">
                        <label className="text-[10px] font-bold uppercase text-zinc-400">Ação</label>
                        <Select value={filterAction} onValueChange={setFilterAction}>
                            <SelectTrigger className="h-9 text-xs">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="ALL">Todas as Ações</SelectItem>
                                <SelectItem value="BAIXA_NF">📄 Baixa por NF</SelectItem>
                                <SelectItem value="BAIXA_DAV">📋 Baixa por Pedido (Provisória)</SelectItem>
                                <SelectItem value="MARCACAO_COMPRAS">🛒 Marcação Compras</SelectItem>
                                <SelectItem value="EXCLUIR_EMPENHO">🗑️ Exclusão Empenho</SelectItem>
                                <SelectItem value="EXCLUIR_ATA">🗑️ Exclusão ATA</SelectItem>
                                <SelectItem value="CREATE">➕ Criação (Sistema)</SelectItem>
                                <SelectItem value="UPDATE">✏️ Edição (Sistema)</SelectItem>
                                <SelectItem value="DELETE">❌ Exclusão (Sistema)</SelectItem>
                                <SelectItem value="EXPORT">📤 Exportação</SelectItem>
                                <SelectItem value="LOGIN">🔐 Acesso (Login)</SelectItem>
                                <SelectItem value="CADASTRAR_ADITIVO">📝 Aditivo Contrato</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="space-y-1.5">
                        <label className="text-[10px] font-bold uppercase text-zinc-400">Tabela/Módulo</label>
                        <Input 
                            placeholder="ex: notas, itens..." 
                            value={filterTable}
                            onChange={e => setFilterTable(e.target.value)}
                            className="h-9 text-xs"
                        />
                    </div>
                    <div className="space-y-1.5">
                        <label className="text-[10px] font-bold uppercase text-zinc-400">Início</label>
                        <Input 
                            type="date" 
                            value={startDate}
                            onChange={e => setStartDate(e.target.value)}
                            className="h-9 text-xs"
                        />
                    </div>
                    <div className="space-y-1.5">
                        <label className="text-[10px] font-bold uppercase text-zinc-400">Fim</label>
                        <Input 
                            type="date" 
                            value={endDate}
                            onChange={e => setEndDate(e.target.value)}
                            className="h-9 text-xs"
                        />
                    </div>
                </CardContent>
            </Card>

            <Card className="border-zinc-200 dark:border-zinc-800 shadow-sm overflow-hidden" ref={printRef}>
                <div className="overflow-x-auto">
                    <Table>
                        <TableHeader className="bg-zinc-50 dark:bg-zinc-900/60 font-semibold">
                            <TableRow className="border-zinc-200 dark:border-zinc-800">
                                <TableHead className="w-[180px]"><div className="flex items-center gap-1.5"><Calendar className="w-3.5 h-3.5" /> DATA/HORA</div></TableHead>
                                <TableHead><div className="flex items-center gap-1.5"><UserIcon className="w-3.5 h-3.5" /> NOME</div></TableHead>
                                <TableHead>LOGIN</TableHead>
                                <TableHead>AÇÃO</TableHead>
                                <TableHead><div className="flex items-center gap-1.5"><DatabaseIcon className="w-3.5 h-3.5" /> OBJETO</div></TableHead>
                                <TableHead className="no-print"><div className="flex items-center gap-1.5"><FileJson className="w-3.5 h-3.5" /> DETALHES</div></TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {loading ? (
                                <TableRow>
                                    <TableCell colSpan={6} className="h-32 text-center text-zinc-500">
                                        <div className="flex flex-col items-center gap-2">
                                            <Loader2 className="w-6 h-6 animate-spin text-brand-accent" />
                                            <span>Processando trilha...</span>
                                        </div>
                                    </TableCell>
                                </TableRow>
                            ) : logs.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={6} className="h-32 text-center text-zinc-500 font-medium">
                                        Nenhum registro encontrado para os filtros aplicados.
                                    </TableCell>
                                </TableRow>
                            ) : (
                                logs.map(log => (
                                    <TableRow key={log.id} className="border-zinc-100 dark:border-zinc-800/50 hover:bg-zinc-50/50 dark:hover:bg-zinc-900/50 transition-colors">
                                        <TableCell className="text-[11px] font-medium tabular-nums text-zinc-600 dark:text-zinc-400">
                                            {new Date(log.created_at).toLocaleString('pt-BR')}
                                        </TableCell>
                                        <TableCell className="max-w-[150px] truncate">
                                            <div className="text-xs font-bold text-zinc-800 dark:text-zinc-200">{log.user_name || 'Desconhecido'}</div>
                                        </TableCell>
                                        <TableCell className="max-w-[150px] truncate">
                                            <div className="text-[10px] text-zinc-500 truncate">{log.user_email}</div>
                                        </TableCell>
                                        <TableCell>
                                            <Badge className={`text-[9px] font-black uppercase tracking-tight py-0 h-5 shadow-none ${ACTION_COLORS[log.action] || 'bg-zinc-100 text-zinc-600'}`}>
                                                {log.action}
                                            </Badge>
                                        </TableCell>
                                        <TableCell className="text-[11px]">
                                            <span className="font-bold text-brand-accent opacity-70">{log.table_name}</span>
                                            <span className="ml-1 text-zinc-400 font-mono">#{log.record_id}</span>
                                        </TableCell>
                                        <TableCell className="no-print">
                                            <div className="flex items-center gap-2 max-w-[320px]">
                                                <span 
                                                    className="text-xs text-zinc-600 dark:text-zinc-300 truncate cursor-pointer hover:text-brand-accent transition-colors font-medium" 
                                                    title="Clique para visualizar os detalhes completos"
                                                    onClick={() => setSelectedLog(log)}
                                                >
                                                    {renderFriendlyDetails(log)}
                                                </span>
                                                <Button 
                                                    variant="ghost" 
                                                    size="icon" 
                                                    className="h-6 w-6 shrink-0 text-zinc-400 hover:text-brand-accent hover:bg-zinc-100 dark:hover:bg-zinc-800"
                                                    onClick={() => setSelectedLog(log)}
                                                    title="Visualizar JSON completo"
                                                >
                                                    <FileJson className="w-3.5 h-3.5" />
                                                </Button>
                                            </div>
                                        </TableCell>
                                    </TableRow>
                                ))
                            )}
                        </TableBody>
                    </Table>
                </div>
            </Card>

            <style dangerouslySetInnerHTML={{ __html: `
                @media print {
                    .no-print { display: none !important; }
                    body { background: white !important; }
                    .Card { border: none !important; box-shadow: none !important; }
                    table { font-size: 10pt !important; width: 100% !important; border-collapse: collapse !important; }
                    th, td { border: 1px solid #eee !important; padding: 6pt !important; text-align: left !important; }
                    h1 { font-size: 18pt !important; margin-bottom: 20pt !important; }
                }
            `}} />

            {/* Modal de visualização completa do log em JSON */}
            <Dialog open={!!selectedLog} onOpenChange={(open) => !open && setSelectedLog(null)}>
                <DialogContent className="sm:max-w-xl max-h-[85vh] flex flex-col bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 shadow-xl rounded-xl">
                    <DialogHeader className="border-b pb-3 border-zinc-100 dark:border-zinc-800">
                        <DialogTitle className="text-base font-bold flex items-center gap-2 text-zinc-900 dark:text-white">
                            <FileJson className="w-5 h-5 text-brand-accent" />
                            Detalhes da Operação #{selectedLog?.id}
                        </DialogTitle>
                        <DialogDescription className="text-xs text-zinc-500">
                            Registro de auditoria na tabela <strong className="text-brand-accent">{selectedLog?.table_name}</strong> por <strong>{selectedLog?.user_name || selectedLog?.user_email || 'Sistema'}</strong>
                        </DialogDescription>
                    </DialogHeader>
                    
                    <div className="flex-1 overflow-y-auto mt-4 space-y-4 pr-1">
                        <div className="grid grid-cols-2 gap-3 text-[11px]">
                            <div className="bg-zinc-50 dark:bg-zinc-900/50 p-2.5 rounded-lg border border-zinc-100 dark:border-zinc-800/50">
                                <span className="text-[9px] uppercase font-black tracking-wider text-zinc-400 block mb-1">Data/Hora</span>
                                <span className="font-semibold text-zinc-700 dark:text-zinc-300">
                                    {selectedLog ? new Date(selectedLog.created_at).toLocaleString('pt-BR') : ''}
                                </span>
                            </div>
                            <div className="bg-zinc-50 dark:bg-zinc-900/50 p-2.5 rounded-lg border border-zinc-100 dark:border-zinc-800/50">
                                <span className="text-[9px] uppercase font-black tracking-wider text-zinc-400 block mb-1">Ação</span>
                                <span className="font-bold text-brand-accent">
                                    {selectedLog?.action}
                                </span>
                            </div>
                            <div className="bg-zinc-50 dark:bg-zinc-900/50 p-2.5 rounded-lg border border-zinc-100 dark:border-zinc-800/50">
                                <span className="text-[9px] uppercase font-black tracking-wider text-zinc-400 block mb-1">Objeto Afetado</span>
                                <span className="font-semibold text-zinc-700 dark:text-zinc-300">
                                    {selectedLog?.table_name} #{selectedLog?.record_id}
                                </span>
                            </div>
                            <div className="bg-zinc-50 dark:bg-zinc-900/50 p-2.5 rounded-lg border border-zinc-100 dark:border-zinc-800/50">
                                <span className="text-[9px] uppercase font-black tracking-wider text-zinc-400 block mb-1">Usuário Autor</span>
                                <span className="font-semibold text-zinc-700 dark:text-zinc-300 truncate block" title={selectedLog?.user_email || ''}>
                                    {selectedLog?.user_name || selectedLog?.user_email || 'Desconhecido'}
                                </span>
                            </div>
                        </div>
                        
                        <div className="space-y-1.5">
                            <span className="text-[10px] uppercase font-black tracking-wider text-zinc-400">Resumo da Operação</span>
                            <div className="text-xs p-3 bg-zinc-50 dark:bg-zinc-900/50 border border-zinc-100 dark:border-zinc-800/50 rounded-lg text-zinc-700 dark:text-zinc-300 font-medium">
                                {selectedLog && renderFriendlyDetails(selectedLog)}
                            </div>
                        </div>

                        {selectedLog?.action === 'EXCLUSAO_SOLICITACAO_PENDENTE' && (selectedLog.details as any)?.justificativa && (
                            <div className="space-y-1.5 animate-in fade-in slide-in-from-top-1 duration-200">
                                <span className="text-[10px] uppercase font-black tracking-wider text-red-500 font-bold">Justificativa da Exclusão</span>
                                <div className="bg-red-50 dark:bg-red-950/20 p-3 rounded-lg border border-red-200/50 dark:border-red-900/40 text-xs text-red-900 dark:text-red-200 font-medium leading-relaxed">
                                    "{(selectedLog.details as any).justificativa}"
                                </div>
                            </div>
                        )}

                        {selectedLog?.action === 'CORRECAO_PEDIDO' && (selectedLog.details as any)?.alteracoes && (
                            <div className="space-y-1.5 animate-in fade-in slide-in-from-top-1 duration-200">
                                <span className="text-[10px] uppercase font-black tracking-wider text-zinc-400">Modificações Detalhadas</span>
                                <div className="bg-zinc-50 dark:bg-zinc-900/50 p-3 rounded-lg border border-zinc-100 dark:border-zinc-800 text-xs space-y-2">
                                    {(() => {
                                        const alt = (selectedLog.details as any).alteracoes
                                        return Object.keys(alt).map((field) => {
                                            const change = alt[field]
                                            if (!change || change.de === change.para) return null
                                            
                                            // Format field name and values
                                            let fieldName = field
                                            let deVal = String(change.de || '—')
                                            let paraVal = String(change.para || '—')
                                            
                                            if (field === 'quantidade_solicitada') {
                                                fieldName = 'Quantidade Solicitada'
                                            } else if (field === 'categoria') {
                                                fieldName = 'Categoria'
                                            } else if (field === 'prazo_limite') {
                                                fieldName = 'Prazo Limite'
                                                deVal = change.de ? new Date(change.de).toLocaleDateString('pt-BR') : '—'
                                                paraVal = change.para ? new Date(change.para).toLocaleDateString('pt-BR') : '—'
                                            } else if (field === 'observacoes') {
                                                fieldName = 'Observações'
                                            }
                                            
                                            return (
                                                <div key={field} className="flex flex-col gap-0.5 border-b border-zinc-100 dark:border-zinc-800/50 pb-1.5 last:border-none last:pb-0 text-[11px]">
                                                    <span className="font-bold text-[9px] text-zinc-400 dark:text-zinc-500 uppercase tracking-wider">{fieldName}</span>
                                                    <div className="flex items-center gap-2 mt-0.5">
                                                        <span className="line-through text-red-600 bg-red-50 dark:bg-red-950/30 px-1.5 py-0.5 rounded font-mono text-[10px]">{deVal}</span>
                                                        <span className="text-zinc-400">&rarr;</span>
                                                        <span className="text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/30 px-1.5 py-0.5 rounded font-mono text-[10px] font-semibold">{paraVal}</span>
                                                    </div>
                                                </div>
                                            )
                                        })
                                    })()}
                                </div>
                            </div>
                        )}

                        <div className="space-y-1.5 flex flex-col flex-1 min-h-[200px]">
                            <span className="text-[10px] uppercase font-black tracking-wider text-zinc-400">Conteúdo Completo (JSON)</span>
                            <pre className="text-[11px] font-mono bg-zinc-950 text-zinc-100 p-4 rounded-lg overflow-auto leading-relaxed border border-zinc-800 shadow-inner flex-1 max-h-[250px]">
                                {selectedLog ? JSON.stringify(selectedLog.details, null, 2) : ''}
                            </pre>
                        </div>
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    )
}
