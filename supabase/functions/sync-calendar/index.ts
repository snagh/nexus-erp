/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck - Deno Edge Function (types not available in local Node.js environment)
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const { note_id, provider_token } = await req.json()

    // 1. Get Note details from DB
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const { data: nota, error: notaError } = await supabase
      .from('notas')
      .select('*')
      .eq('id', note_id)
      .single()

    if (notaError || !nota) throw new Error('Nota não encontrada')

    const events = []

    // Evento 1: Vencimento do Empenho
    if (nota.data_validade) {
        events.push({
            summary: `🚨 VENCIMENTO: ${nota.tipo_documento} #${nota.numero_ne}`,
            description: `Órgão: ${nota.emissor}\nValor: R$ ${nota.valor_total_teto}\n\n*Aviso automático do Sistema de Demandas*`,
            start: { date: nota.data_validade },
            end: { date: nota.data_validade },
            reminders: {
                useDefault: false,
                overrides: [
                    { method: 'popup', minutes: 2880 }, // 2 dias antes
                    { method: 'popup', minutes: 1440 }, // 1 dia antes
                ]
            }
        })
    }

    // Evento 2: Prazo Setor de Compras
    if (nota.data_prazo_compras) {
        events.push({
            summary: `🛒 PRAZO COMPRAS: Doc #${nota.numero_ne}`,
            description: `Cobrar compradores sobre o que falta no estoque para o órgão ${nota.emissor}.`,
            start: { date: nota.data_prazo_compras },
            end: { date: nota.data_prazo_compras },
            reminders: {
                useDefault: false,
                overrides: [
                    { method: 'popup', minutes: 60 }, // 1 hora antes (exemplo de alerta no dia)
                ]
            }
        })
    }

    // 2. Sync with Google Calendar API
    const results = []
    for (const event of events) {
        const res = await fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${provider_token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(event)
        })

        if (!res.ok) {
            const errText = await res.text()
            console.error('Google API Error:', errText)
            results.push({ summary: event.summary, success: false, error: errText })
        } else {
            results.push({ summary: event.summary, success: true })
        }
    }

    return new Response(JSON.stringify({ results }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    })

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    return new Response(JSON.stringify({ error: errorMessage }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    })
  }
})
