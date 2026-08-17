import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../AuthContext';
import { Loader2, ShieldAlert, Clock, LogOut } from 'lucide-react';
import { Button } from './ui/button';

export function ProtectedRoute({ children }: { children: React.ReactNode }) {
    const { session, profile, loading, signOut } = useAuth();
    const location = useLocation();

    if (loading) {
        return (
            <div className="min-h-screen flex flex-col items-center justify-center bg-zinc-50 dark:bg-zinc-950 text-zinc-500">
                <Loader2 className="w-8 h-8 animate-spin text-blue-600 mb-4" />
                <p className="text-sm font-medium animate-pulse">Carregando sessão...</p>
            </div>
        );
    }

    if (session && !profile) {
        return (
            <div className="min-h-screen flex flex-col items-center justify-center bg-zinc-50 dark:bg-zinc-950 text-zinc-500">
                <Loader2 className="w-8 h-8 animate-spin text-blue-600 mb-4" />
                <p className="text-sm font-medium animate-pulse">Carregando perfil...</p>
            </div>
        );
    }

    if (!session) {
        // Redireciona para o login salvando a URL atual para poder voltar depois
        return <Navigate to="/login" state={{ from: location }} replace />;
    }

    // Bloqueio de Acesso por Aprovação
    if (session && profile && (profile.status_aprovacao === 'PENDENTE' || profile.status_aprovacao === 'RECUSADO')) {
        const isPending = profile.status_aprovacao === 'PENDENTE';
        return (
            <div className="min-h-screen flex items-center justify-center bg-zinc-50 dark:bg-zinc-950 p-4 transition-colors">
                <div className="w-full max-w-md bg-white dark:bg-zinc-900 rounded-3xl border border-zinc-200 dark:border-zinc-800 shadow-xl overflow-hidden p-8 text-center space-y-6">
                    <div className="flex justify-center">
                        <div className={`p-4 rounded-2xl ${isPending ? 'bg-amber-50 text-amber-500 dark:bg-amber-950/20' : 'bg-red-50 text-red-500 dark:bg-red-950/20'} animate-pulse`}>
                            {isPending ? <Clock className="w-12 h-12" /> : <ShieldAlert className="w-12 h-12" />}
                        </div>
                    </div>
                    
                    <div className="space-y-2">
                        <h1 className="text-2xl font-black text-zinc-900 dark:text-white uppercase tracking-tight">
                            {isPending ? 'Acesso em Análise' : 'Acesso Recusado'}
                        </h1>
                        <p className="text-zinc-500 dark:text-zinc-400 text-sm leading-relaxed">
                            {isPending 
                                ? 'Seu cadastro no Nexus está aguardando a aprovação de um administrador. Assim que sua solicitação for aceita, seu acesso completo será liberado automaticamente.'
                                : 'Desculpe, mas sua solicitação de acesso à plataforma Nexus foi recusada por um administrador. Caso acredite que isso seja um engano, entre em contato com o suporte.'
                            }
                        </p>
                    </div>

                    <div className="pt-4 border-t border-zinc-100 dark:border-zinc-800 flex justify-center">
                        <Button 
                            variant="destructive" 
                            size="sm" 
                            onClick={() => signOut()} 
                            className="w-full gap-2 py-5 rounded-2xl font-bold uppercase text-xs tracking-wider"
                        >
                            <LogOut className="w-4 h-4" /> Sair da Conta
                        </Button>
                    </div>
                </div>
            </div>
        );
    }

    return <>{children}</>;
}
