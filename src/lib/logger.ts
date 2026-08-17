import { supabase } from './supabase'

export async function logAction(
  action: string, 
  tableName: string, 
  recordId: string | number | null, 
  details?: any
) {
    try {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return

        const { error } = await supabase
            .from('audit_logs')
            .insert([{
                user_id: user.id,
                user_email: user.email,
                action,
                table_name: tableName,
                record_id: recordId ? String(recordId) : null,
                details: details || null
            }])

        if (error) console.error('Failed to save audit log:', error)
    } catch (err) {
        console.error('Audit logger error:', err)
    }
}
