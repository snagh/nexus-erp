import { useState } from 'react'
import { supabase } from './lib/supabase'
import { toast } from 'sonner'
import { Loader2 } from 'lucide-react'
import { Navigate, useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from './AuthContext'
import { validateCPF, formatCPF, validateEmail } from '@/lib/validators'

export function Login() {
  const { session, loading: authLoading } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  
  const [loading, setLoading] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [nome, setNome] = useState('')
  const [sobrenome, setSobrenome] = useState('')
  const [cpf, setCpf] = useState('')
  const [isSignUp, setIsSignUp] = useState(false)
  const [isRecovery, setIsRecovery] = useState(false)

  // Se já estiver logado, nem renderiza a tela e vai pro dashboard
  if (!authLoading && session) {
      const from = location.state?.from?.pathname || '/dashboard'
      return <Navigate to={from} replace />
  }

  const handleResetPasswordRequest = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email) {
      toast.warning('Informe seu e-mail para recuperar a senha.')
      return
    }
    setLoading(true)
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`,
      })
      if (error) throw error
      toast.success('E-mail de recuperação enviado! Verifique sua caixa de entrada.')
      setIsRecovery(false)
    } catch (err: any) {
      toast.error('Erro ao enviar recuperação: ' + (err.message || 'Erro desconhecido'))
    } finally {
      setLoading(false)
    }
  }

  const handleResendConfirmation = async () => {
    if (!email) {
        toast.warning('Informe seu e-mail para reenviar a confirmação.')
        return
    }
    setLoading(true)
    try {
        const { error } = await supabase.auth.resend({
            type: 'signup',
            email,
            options: {
                emailRedirectTo: window.location.origin
            }
        })
        if (error) throw error
        toast.success('E-mail de confirmação reenviado! Verifique sua caixa de entrada.')
    } catch (err: any) {
        toast.error('Erro ao reenviar: ' + (err.message || 'Erro desconhecido'))
    } finally {
        setLoading(false)
    }
  }

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)

    if(!email || !password) {
        toast.warning('Preencha email e senha')
        setLoading(false)
        return
    }

    try {
      let error
      if (isSignUp) {
        if (!nome || !sobrenome || !cpf) {
            toast.warning('Todos os campos são obrigatórios para o cadastro.')
            setLoading(false)
            return
        }
        if (!validateCPF(cpf)) {
            toast.error('CPF inválido.')
            setLoading(false)
            return
        }
        if (!validateEmail(email)) {
             toast.error('E-mail inválido.')
             setLoading(false)
             return
        }

        const { error: signUpError } = await supabase.auth.signUp({ 
            email, 
            password,
            options: {
                data: {
                    full_name: `${nome} ${sobrenome}`.trim(),
                    nome,
                    sobrenome,
                    cpf: cpf.replace(/\D/g, '')
                }
            }
        })
        error = signUpError
        if (!error) {
            toast.success('Cadastro realizado! Verifique seu email para confirmar antes de logar.', { duration: 6000 })
            setIsSignUp(false)
            setPassword('')
        }
      } else {
        const { error: signInError } = await supabase.auth.signInWithPassword({ 
            email, 
            password 
        })
        error = signInError
        if (!error) {
           const from = location.state?.from?.pathname || '/dashboard'
           navigate(from, { replace: true })
        }
      }

      if (error) throw error
    } catch (err: unknown) {
      const error = err as any // eslint-disable-line @typescript-eslint/no-explicit-any
      const msg = error.error_description || error.message || 'Erro desconhecido'
      
      console.error('Auth error:', error)

      if (msg.includes('Email not confirmed')) {
          toast.warning(
            <div className="flex flex-col gap-2">
                <span>Você precisa confirmar seu email antes de entrar!</span>
                <button 
                    onClick={handleResendConfirmation}
                    className="text-xs font-bold underline text-left hover:text-blue-700"
                >
                    Reenviar e-mail de confirmação
                </button>
            </div>, 
            { duration: 10000 }
          )
      } else if (msg.includes('Invalid login credentials')) {
          toast.error('Email ou senha incorretos.')
      } else if (msg.toLowerCase().includes('rate limit') || msg.includes('429')) {
          toast.error('Muitas tentativas seguidas. Por favor, aguarde alguns minutos antes de tentar novamente.', { duration: 8000 })
      } else {
          toast.error('Erro ao entrar: ' + msg)
      }
    } finally {
      setLoading(false)
    }
  }

  if (authLoading) {
      return (
          <div className="min-h-screen flex items-center justify-center bg-zinc-50 dark:bg-zinc-950">
             <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
          </div>
      )
  }

  return (
    <div className="min-h-screen flex items-center justify-center relative overflow-hidden bg-zinc-50 dark:bg-[#0a0a0a]">
      {/* Dynamic Background Gradients */}
      <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] rounded-full bg-cyan-500/20 blur-[120px] mix-blend-multiply dark:mix-blend-screen pointer-events-none animate-pulse"></div>
      <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] rounded-full bg-violet-500/20 blur-[120px] mix-blend-multiply dark:mix-blend-screen pointer-events-none animate-pulse" style={{ animationDelay: '2s' }}></div>

      <div className="relative w-full max-w-md z-10 p-4">
        <div className="bg-white/70 dark:bg-zinc-900/60 backdrop-blur-xl border border-white/20 dark:border-white/10 rounded-3xl shadow-2xl p-8 transition-all duration-300">
          
          <div className="text-center mb-10">
              <div className="flex flex-col items-center justify-center mb-6 gap-3 relative">
                <div className="relative flex justify-center items-center w-full h-16">
                    {/* Linhas Animadas formando as letras N E X U S - Light Theme */}
                    <div 
                      className="absolute inset-0 w-full h-full pointer-events-none z-20 block dark:hidden animate-[laser-fade-out_0.5s_ease-out_forwards_1.5s]" 
                      style={{ 
                        WebkitMaskImage: 'url(/nexus-logo.png)',
                        WebkitMaskSize: 'contain',
                        WebkitMaskPosition: 'center',
                        WebkitMaskRepeat: 'no-repeat',
                        maskImage: 'url(/nexus-logo.png)',
                        maskSize: 'contain',
                        maskPosition: 'center',
                        maskRepeat: 'no-repeat',
                      }}
                    >
                      {Array.from({ length: 60 }).map((_, i) => {
                         const angle = (360 / 60) * i;
                         return (
                           <div 
                             key={`light-${i}`}
                             className="absolute left-1/2 top-1/2 w-[2px] h-[30px] bg-gradient-to-b from-violet-500 to-cyan-400 origin-top shadow-[0_0_8px_rgba(139,92,246,0.8)]"
                             style={{
                               '--angle': `${angle}deg`,
                               animation: `laser-shoot 1.5s cubic-bezier(0.2, 1, 0.3, 1) forwards`,
                               animationDelay: `${Math.random() * 0.5}s`
                             } as React.CSSProperties}
                           />
                         )
                      })}
                    </div>

                    {/* Linhas Animadas - Dark Theme */}
                    <div 
                      className="absolute inset-0 w-full h-full pointer-events-none z-20 hidden dark:block animate-[laser-fade-out_0.5s_ease-out_forwards_1.5s]" 
                      style={{ 
                        WebkitMaskImage: 'url(/nexus-logo-dark-theme.png)',
                        WebkitMaskSize: 'contain',
                        WebkitMaskPosition: 'center',
                        WebkitMaskRepeat: 'no-repeat',
                        maskImage: 'url(/nexus-logo-dark-theme.png)',
                        maskSize: 'contain',
                        maskPosition: 'center',
                        maskRepeat: 'no-repeat',
                      }}
                    >
                      {Array.from({ length: 60 }).map((_, i) => {
                         const angle = (360 / 60) * i;
                         return (
                           <div 
                             key={`dark-${i}`}
                             className="absolute left-1/2 top-1/2 w-[2px] h-[30px] bg-gradient-to-b from-violet-400 to-cyan-300 origin-top shadow-[0_0_8px_rgba(139,92,246,0.8)]"
                             style={{
                               '--angle': `${angle}deg`,
                               animation: `laser-shoot 1.5s cubic-bezier(0.2, 1, 0.3, 1) forwards`,
                               animationDelay: `${Math.random() * 0.5}s`
                             } as React.CSSProperties}
                           />
                         )
                      })}
                    </div>

                    {/* Logo Final */}
                    <img 
                      src="/nexus-logo.png" 
                      alt="Nexus Logo" 
                      className="absolute inset-0 h-16 w-full object-contain drop-shadow-md transform transition-transform hover:scale-105 block dark:hidden animate-[nexus-logo-reveal_2s_ease-out_forwards]"
                    />
                    <img 
                      src="/nexus-logo-dark-theme.png" 
                      alt="Nexus Logo" 
                      className="absolute inset-0 h-16 w-full object-contain drop-shadow-md transform transition-transform hover:scale-105 hidden dark:block animate-[nexus-logo-reveal_2s_ease-out_forwards]"
                    />
                </div>
              </div>
              <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-2 font-medium">Controle Integrado de Demandas</p>
          </div>
            {isRecovery ? (
            <form onSubmit={handleResetPasswordRequest} className="space-y-5 animate-in fade-in slide-in-from-top-2 duration-300">
               <div className="space-y-2">
                <label className="text-xs font-bold text-zinc-600 dark:text-zinc-400 uppercase tracking-wider ml-1">E-mail para Recuperação</label>
                <input
                  type="email"
                  required
                  placeholder="seu@email.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full px-4 py-3 bg-white/50 dark:bg-zinc-950/50 border border-zinc-200 dark:border-zinc-800 rounded-xl text-sm text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 transition-all"
                />
              </div>
              
              <button 
                  type="submit"
                  disabled={loading}
                  className="relative w-full py-3 px-4 bg-gradient-to-r from-violet-600 to-cyan-500 hover:from-violet-700 hover:to-cyan-600 text-white rounded-xl text-sm font-semibold shadow-lg shadow-violet-500/25 hover:shadow-xl transition-all disabled:opacity-50 mt-6"
              >
                {loading ? (
                    <div className="flex items-center justify-center gap-2">
                        <Loader2 className="w-5 h-5 animate-spin" />
                        <span>Enviando...</span>
                    </div>
                ) : (
                    <span>Enviar E-mail de Recuperação</span>
                )}
              </button>

              <button 
                  type="button"
                  onClick={() => setIsRecovery(false)}
                  className="w-full text-center text-sm text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200 transition-colors"
              >
                  Voltar para o Login
              </button>
            </form>
          ) : (
            <>
              <form onSubmit={handleLogin} className="space-y-5">
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-zinc-600 dark:text-zinc-400 uppercase tracking-wider ml-1">Email</label>
                    <input
                      type="email"
                      required
                      placeholder="seu@email.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="w-full px-4 py-3 bg-white/50 dark:bg-zinc-950/50 border border-zinc-200 dark:border-zinc-800 rounded-xl text-sm text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 transition-all placeholder:text-zinc-400 dark:placeholder:text-zinc-600"
                    />
                  </div>

                  {isSignUp && (
                      <div className="grid grid-cols-2 gap-4 animate-in fade-in slide-in-from-top-2 duration-300">
                          <div className="space-y-2">
                              <label className="text-xs font-bold text-zinc-600 dark:text-zinc-400 uppercase tracking-wider ml-1">Nome</label>
                              <input
                                  type="text"
                                  required
                                  placeholder="João"
                                  value={nome}
                                  onChange={(e) => setNome(e.target.value)}
                                  className="w-full px-4 py-3 bg-white/50 dark:bg-zinc-950/50 border border-zinc-200 dark:border-zinc-800 rounded-xl text-sm text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 transition-all placeholder:text-zinc-400 dark:placeholder:text-zinc-600"
                              />
                          </div>
                          <div className="space-y-2">
                              <label className="text-xs font-bold text-zinc-600 dark:text-zinc-400 uppercase tracking-wider ml-1">Sobrenome</label>
                              <input
                                  type="text"
                                  required
                                  placeholder="Silva"
                                  value={sobrenome}
                                  onChange={(e) => setSobrenome(e.target.value)}
                                  className="w-full px-4 py-3 bg-white/50 dark:bg-zinc-950/50 border border-zinc-200 dark:border-zinc-800 rounded-xl text-sm text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 transition-all placeholder:text-zinc-400 dark:placeholder:text-zinc-600"
                              />
                          </div>
                      </div>
                  )}

                  {isSignUp && (
                      <div className="space-y-2 animate-in fade-in slide-in-from-top-2 duration-300">
                          <label className="text-xs font-bold text-zinc-600 dark:text-zinc-400 uppercase tracking-wider ml-1">CPF</label>
                          <input
                              type="text"
                              required
                              placeholder="000.000.000-00"
                              value={cpf}
                              onChange={(e) => setCpf(formatCPF(e.target.value))}
                              className="w-full px-4 py-3 bg-white/50 dark:bg-zinc-950/50 border border-zinc-200 dark:border-zinc-800 rounded-xl text-sm text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 transition-all placeholder:text-zinc-400 dark:placeholder:text-zinc-600"
                          />
                      </div>
                  )}
                  
                  <div className="space-y-2">
                    <div className="flex items-center justify-between ml-1">
                        <label className="text-xs font-bold text-zinc-600 dark:text-zinc-400 uppercase tracking-wider">Senha</label>
                        {!isSignUp && (
                          <button 
                            type="button"
                            onClick={() => setIsRecovery(true)}
                            className="text-xs font-medium text-blue-600 dark:text-blue-400 hover:underline"
                          >
                            Esqueceu?
                          </button>
                        )}
                    </div>
                    <input
                      type="password"
                      required
                      placeholder="••••••••"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="w-full px-4 py-3 bg-white/50 dark:bg-zinc-950/50 border border-zinc-200 dark:border-zinc-800 rounded-xl text-sm text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 transition-all placeholder:text-zinc-400 dark:placeholder:text-zinc-600"
                    />
                  </div>
                  
                  <button 
                      type="submit"
                      disabled={loading}
                      className="relative w-full py-3 px-4 bg-gradient-to-r from-violet-600 to-cyan-500 hover:from-violet-700 hover:to-cyan-600 text-white rounded-xl text-sm font-semibold shadow-lg shadow-violet-500/25 hover:shadow-xl hover:shadow-violet-500/40 hover:-translate-y-0.5 transition-all disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none overflow-hidden mt-6"
                  >
                    {loading ? (
                        <div className="flex items-center justify-center gap-2">
                            <Loader2 className="w-5 h-5 animate-spin" />
                            <span>Processando...</span>
                        </div>
                    ) : (
                        <span>{isSignUp ? 'Criar Conta' : 'Entrar na Plataforma'}</span>
                    )}
                  </button>
              </form>

              <p className="text-center mt-8 text-sm text-zinc-600 dark:text-zinc-400">
                  {isSignUp ? 'Já tem conta?' : 'Ainda não tem acesso?'}
                  {' '}
                  <button 
                      type="button"
                      onClick={() => setIsSignUp(!isSignUp)}
                      className="text-blue-600 dark:text-blue-400 font-semibold hover:text-blue-700 dark:hover:text-blue-300 transition-colors focus:outline-none"
                  >
                      {isSignUp ? 'Faça Login' : 'Cadastre-se aqui'}
                  </button>
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  )
}