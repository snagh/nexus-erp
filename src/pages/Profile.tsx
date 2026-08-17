import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { toast } from 'sonner'
import { useAuth } from '../AuthContext'
import { Loader2, Lock, User, AtSign, Fingerprint, Shield, LogOut, Trash2, AlertTriangle } from 'lucide-react'

export function Profile() {
  const { profile, user, signOutAll, signOut } = useAuth()
  const [loading, setLoading] = useState(false)
  const [globalSignOutLoading, setGlobalSignOutLoading] = useState(false)
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')

  // Delete own account state
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false)
  const [deleteConfirmText, setDeleteConfirmText] = useState('')
  const [isDeletingAccount, setIsDeletingAccount] = useState(false)

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault()

    if (newPassword.length < 6) {
      toast.error('A senha deve ter pelo menos 6 caracteres.')
      return
    }

    if (newPassword !== confirmPassword) {
      toast.error('As senhas não coincidem.')
      return
    }

    setLoading(true)
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword })
      if (error) throw error
      
      // Registrar data da troca para derrubar outras sessões
      if (!user?.id) throw new Error('ID do usuário não encontrado')
      await supabase.from('profiles')
        .update({ last_password_change: new Date().toISOString() })
        .eq('id', user.id)

      toast.success('Senha atualizada com sucesso! Por segurança, reconecte em seus outros dispositivos.')
      setNewPassword('')
      setConfirmPassword('')
    } catch (err: any) {
      toast.error('Erro ao atualizar senha: ' + (err.message || 'Erro desconhecido'))
    } finally {
      setLoading(false)
    }
  }

  const handleGlobalSignOut = async () => {
    if (!confirm('Você tem certeza que deseja deslogar de todos os dispositivos? Esta ação encerrará sua sessão atual também.')) return
    
    setGlobalSignOutLoading(true)
    try {
      await signOutAll()
      toast.success('Solicitação de encerramento de todas as sessões enviada.')
    } catch (err: any) {
      toast.error('Erro ao deslogar: ' + (err.message || 'Erro desconhecido'))
    } finally {
      setGlobalSignOutLoading(false)
    }
  }

  const handleDeleteOwnAccount = async () => {
    if (!user?.id || deleteConfirmText !== 'CONFIRMAR') return

    setIsDeletingAccount(true)
    try {
      const { data, error } = await (supabase.rpc('admin_delete_user_account', {
        target_user_id: user.id
      }) as unknown as { data: { success: boolean, message: string } | null, error: { message: string } | null })

      if (error) throw error

      const response = data as { success: boolean, message: string } | null
      if (response && !response.success) {
        toast.error(response.message)
      } else {
        toast.success('Conta excluída. Até mais!')
        await signOut()
      }
    } catch (err: any) {
      toast.error('Erro ao excluir conta: ' + (err.message || 'Erro desconhecido'))
    } finally {
      setIsDeletingAccount(false)
    }
  }

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div>
        <h1 className="text-3xl font-bold text-zinc-900 dark:text-white">Meu Perfil</h1>
        <p className="text-zinc-500 dark:text-zinc-400 mt-1">Gerencie suas informações de conta e segurança</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Info Card */}
        <div className="lg:col-span-1 space-y-6">
          <div className="bg-white dark:bg-zinc-900 rounded-3xl p-6 border border-zinc-200 dark:border-zinc-800 shadow-sm overflow-hidden relative group">
            <div className="absolute top-0 right-0 w-32 h-32 bg-brand-accent/5 rounded-full -mr-16 -mt-16 transition-transform group-hover:scale-110" />
            
            <div className="relative">
              <div className="w-20 h-20 rounded-2xl bg-brand-accent flex items-center justify-center text-primary-foreground text-3xl font-bold uppercase shadow-lg shadow-brand-accent/20 mb-6">
                {profile?.display_name?.charAt(0) || user?.email?.charAt(0) || 'U'}
              </div>
              
              <div className="space-y-4">
                <div>
                  <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest block mb-1">Nome Completo</label>
                  <div className="flex items-center gap-2 text-zinc-900 dark:text-white font-medium">
                    <User size={16} className="text-zinc-400" />
                    {profile?.display_name || 'Não informado'}
                  </div>
                </div>
                
                <div>
                  <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest block mb-1">E-mail</label>
                  <div className="flex items-center gap-2 text-zinc-900 dark:text-white font-medium">
                    <AtSign size={16} className="text-zinc-400" />
                    {user?.email}
                  </div>
                </div>

                <div className="pt-4 flex gap-2">
                    <span className="text-[10px] px-2 py-1 bg-brand-accent/10 text-brand-accent rounded-full font-black uppercase tracking-wider border border-brand-accent/20">
                        {profile?.nivel}
                    </span>
                    <span className="text-[10px] px-2 py-1 bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 rounded-full font-bold uppercase">
                        {profile?.setor === 'VENDAS' ? 'VENDAS PÚBLICO' : profile?.setor}
                    </span>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-zinc-100 dark:bg-zinc-900/50 rounded-2xl p-6 border border-zinc-200 dark:border-zinc-800/50">
            <div className="flex items-start gap-4">
              <div className="p-2 bg-white dark:bg-zinc-800 rounded-lg shadow-sm">
                <Shield className="text-blue-500" size={20} />
              </div>
              <div>
                <h3 className="text-sm font-bold text-zinc-900 dark:text-white">Identificação Única</h3>
                <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1 mb-3">Dados protegidos conforme diretrizes da empresa.</p>
                <div className="flex items-center gap-2 text-[10px] font-mono text-zinc-400 bg-white dark:bg-zinc-800 px-2 py-1.5 rounded border border-zinc-200 dark:border-zinc-800">
                    <Fingerprint size={12} />
                    {profile?.cpf ? `***.***.${profile.cpf.slice(-5)}` : 'CPF não informado'}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Change Password Card */}
        <div className="lg:col-span-2">
          <div className="bg-white dark:bg-zinc-900 rounded-3xl p-8 border border-zinc-200 dark:border-zinc-800 shadow-sm h-full">
            <div className="flex items-center gap-3 mb-8">
              <div className="w-10 h-10 rounded-xl bg-blue-50 dark:bg-blue-900/20 flex items-center justify-center text-blue-600 dark:text-blue-400">
                <Lock size={20} />
              </div>
              <div>
                <h2 className="text-xl font-bold text-zinc-900 dark:text-white">Segurança da Conta</h2>
                <p className="text-sm text-zinc-500 dark:text-zinc-400">Atualize sua senha de acesso</p>
              </div>
            </div>

            <form onSubmit={handleChangePassword} className="max-w-md space-y-6">
              <div className="space-y-4">
                <div className="space-y-2">
                  <label className="text-xs font-bold text-zinc-600 dark:text-zinc-400 uppercase tracking-wider ml-1">Nova Senha</label>
                  <input
                    type="password"
                    required
                    placeholder="••••••••"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className="w-full px-4 py-3 bg-zinc-50 dark:bg-zinc-950/50 border border-zinc-200 dark:border-zinc-800 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 transition-all"
                  />
                  <p className="text-[10px] text-zinc-400 ml-1">Mínimo de 6 caracteres</p>
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-bold text-zinc-600 dark:text-zinc-400 uppercase tracking-wider ml-1">Confirmar Nova Senha</label>
                  <input
                    type="password"
                    required
                    placeholder="••••••••"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="w-full px-4 py-3 bg-zinc-50 dark:bg-zinc-950/50 border border-zinc-200 dark:border-zinc-800 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 transition-all"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="inline-flex items-center justify-center gap-2 px-6 py-3 bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 rounded-xl text-sm font-semibold hover:bg-zinc-800 dark:hover:bg-zinc-100 transition-all disabled:opacity-50 shadow-lg shadow-zinc-900/10"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Atualizando...</span>
                  </>
                ) : (
                  <span>Atualizar Senha</span>
                )}
              </button>
            </form>

            <div className="pt-8 border-t border-zinc-100 dark:border-zinc-800/50 mt-8">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-8 h-8 rounded-lg bg-orange-50 dark:bg-orange-900/20 flex items-center justify-center text-orange-600 dark:text-orange-400">
                  <LogOut size={16} />
                </div>
                <h3 className="text-sm font-bold text-zinc-900 dark:text-white">Gerenciamento de Sessões</h3>
              </div>
              <p className="text-xs text-zinc-500 dark:text-zinc-400 mb-6">
                Encerre todas as sessões ativas em todos os dispositivos onde você está logado. Por segurança, você também será deslogado deste dispositivo.
              </p>
              <button
                onClick={handleGlobalSignOut}
                disabled={globalSignOutLoading}
                className="inline-flex items-center justify-center gap-2 px-4 py-2 bg-orange-50 dark:bg-orange-900/20 text-orange-600 dark:text-orange-400 rounded-lg text-xs font-bold hover:bg-orange-100 dark:hover:bg-orange-900/40 transition-all disabled:opacity-50"
              >
                {globalSignOutLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <LogOut size={14} />}
                <span>Sair de todos os dispositivos</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Danger Zone */}
      <div className="border border-red-200 dark:border-red-900/50 rounded-3xl overflow-hidden">
        <div className="bg-red-50 dark:bg-red-950/20 px-6 py-4 flex items-center gap-3">
          <AlertTriangle className="w-5 h-5 text-red-500" />
          <div>
            <h3 className="text-sm font-bold text-red-700 dark:text-red-400">Zona de Perigo</h3>
            <p className="text-xs text-red-500/80 dark:text-red-500/60">Ações irreversíveis para sua conta</p>
          </div>
        </div>
        <div className="px-6 py-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <p className="text-sm font-semibold text-zinc-900 dark:text-white">Excluir minha conta</p>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
              Remove permanentemente seu perfil e acesso ao sistema. Seu histórico de ações fica anonimizado nos logs.
            </p>
          </div>
          <button
            onClick={() => { setIsDeleteDialogOpen(true); setDeleteConfirmText('') }}
            className="inline-flex items-center gap-2 px-4 py-2 bg-red-50 dark:bg-red-950/30 text-red-600 dark:text-red-400 border border-red-200 dark:border-red-900 rounded-xl text-xs font-bold hover:bg-red-100 dark:hover:bg-red-950/60 transition-all whitespace-nowrap"
          >
            <Trash2 size={14} />
            Excluir Conta
          </button>
        </div>
      </div>

      {/* Dialog de confirmação */}
      {isDeleteDialogOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white dark:bg-zinc-900 rounded-2xl shadow-2xl border border-zinc-200 dark:border-zinc-800 w-full max-w-md">
            <div className="p-6 space-y-5">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-red-100 dark:bg-red-950/50 flex items-center justify-center">
                  <AlertTriangle className="w-5 h-5 text-red-500" />
                </div>
                <div>
                  <h3 className="font-bold text-zinc-900 dark:text-white">Excluir Conta Permanentemente</h3>
                  <p className="text-xs text-zinc-500">Esta ação não pode ser desfeita</p>
                </div>
              </div>

              <div className="bg-red-50 dark:bg-red-950/30 border border-red-100 dark:border-red-900 rounded-xl p-4 space-y-1.5">
                <ul className="text-xs text-red-600 dark:text-red-400 space-y-1 list-disc list-inside">
                  <li>Seu perfil e acesso serão removidos imediatamente</li>
                  <li>Seu histórico de ações é mantido, mas com e-mail censurado e CPF removido</li>
                  <li>Você será deslogado automaticamente</li>
                </ul>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-bold uppercase text-zinc-500 tracking-wider">
                  Digite <span className="text-red-600 font-black">CONFIRMAR</span> para prosseguir
                </label>
                <input
                  type="text"
                  value={deleteConfirmText}
                  onChange={(e) => setDeleteConfirmText(e.target.value)}
                  placeholder="CONFIRMAR"
                  className="w-full px-4 py-2.5 border border-red-200 dark:border-red-900 rounded-xl text-sm bg-white dark:bg-zinc-950 focus:outline-none focus:ring-2 focus:ring-red-500/30"
                />
              </div>

              <div className="flex gap-3 pt-1">
                <button
                  onClick={() => setIsDeleteDialogOpen(false)}
                  className="flex-1 px-4 py-2.5 rounded-xl border border-zinc-200 dark:border-zinc-700 text-sm font-medium text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-all"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleDeleteOwnAccount}
                  disabled={deleteConfirmText !== 'CONFIRMAR' || isDeletingAccount}
                  className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-red-600 hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-xl text-sm font-bold transition-all"
                >
                  {isDeletingAccount ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 size={14} />}
                  Excluir Minha Conta
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
