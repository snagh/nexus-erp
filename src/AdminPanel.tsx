import { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from './lib/supabase'
import { logOperation } from './lib/supabaseHelpers'
import { useAuth } from './AuthContext'
import { toast } from 'sonner'
import type { UserProfile } from './AuthContext'
import { 
  ShieldAlert, 
  RotateCw, 
  Pencil,
  ArrowUpCircle,
  ArrowDownCircle,
  Loader2,
  Users,
  History,
  Building2,
  MapPin,
  Trash2 as TrashIcon,
  UserX,
  Search,
  XCircle,
  Printer,
  FileText,
  Package,
  AlertTriangle,
  CheckCircle2,
  Mail
} from 'lucide-react'

// Shadcn UI
import { Card } from './components/ui/card'
import { Button } from './components/ui/button'
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
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "./components/ui/dialog"
import { Input } from "./components/ui/input"
import { Label } from "./components/ui/label"
import { TabsContent, TabsList, TabsTrigger } from './components/ui/tabs'
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from './components/ui/select'
import type { Tables } from './supabaseTypes'

const BR_STATES = ['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO']
const REGIOES_POR_UF: Record<string, string> = {
  AC:'Norte',AM:'Norte',AP:'Norte',PA:'Norte',RO:'Norte',RR:'Norte',TO:'Norte',
  AL:'Nordeste',BA:'Nordeste',CE:'Nordeste',MA:'Nordeste',PB:'Nordeste',PE:'Nordeste',PI:'Nordeste',RN:'Nordeste',SE:'Nordeste',
  DF:'Centro-Oeste',GO:'Centro-Oeste',MS:'Centro-Oeste',MT:'Centro-Oeste',
  ES:'Sudeste',MG:'Sudeste',RJ:'Sudeste',SP:'Sudeste',
  PR:'Sul',RS:'Sul',SC:'Sul'
}

type Profile = Tables<'profiles'>

export function AdminPanel() {
    const { canAccessAdmin, user, loading: authLoading } = useAuth()
    const navigate = useNavigate()
    const [users, setUsers] = useState<UserProfile[]>([])
    const [loading, setLoading] = useState(false)
    const [activeTab, setActiveTab] = useState('usuarios')
    
    // Modal State Users
    const [isEditDialogOpen, setIsEditDialogOpen] = useState(false)
    const [editingUser, setEditingUser] = useState<UserProfile | null>(null)
    const [newName, setNewName] = useState('')
    const [firstName, setFirstName] = useState('')
    const [lastName, setLastName] = useState('')

    // Entidades State
    const [entidades, setEntidades] = useState<Tables<'entidades'>[]>([])
    const [entidadesLoading, setEntidadesLoading] = useState(false)
    const [entidadeSearch, setEntidadeSearch] = useState('')
    const [editingEntidade, setEditingEntidade] = useState<Tables<'entidades'> | null>(null)
    const [entidadeForm, setEntidadeForm] = useState({ nome: '', municipio: '', estado: '', regiao: '' })
    const [isEditEntidadeOpen, setIsEditEntidadeOpen] = useState(false)
    const [savingEntidade, setSavingEntidade] = useState(false)

    // Logs State
    const [auditLogs, setAuditLogs] = useState<any[]>([])
    const [logsLoading, setLogsLoading] = useState(false)
    
    // Filtros de Log
    const [logFilterUser, setLogFilterUser] = useState('')
    const [logFilterAction, setLogFilterAction] = useState('ALL')
    const [logFilterTable, setLogFilterTable] = useState('ALL')

    // Delete Account State
    const [isDeletingAccount, setIsDeletingAccount] = useState(false)
    const [userToDelete, setUserToDelete] = useState<UserProfile | null>(null)
    const [deleteConfirmText, setDeleteConfirmText] = useState('')

    const fetchEntidades = useCallback(async () => {
        setEntidadesLoading(true)
        const { data } = await supabase.from('entidades').select('*, creator:profiles(display_name, email)').order('nome')
        if (data) setEntidades(data)
        setEntidadesLoading(false)
    }, [])


    const fetchUsers = useCallback(async () => {
        setLoading(true)
        try {
            const { data, error } = await supabase
                .from('profiles')
                .select('*, cargo:cargos_permissoes(id, nome)')
                .order('created_at', { ascending: false })
            
            if (error) throw error
            setUsers(data as any[])
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err)
            toast.error('Erro ao buscar usuários: ' + message)
        } finally {
            setLoading(false)
        }
    }, [])

    const fetchLogs = useCallback(async () => {
        setLogsLoading(true)
        let query = supabase
            .from('audit_logs')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(100)
        
        if (logFilterUser) {
            query = query.ilike('user_email', `%${logFilterUser}%`)
        }
        if (logFilterAction !== 'ALL') {
            query = query.eq('action', logFilterAction)
        }
        if (logFilterTable !== 'ALL') {
            query = query.eq('table_name', logFilterTable)
        }

        const { data, error } = await query
        
        if (!error && data) setAuditLogs(data)
        setLogsLoading(false)
    }, [logFilterUser, logFilterAction, logFilterTable])

    useEffect(() => {
        if (!authLoading && !canAccessAdmin) {
            toast.error('Acesso restrito ao Painel Administrativo')
            navigate('/')
        }
    }, [canAccessAdmin, authLoading, navigate])

    useEffect(() => {
        if (canAccessAdmin) {
            fetchUsers()
            if (activeTab === 'logs') fetchLogs()
            if (activeTab === 'entidades') fetchEntidades()
        }
    }, [canAccessAdmin, fetchUsers, fetchLogs, fetchEntidades, activeTab])

    if (!canAccessAdmin) {
        return (
            <div className="flex flex-col items-center justify-center py-20 gap-4">
                <ShieldAlert className="w-12 h-12 text-red-500" />
                <h1 className="text-xl font-bold">Acesso Restrito</h1>
                <p className="text-zinc-500">Você não tem permissão para acessar o Painel Admin.</p>
            </div>
        )
    }


    async function handleUpdateProfile() {
        if (!editingUser) return

        setLoading(true)
        try {
            const { error } = await supabase
                .from('profiles')
                .update({
                    display_name: newName.trim(),
                    nome: firstName.trim(),
                    sobrenome: lastName.trim()
                })
                .eq('id', editingUser.id)

            if (error) throw error
            
            toast.success('Perfil atualizado com sucesso!')
            fetchUsers()
            setIsEditDialogOpen(false)
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err)
            toast.error('Erro ao atualizar perfil: ' + message)
        } finally {
            setLoading(false)
        }
    }

    async function updatePermission(userId: string, updates: Partial<Profile>) {
        if (!canAccessAdmin) return
        
        try {
            const { data, error } = await supabase
                .from('profiles')
                .update(updates)
                .eq('id', userId)
                .select()

            if (error) throw error

            // Se retornou 0 linhas, o RLS bloqueou silenciosamente
            if (!data || data.length === 0) {
                toast.error('Atualização bloqueada: sem permissão RLS para editar este perfil. Execute a migration de fix_profiles_rls no Supabase.')
                return
            }

            toast.success('Permissões atualizadas!')
            fetchUsers()
            try {
                const targetUser = users.find(u => u.id === userId);
                await logOperation('UPDATE', 'profiles', userId, { target_email: targetUser?.email, ...updates }, user ?? undefined);
            } catch (logErr) {
                console.error('Failed to log permission change', logErr);
            }
        } catch (err) {
            const message = err instanceof Error ? err.message : (err as any)?.message || String(err)
            console.error('Update Permission Error:', err)
            toast.error(`Falha ao atualizar permissões: ${message}`)
        }
    }


    async function handleSaveEntidade() {
        if (!editingEntidade) return
        setSavingEntidade(true)
        try {
            const regiao = entidadeForm.estado ? (REGIOES_POR_UF[entidadeForm.estado] || entidadeForm.regiao) : entidadeForm.regiao
            const { error } = await supabase
                .from('entidades')
                .update({
                    nome: entidadeForm.nome.trim(),
                    municipio: entidadeForm.municipio.trim() || null,
                    estado: entidadeForm.estado || null,
                    regiao: regiao || null
                })
                .eq('id', editingEntidade.id)
            if (error) throw error
            toast.success('Entidade atualizada!')
            setIsEditEntidadeOpen(false)
            fetchEntidades()
        } catch (err) {
            toast.error('Erro ao salvar entidade.')
        } finally {
            setSavingEntidade(false)
        }
    }

    async function handleDeleteEntidade(id: number) {
        // Check for linked notas first
        const { count } = await supabase.from('notas').select('*', { count: 'exact', head: true }).eq('entidade_id', id)
        if ((count || 0) > 0) {
            toast.error(`Esta entidade tem ${count} nota(s) vinculada(s) e não pode ser excluída.`)
            return
        }
        if (!window.confirm('Excluir esta entidade permanentemente?')) return
        const { error } = await supabase.from('entidades').delete().eq('id', id)
        if (error) toast.error('Erro ao excluir entidade.')
        else { toast.success('Entidade excluída.'); fetchEntidades() }
    }

    async function handleVerifyUser(userId: string) {
        if (!window.confirm('Deseja confirmar manualmente o e-mail deste usuário? Isso permitirá que ele faça login sem precisar clicar no link de confirmação.')) return

        setLoading(true)
        try {
            const { data, error } = await supabase.rpc('admin_verify_user' as any, {
                target_user_id: userId
            })

            if (error) throw error
            
            const response = data as any
            if (response && !response.success) {
                toast.error(response.message)
            } else {
                toast.success('Usuário confirmado com sucesso!')
                fetchUsers()
            }
        } catch (err) {
            const message = err instanceof Error ? err.message : (err as any)?.message || String(err)
            toast.error(`Erro ao confirmar usuário: ${message}`)
        } finally {
            setLoading(false)
        }
    }

    async function handleDeleteAccount() {
        if (!userToDelete || deleteConfirmText !== 'CONFIRMAR') return

        setIsDeletingAccount(true)
        try {
            const { data, error } = await (supabase.rpc('admin_delete_user_account', {
                target_user_id: userToDelete.id
            }) as unknown as { data: { success: boolean, message: string } | null, error: { message: string } | null })

            if (error) throw error

            const response = data as { success: boolean, message: string } | null
            if (response && !response.success) {
                toast.error(response.message)
            } else {
                toast.success(`Conta de "${userToDelete.display_name || userToDelete.email}" removida permanentemente.`)
                setUserToDelete(null)
                setDeleteConfirmText('')
                fetchUsers()
            }
        } catch (err) {
            const message = err instanceof Error ? err.message : (err as any)?.message || String(err)
            toast.error(`Erro ao remover conta: ${message}`)
        } finally {
            setIsDeletingAccount(false)
        }
    }

    return (
        <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-zinc-900 dark:text-white flex items-center gap-2">
                        <ShieldAlert className="w-6 h-6 text-red-500" />
                        Painel Administrativo
                    </h1>
                    <p className="text-zinc-500 text-sm">Gestão de {activeTab === 'usuarios' ? 'usuários e acessos' : 'cargos e permissões modulares'}.</p>
                </div>
                <div className="flex gap-2">
                    <Button 
                        variant="outline" 
                        size="sm" 
                        onClick={() => { fetchUsers(); }} 
                        disabled={loading}
                        className="gap-2"
                    >
                        <RotateCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                        Sincronizar
                    </Button>
                </div>
            </div>

            <div className="w-full">
                <TabsList className="bg-zinc-100 dark:bg-zinc-900 p-1 mb-4 h-12 rounded-2xl border border-zinc-200 dark:border-zinc-800 justify-start inline-flex">
                    <TabsTrigger 
                        active={activeTab === 'usuarios'} 
                        onClick={() => setActiveTab('usuarios')} 
                        className="rounded-xl px-6 font-bold uppercase text-[10px] tracking-widest gap-2 h-10"
                    >
                        <Users className="w-4 h-4" /> Usuários
                    </TabsTrigger>
                    <TabsTrigger 
                        active={activeTab === 'entidades'} 
                        onClick={() => setActiveTab('entidades')} 
                        className="rounded-xl px-6 font-bold uppercase text-[10px] tracking-widest gap-2 h-10"
                    >
                        <Building2 className="w-4 h-4" /> Entidades
                    </TabsTrigger>
                    <TabsTrigger 
                        active={activeTab === 'logs'} 
                        onClick={() => setActiveTab('logs')} 
                        className="rounded-xl px-6 font-bold uppercase text-[10px] tracking-widest gap-2 h-10"
                    >
                        <History className="w-4 h-4" /> Logs de Auditoria
                    </TabsTrigger>
                </TabsList>

                <TabsContent visible={activeTab === 'usuarios'}>
                    <Card className="border-zinc-200 dark:border-zinc-800 shadow-sm overflow-hidden">
                        <div className="overflow-x-auto">
                            <Table>
                                <TableHeader className="bg-zinc-50 dark:bg-zinc-900/60 font-semibold">
                                    <TableRow className="border-zinc-200 dark:border-zinc-800">
                                        <TableHead>USUÁRIO</TableHead>
                                        <TableHead>NOME COMPLETO</TableHead>
                                        <TableHead>E-MAIL</TableHead>
                                        <TableHead>SETOR</TableHead>
                                        <TableHead>NÍVEL</TableHead>
                                        <TableHead>CADASTRO</TableHead>
                                        <TableHead>APROVAÇÃO</TableHead>
                                        <TableHead className="text-right">AÇÕES</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {users.map(u => (
                                        <TableRow key={u.id} className="border-zinc-100 dark:border-zinc-800/50">
                                            <TableCell className="font-semibold">
                                                <div className="flex items-center gap-2">
                                                    <div className="flex flex-col">
                                                        <span>{u.display_name || u.email?.split('@')[0] || '—'}</span>
                                                        {!u.display_name && (
                                                            <span className="text-[10px] text-amber-500 font-normal">nome não definido</span>
                                                        )}
                                                    </div>
                                                    <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => { 
                                                        setEditingUser(u); 
                                                        setNewName(u.display_name || ''); 
                                                        setFirstName(u.nome || '');
                                                        setLastName(u.sobrenome || '');
                                                        setIsEditDialogOpen(true); 
                                                     }}>
                                                        <Pencil className="w-3 h-3" />
                                                    </Button>
                                                </div>
                                            </TableCell>
                                            <TableCell className="text-zinc-600 dark:text-zinc-400">
                                                {u.nome || u.sobrenome ? `${u.nome || ''} ${u.sobrenome || ''}` : <span className="text-[10px] opacity-50">Não informado</span>}
                                            </TableCell>
                                            <TableCell className="text-zinc-500 text-xs">{u.email}</TableCell>
                                            <TableCell>
                                                <Select value={u.setor || ''} onValueChange={(v) => updatePermission(u.id, { setor: v as Profile['setor'] })}>
                                                    <SelectTrigger className="h-8 text-[10px] w-36 uppercase font-black tracking-tight"><SelectValue /></SelectTrigger>
                                                    <SelectContent>
                                                        <SelectItem value="COMPRAS">Compras</SelectItem>
                                                        <SelectItem value="VENDAS">Vendas Público</SelectItem>
                                                        <SelectItem value="VENDAS_PRIVADO">Vendas Privado</SelectItem>
                                                        <SelectItem value="EMPENHOS">Empenhos</SelectItem>
                                                        <SelectItem value="LOGISTICA">Logística</SelectItem>
                                                        <SelectItem value="DIRECAO">Direção</SelectItem>
                                                        <SelectItem value="LICIT">Licitação</SelectItem>
                                                        <SelectItem value="RECEBIMENTO">Recebimento</SelectItem>
                                                        <SelectItem value="FINANCEIRO">Financeiro</SelectItem>
                                                    </SelectContent>
                                                </Select>
                                            </TableCell>
                                            <TableCell>
                                                <Badge variant={u.nivel === 'ADM' ? 'destructive' : 'secondary'} className="text-[10px] font-black">{u.nivel}</Badge>
                                            </TableCell>
                                            <TableCell>
                                                {u.email_confirmed_at ? (
                                                    <Badge variant="outline" className="text-[9px] font-bold gap-1 text-emerald-600 border-emerald-200 bg-emerald-50 dark:bg-emerald-950/30">
                                                        <CheckCircle2 className="w-3 h-3" /> Confirmado
                                                    </Badge>
                                                ) : (
                                                    <Badge variant="outline" className="text-[9px] font-bold gap-1 text-amber-600 border-amber-200 bg-amber-50 dark:bg-amber-950/30">
                                                        <Mail className="w-3 h-3" /> Pendente
                                                    </Badge>
                                                )}
                                            </TableCell>
                                            <TableCell>
                                                {u.status_aprovacao === 'APROVADO' ? (
                                                    <Badge variant="outline" className="text-[9px] font-bold gap-1 text-emerald-600 border-emerald-200 bg-emerald-50 dark:bg-emerald-950/30">
                                                        Aprovado
                                                    </Badge>
                                                ) : u.status_aprovacao === 'RECUSADO' ? (
                                                    <Badge variant="outline" className="text-[9px] font-bold gap-1 text-red-600 border-red-200 bg-red-50 dark:bg-red-950/30">
                                                        Recusado
                                                    </Badge>
                                                ) : (
                                                    <Badge variant="outline" className="text-[9px] font-bold gap-1 text-amber-600 border-amber-200 bg-amber-50 dark:bg-amber-950/30 animate-pulse">
                                                        Pendente
                                                    </Badge>
                                                )}
                                            </TableCell>
                                            <TableCell className="text-right">
                                                <div className="flex items-center justify-end gap-2">
                                                    {u.id !== user?.id && u.status_aprovacao === 'PENDENTE' && (
                                                        <div className="flex items-center gap-1 mr-1 border-r border-zinc-200 dark:border-zinc-800 pr-2">
                                                            <Button 
                                                                size="sm" 
                                                                variant="outline" 
                                                                onClick={() => updatePermission(u.id, { status_aprovacao: 'APROVADO' })}
                                                                className="h-7 text-[9px] font-bold uppercase text-emerald-600 border-emerald-200 hover:bg-emerald-50 dark:hover:bg-emerald-950/30"
                                                            >
                                                                Aprovar
                                                            </Button>
                                                            <Button 
                                                                size="sm" 
                                                                variant="outline" 
                                                                onClick={() => updatePermission(u.id, { status_aprovacao: 'RECUSADO' })}
                                                                className="h-7 text-[9px] font-bold uppercase text-red-600 border-red-200 hover:bg-red-50 dark:hover:bg-red-950/30"
                                                            >
                                                                Recusar
                                                            </Button>
                                                        </div>
                                                    )}
                                                    {u.id !== user?.id && u.status_aprovacao === 'RECUSADO' && (
                                                        <Button 
                                                            size="sm" 
                                                            variant="outline" 
                                                            onClick={() => updatePermission(u.id, { status_aprovacao: 'APROVADO' })}
                                                            className="h-7 text-[9px] font-bold uppercase text-emerald-600 border-emerald-200 hover:bg-emerald-50 dark:hover:bg-emerald-950/30 mr-1 border-r border-zinc-200 dark:border-zinc-800 pr-2"
                                                        >
                                                            Reativar
                                                        </Button>
                                                    )}
                                                    {u.id !== user?.id && u.status_aprovacao === 'APROVADO' && (
                                                        <Button 
                                                            size="sm" 
                                                            variant="ghost" 
                                                            onClick={() => updatePermission(u.id, { status_aprovacao: 'RECUSADO' })}
                                                            className="h-7 text-[9px] font-bold uppercase text-zinc-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 mr-1 border-r border-zinc-200 dark:border-zinc-800 pr-2"
                                                        >
                                                            Bloquear
                                                        </Button>
                                                    )}
                                                    {u.id !== user?.id ? (
                                                        <Button size="sm" variant="outline" onClick={() => updatePermission(u.id, { nivel: u.nivel === 'ADM' ? 'OP' : 'ADM' })} className="text-[10px] font-bold uppercase gap-1.5">
                                                            {u.nivel === 'ADM' ? <ArrowDownCircle className="w-3.5 h-3.5" /> : <ArrowUpCircle className="w-3.5 h-3.5" />}
                                                            Nível
                                                        </Button>
                                                     ) : <span className="text-[10px] opacity-70 font-medium px-2 py-1 bg-zinc-100 rounded">Sessão Ativa</span>}
                                                    {u.id !== user?.id && (
                                                        <div className="flex items-center gap-1">
                                                            {!u.email_confirmed_at && (
                                                                <Button
                                                                    size="sm"
                                                                    variant="outline"
                                                                    onClick={() => handleVerifyUser(u.id)}
                                                                    className="h-7 px-2 text-[9px] font-bold uppercase text-brand-accent border-brand-accent/30 hover:bg-brand-accent/10 dark:hover:bg-brand-accent/20"
                                                                    title="Confirmar E-mail manualmente"
                                                                >
                                                                    Confirmar
                                                                </Button>
                                                            )}
                                                            <Button
                                                                size="sm"
                                                                variant="ghost"
                                                                onClick={() => { setUserToDelete(u); setDeleteConfirmText('') }}
                                                                className="h-7 w-7 p-0 text-zinc-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30"
                                                                title="Apagar conta"
                                                            >
                                                                <UserX className="w-3.5 h-3.5" />
                                                            </Button>
                                                        </div>
                                                     )}
                                                </div>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </div>
                    </Card>
                </TabsContent>


                {/* ===== ABA ENTIDADES ===== */}
                <TabsContent visible={activeTab === 'entidades'}>
                    <div className="space-y-4">
                        <div className="flex items-center gap-3">
                            <div className="relative flex-1">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-400" />
                                <input
                                    type="text"
                                    placeholder="Buscar entidade..."
                                    value={entidadeSearch}
                                    onChange={e => setEntidadeSearch(e.target.value)}
                                    className="w-full pl-9 h-9 rounded-md border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-xs px-3 focus:outline-none focus:ring-1 focus:ring-blue-500"
                                />
                            </div>
                            <Button variant="outline" size="sm" onClick={fetchEntidades} className="gap-2 h-9">
                                <RotateCw className={`w-3.5 h-3.5 ${entidadesLoading ? 'animate-spin' : ''}`} />
                                Atualizar
                            </Button>
                        </div>

                        <Card className="border-zinc-200 dark:border-zinc-800 shadow-sm overflow-hidden">
                            <div className="overflow-x-auto">
                                <Table>
                                    <TableHeader className="bg-zinc-50 dark:bg-zinc-900/60 font-semibold">
                                        <TableRow className="border-zinc-200 dark:border-zinc-800">
                                            <TableHead>NOME</TableHead>
                                            <TableHead><MapPin className="w-3 h-3 inline mr-1" />MUNICÍPIO</TableHead>
                                            <TableHead>UF</TableHead>
                                            <TableHead>REGIÃO</TableHead>
                                            <TableHead>CADASTRADO POR</TableHead>
                                            <TableHead className="text-right">AÇÕES</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {entidadesLoading ? (
                                            <TableRow><TableCell colSpan={5} className="text-center py-10"><Loader2 className="w-5 h-5 animate-spin mx-auto" /></TableCell></TableRow>
                                        ) : entidades
                                            .filter(e => !entidadeSearch || e.nome.toLowerCase().includes(entidadeSearch.toLowerCase()) || (e.municipio || '').toLowerCase().includes(entidadeSearch.toLowerCase()))
                                            .map(ent => (
                                            <TableRow key={ent.id} className="border-zinc-100 dark:border-zinc-800/50">
                                                <TableCell className="font-semibold max-w-xs truncate">{ent.nome}</TableCell>
                                                <TableCell className="text-zinc-600 dark:text-zinc-300">
                                                    {ent.municipio 
                                                        ? <span className="flex items-center gap-1"><MapPin className="w-3 h-3 text-blue-400" />{ent.municipio}</span>
                                                        : <span className="text-amber-500 text-[10px]">Não especificado</span>}
                                                </TableCell>
                                                <TableCell>
                                                    {ent.estado 
                                                        ? <Badge variant="outline" className="text-[10px] font-bold">{ent.estado}</Badge>
                                                        : <span className="text-zinc-400 text-[10px]">—</span>}
                                                </TableCell>
                                                <TableCell className="text-xs text-zinc-500">{ent.regiao || '—'}</TableCell>
                                                <TableCell className="text-[10px] text-zinc-400">
                                                    {(() => {
                                                        const p = (ent as any).creator;
                                                        const profile = Array.isArray(p) ? p[0] : p;
                                                        return profile?.display_name || profile?.email || <span className="opacity-50">Sistema / Anterior</span>;
                                                    })()}
                                                </TableCell>
                                                <TableCell className="text-right">
                                                    <div className="flex items-center justify-end gap-1">
                                                        <Button
                                                            variant="ghost" size="icon"
                                                            className="h-7 w-7 text-zinc-400 hover:text-blue-600"
                                                            onClick={() => {
                                                                setEditingEntidade(ent)
                                                                setEntidadeForm({ nome: ent.nome, municipio: ent.municipio || '', estado: ent.estado || '', regiao: ent.regiao || '' })
                                                                setIsEditEntidadeOpen(true)
                                                            }}
                                                        >
                                                            <Pencil className="w-3.5 h-3.5" />
                                                        </Button>
                                                        <Button
                                                            variant="ghost" size="icon"
                                                            className="h-7 w-7 text-zinc-400 hover:text-red-500"
                                                            onClick={() => handleDeleteEntidade(ent.id)}
                                                        >
                                                            <TrashIcon className="w-3.5 h-3.5" />
                                                        </Button>
                                                    </div>
                                                </TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            </div>
                        </Card>
                    </div>
                </TabsContent>

                <TabsContent visible={activeTab === 'logs'}>
                    <div className="flex flex-col md:flex-row md:items-end gap-3 mb-6 bg-zinc-50 dark:bg-zinc-900/50 p-4 rounded-xl border border-zinc-200 dark:border-zinc-800 print:hidden">
                        <div className="flex-1 space-y-1.5">
                            <Label className="text-[10px] uppercase font-bold text-zinc-400">Filtrar por Usuário</Label>
                            <div className="relative">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-400" />
                                <Input 
                                    placeholder="Ex: joao@..." 
                                    className="pl-9 h-9 text-xs" 
                                    value={logFilterUser}
                                    onChange={(e) => setLogFilterUser(e.target.value)}
                                />
                            </div>
                        </div>
                        <div className="w-full md:w-44 space-y-1.5">
                            <Label className="text-[10px] uppercase font-bold text-zinc-400">Ação</Label>
                            <select 
                                className="w-full h-9 rounded-md border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 px-3 py-1 text-xs"
                                value={logFilterAction}
                                onChange={(e) => setLogFilterAction(e.target.value)}
                            >
                                <option value="ALL">Todas as Ações</option>
                                <option value="CREATE_NOTA">Criar Nota</option>
                                <option value="UPDATE_NOTA">Editar Nota</option>
                                <option value="EXCLUIR_NOTA">Excluir Nota</option>
                                <option value="DISTRIBUIR_NOTA">Distribuir</option>
                                <option value="CONFIRMAR_RECEBIMENTO">Receber</option>
                                <option value="EXCLUIR_ATA">Excluir Ata</option>
                            </select>
                        </div>
                        <div className="w-full md:w-44 space-y-1.5">
                            <Label className="text-[10px] uppercase font-bold text-zinc-400">Entidade</Label>
                            <select 
                                className="w-full h-9 rounded-md border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 px-3 py-1 text-xs"
                                value={logFilterTable}
                                onChange={(e) => setLogFilterTable(e.target.value)}
                            >
                                <option value="ALL">Todas</option>
                                <option value="notas">Notas (NEs)</option>
                                <option value="atas">Atas (ARPs)</option>
                                <option value="profiles">Usuários</option>
                            </select>
                        </div>
                        <div className="flex gap-2">
                           <Button 
                                variant="outline" 
                                size="sm" 
                                className="h-9 gap-2 text-xs font-bold"
                                onClick={() => { setLogFilterUser(''); setLogFilterAction('ALL'); setLogFilterTable('ALL'); }}
                            >
                                <XCircle className="w-3.5 h-3.5" />
                                Limpar
                            </Button>
                            <Button 
                                variant="outline" 
                                size="sm" 
                                className="h-9 gap-2 text-xs font-bold bg-white dark:bg-zinc-950"
                                onClick={() => window.print()}
                            >
                                <Printer className="w-3.5 h-3.5" />
                                Imprimir
                            </Button>
                        </div>
                    </div>

                    <div className="hidden print:block mb-8 border-b pb-4">
                        <div className="flex items-center gap-4">
                            <img src="/img/logo.png" alt="Logo" className="h-10 w-auto" />
                            <div>
                                <h1 className="text-xl font-bold uppercase tracking-tight">Relatório de Auditoria</h1>
                                <p className="text-xs text-zinc-500">Documento gerado em {new Date().toLocaleString('pt-BR')}</p>
                            </div>
                        </div>
                    </div>

                    <Card className="border-zinc-200 dark:border-zinc-800 shadow-sm overflow-hidden bg-white dark:bg-zinc-950 print:border-0 print:shadow-none">
                        <div className="overflow-x-auto">
                            <Table>
                                <TableHeader className="bg-zinc-50 dark:bg-zinc-900/60 font-semibold">
                                    <TableRow className="border-zinc-200 dark:border-zinc-800">
                                        <TableHead className="w-40">DATA/HORA</TableHead>
                                        <TableHead>USUÁRIO</TableHead>
                                        <TableHead>AÇÃO</TableHead>
                                        <TableHead>RECURSO</TableHead>
                                        <TableHead>DETALHES</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {logsLoading ? (
                                        <TableRow><TableCell colSpan={5} className="text-center py-10 text-zinc-500"><Loader2 className="w-5 h-5 animate-spin mx-auto mr-2" /> Carregando logs...</TableCell></TableRow>
                                    ) : auditLogs.length === 0 ? (
                                        <TableRow><TableCell colSpan={5} className="text-center py-10 text-zinc-500">Nenhum log registrado ainda.</TableCell></TableRow>
                                    ) : auditLogs.map(log => {
                                        const isDeletion = log.action.includes('EXCLUIR')
                                        return (
                                            <TableRow key={log.id} className="border-zinc-100 dark:border-zinc-800/50">
                                                <TableCell className="text-[10px] text-zinc-500 font-mono whitespace-nowrap">
                                                    {new Date(log.created_at).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })}
                                                </TableCell>
                                                <TableCell>
                                                    <div className="flex flex-col">
                                                        <span className="text-xs font-bold">{log.user_email?.split('@')[0]}</span>
                                                        <span className="text-[10px] text-zinc-400">{log.user_email}</span>
                                                    </div>
                                                </TableCell>
                                                <TableCell>
                                                    <Badge 
                                                        variant={isDeletion ? "destructive" : "outline"} 
                                                        className="text-[9px] font-black tracking-tight"
                                                    >
                                                        {log.action}
                                                    </Badge>
                                                </TableCell>
                                                <TableCell>
                                                    <div className="flex items-center gap-1.5">
                                                        {log.table_name === 'notas' ? <FileText className="w-3 h-3 text-blue-500" /> : <Package className="w-3 h-3 text-amber-500" />}
                                                        <span className="text-xs font-medium uppercase tracking-tighter">{log.table_name}</span>
                                                        <span className="text-[10px] text-zinc-400">#{log.record_id}</span>
                                                    </div>
                                                </TableCell>
                                                <TableCell className="max-w-xs">
                                                    <p className="text-[10px] text-zinc-500 line-clamp-2">
                                                        {log.details ? JSON.stringify(log.details) : '—'}
                                                    </p>
                                                </TableCell>
                                            </TableRow>
                                        )
                                    })}
                                </TableBody>
                            </Table>
                        </div>
                    </Card>
                </TabsContent>
            </div>

            <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
                <DialogContent className="sm:max-w-[425px]">
                    <DialogHeader>
                        <DialogTitle>Editar Usuário</DialogTitle>
                    </DialogHeader>
                    <div className="grid gap-4 py-4">
                        <div className="space-y-2">
                            <Label htmlFor="display_name" className="text-xs uppercase font-bold text-zinc-500">Nome de Exibição (Display Name)</Label>
                            <Input id="display_name" value={newName} onChange={(e) => setNewName(e.target.value)} />
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label htmlFor="firstName" className="text-xs uppercase font-bold text-zinc-500">Nome</Label>
                                <Input id="firstName" value={firstName} onChange={(e) => setFirstName(e.target.value)} />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="lastName" className="text-xs uppercase font-bold text-zinc-500">Sobrenome</Label>
                                <Input id="lastName" value={lastName} onChange={(e) => setLastName(e.target.value)} />
                            </div>
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="ghost" size="sm" onClick={() => setIsEditDialogOpen(false)}>Cancelar</Button>
                        <Button size="sm" onClick={handleUpdateProfile} disabled={loading} className="bg-brand-accent hover:bg-brand-accent/90">
                            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Salvar'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>


            {/* Dialog: Apagar Conta */}
            <Dialog open={!!userToDelete} onOpenChange={(open) => { if (!open) { setUserToDelete(null); setDeleteConfirmText('') } }}>
                <DialogContent className="sm:max-w-[480px]">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2 text-red-600">
                            <AlertTriangle className="w-5 h-5" />
                            Apagar Conta Permanentemente
                        </DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4 py-2">
                        <div className="bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900 rounded-xl p-4 space-y-2">
                            <p className="text-sm font-bold text-red-700 dark:text-red-400">Esta ação é irreversível!</p>
                            <ul className="text-xs text-red-600 dark:text-red-400 space-y-1 list-disc list-inside">
                                <li>O perfil e acesso do usuário serão removidos</li>
                                <li>Os logs de auditoria são mantidos (nome preservado, e-mail parcialmente censurado, CPF removido)</li>
                                <li>Esta ação não pode ser desfeita</li>
                            </ul>
                        </div>
                        <div className="bg-zinc-50 dark:bg-zinc-900 rounded-xl p-3 border border-zinc-200 dark:border-zinc-800">
                            <p className="text-xs text-zinc-500 mb-1">Conta a ser removida:</p>
                            <p className="font-bold text-sm">{userToDelete?.display_name || userToDelete?.email?.split('@')[0]}</p>
                            <p className="text-xs text-zinc-400">{userToDelete?.email}</p>
                        </div>
                        <div className="space-y-2">
                            <Label className="text-xs font-bold uppercase text-zinc-500">
                                Digite <span className="text-red-600 font-black">CONFIRMAR</span> para prosseguir
                            </Label>
                            <Input
                                value={deleteConfirmText}
                                onChange={(e) => setDeleteConfirmText(e.target.value)}
                                placeholder="CONFIRMAR"
                                className="border-red-200 dark:border-red-900 focus-visible:ring-red-500"
                            />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="ghost" size="sm" onClick={() => { setUserToDelete(null); setDeleteConfirmText('') }}>
                            Cancelar
                        </Button>
                        <Button
                            size="sm"
                            variant="destructive"
                            onClick={handleDeleteAccount}
                            disabled={deleteConfirmText !== 'CONFIRMAR' || isDeletingAccount}
                            className="gap-2"
                        >
                            {isDeletingAccount ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserX className="w-4 h-4" />}
                            Apagar Conta
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
            {/* Dialog: Editar Entidade */}
            <Dialog open={isEditEntidadeOpen} onOpenChange={setIsEditEntidadeOpen}>
                <DialogContent className="sm:max-w-[480px]">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <Building2 className="w-4 h-4 text-blue-500" />
                            Editar Entidade
                        </DialogTitle>
                    </DialogHeader>
                    <div className="grid gap-4 py-4">
                        <div className="space-y-1.5">
                            <Label className="text-xs font-bold uppercase text-zinc-500">Nome do Órgão</Label>
                            <Input value={entidadeForm.nome} onChange={e => setEntidadeForm(p => ({ ...p, nome: e.target.value }))} />
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-1.5">
                                <Label className="text-xs font-bold uppercase text-zinc-500">Município</Label>
                                <Input value={entidadeForm.municipio} onChange={e => setEntidadeForm(p => ({ ...p, municipio: e.target.value }))} placeholder="Ex: Anicuns" />
                            </div>
                            <div className="space-y-1.5">
                                <Label className="text-xs font-bold uppercase text-zinc-500">Estado (UF)</Label>
                                <select
                                    value={entidadeForm.estado}
                                    onChange={e => setEntidadeForm(p => ({ ...p, estado: e.target.value, regiao: REGIOES_POR_UF[e.target.value] || p.regiao }))}
                                    className="w-full h-9 rounded-md border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 px-3 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                                >
                                    <option value="">Selecione...</option>
                                    {BR_STATES.map(s => <option key={s} value={s}>{s}</option>)}
                                </select>
                            </div>
                        </div>
                        <div className="space-y-1.5">
                            <Label className="text-xs font-bold uppercase text-zinc-500">Região</Label>
                            <Input value={entidadeForm.regiao} readOnly className="bg-zinc-50 dark:bg-zinc-900 text-zinc-500" placeholder="Preenchida automaticamente ao selecionar UF" />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="ghost" size="sm" onClick={() => setIsEditEntidadeOpen(false)}>Cancelar</Button>
                        <Button size="sm" className="bg-blue-600 hover:bg-blue-700 text-white" onClick={handleSaveEntidade} disabled={savingEntidade || !entidadeForm.nome.trim()}>
                            {savingEntidade ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Salvar'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    )
}
