/* eslint-disable @typescript-eslint/ban-ts-comment, @typescript-eslint/no-explicit-any */
// @ts-nocheck
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Variáveis de Cache (Ficam na memória enquanto o servidor estiver 'morno')
let cachedFlashModel = "gemini-1.5-flash";
let cachedProModel = "gemini-1.5-pro";
let lastDiscoveryTime = 0;

/**
 * Tenta reparar um JSON truncado pelo limite de tokens do modelo.
 * Estratégia: remove o último elemento incompleto do array e fecha as estruturas abertas.
 * Retorna o JSON reparado como string, ou null se não conseguir reparar.
 */
function repairTruncatedJson(raw: string): string | null {
  try {
    let repaired = raw.trimEnd();

    // Passo 1: Localiza a última chave de fechamento
    const lastCompleteObjEnd = repaired.lastIndexOf('}');
    if (lastCompleteObjEnd !== -1) {
      repaired = repaired.substring(0, lastCompleteObjEnd + 1);
    }

    // Passo 2: Fecha as estruturas abertas na ordem correta usando uma pilha (stack)
    const stack: ('{' | '[')[] = [];
    let inString = false;
    let prevChar = '';

    for (let i = 0; i < repaired.length; i++) {
      const ch = repaired[i];
      if (ch === '"' && prevChar !== '\\') {
        inString = !inString;
      }
      if (!inString) {
        if (ch === '{') {
          stack.push('{');
        } else if (ch === '}') {
          if (stack[stack.length - 1] === '{') stack.pop();
        } else if (ch === '[') {
          stack.push('[');
        } else if (ch === ']') {
          if (stack[stack.length - 1] === '[') stack.pop();
        }
      }
      prevChar = ch;
    }

    let closing = '';
    if (inString) {
      closing += '"';
    }

    // Se terminar com vírgula pendente, remove
    if (repaired.endsWith(',')) {
      repaired = repaired.slice(0, -1);
    }

    // Desempilha e fecha cada estrutura na ordem inversa (LIFO)
    while (stack.length > 0) {
      const open = stack.pop();
      if (open === '{') closing += '}';
      else if (open === '[') closing += ']';
    }

    repaired += closing;

    // Valida se o resultado é um JSON válido
    JSON.parse(repaired);
    return repaired;
  } catch {
    return null;
  }
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const { fileBase64, imagesBase64, textContent, mimeType, prompt, responseSchema, model } = await req.json()
    const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY')

    if (!GEMINI_API_KEY) throw new Error('GEMINI_API_KEY não configurada no Supabase.')

    // --- 1. DESCOBERTA DINÂMICA E ECONÔMICA ---
    const isProRequested = model === 'pro' || model === 'gemini-1.5-pro-latest' || model === 'gemini-1.5-pro';
    const isFlashRequested = !model || model === 'flash' || model === 'default' || model === 'gemini-flash' || model === 'gemini-1.5-flash';

    let activeModel = "";
    if (isProRequested) {
        activeModel = cachedProModel || "gemini-1.5-pro";
    } else if (isFlashRequested) {
        activeModel = cachedFlashModel || "gemini-1.5-flash";
    } else {
        activeModel = model;
    }

    const now = Date.now();

    // Se não temos cache ou o cache expirou (1 hora), buscamos a lista oficial
    if (
        (isProRequested && (!cachedProModel || cachedProModel === "gemini-1.5-pro")) ||
        (isFlashRequested && (!cachedFlashModel || cachedFlashModel === "gemini-1.5-flash")) ||
        (now - lastDiscoveryTime > 3600000)
    ) {
        console.log("[AI] Escaneando modelos disponíveis na conta para melhor custo-benefício...")
        try {
            const modelsResponse = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${GEMINI_API_KEY}`)
            const modelsData = await modelsResponse.json()
            const allModels = modelsData.models || [];
            
            // Filtramos apenas a linha 'Flash' (Barata/Rápida) ignorando modelos experimentais (-exp/-preview)
            const availableFlashModels = allModels
                .filter(m => {
                    const nameLower = m.name.toLowerCase();
                    return nameLower.includes('flash') && 
                           !nameLower.includes('omni') && 
                           !nameLower.includes('interactive') && 
                           !nameLower.includes('interaction') &&
                           !nameLower.includes('exp') &&
                           !nameLower.includes('preview') &&
                           m.supportedGenerationMethods.includes('generateContent');
                })
                .map(m => m.name.replace('models/', ''))
                .sort((a, b) => b.localeCompare(a)); // Prioriza versões mais novas

            // Filtramos apenas a linha 'Pro' (Mais inteligente/robusta)
            const availableProModels = allModels
                .filter(m => {
                    const nameLower = m.name.toLowerCase();
                    return nameLower.includes('pro') && 
                           !nameLower.includes('omni') && 
                           !nameLower.includes('interactive') && 
                           !nameLower.includes('interaction') &&
                           !nameLower.includes('exp') &&
                           !nameLower.includes('preview') &&
                           m.supportedGenerationMethods.includes('generateContent');
                })
                .map(m => m.name.replace('models/', ''))
                .sort((a, b) => b.localeCompare(a)); // Prioriza versões mais novas

            if (availableFlashModels.length > 0) {
                cachedFlashModel = availableFlashModels[0];
            } else {
                cachedFlashModel = "gemini-1.5-flash"; 
            }

            if (availableProModels.length > 0) {
                cachedProModel = availableProModels[0];
            } else {
                cachedProModel = "gemini-1.5-pro"; 
            }

            lastDiscoveryTime = now;
            console.log(`[AI] Descoberta concluída. Flash: ${cachedFlashModel}, Pro: ${cachedProModel}`);
            
            if (isProRequested) {
                activeModel = cachedProModel;
            } else if (isFlashRequested) {
                activeModel = cachedFlashModel;
            }
        } catch (err: any) {
            console.error("[AI] Falha na descoberta de modelos, usando fallback estável:", err.message);
            cachedFlashModel = "gemini-1.5-flash";
            cachedProModel = "gemini-1.5-pro";
            if (isProRequested) {
                activeModel = cachedProModel;
            } else if (isFlashRequested) {
                activeModel = cachedFlashModel;
            }
        }
    }

    if (activeModel === 'flash' || activeModel === 'default' || !activeModel) {
        activeModel = cachedFlashModel || 'gemini-1.5-flash';
    } else if (activeModel === 'pro') {
        activeModel = cachedProModel || 'gemini-1.5-pro';
    }

    const defaultSystemPrompt = `Você é um robô extrator de dados de alta precisão. 
Sua tarefa é extrair os dados do documento para o formato JSON solicitado. 
REGRAS CRÍTICAS:
1. RESPONDA APENAS COM O JSON PURO. 
2. NÃO ADICIONE EXPLICAÇÕES, INTRODUÇÕES OU CONCLUSÕES.
3. NÃO USE MARCADORES DE CÓDIGO COMO \`\`\`json.
4. SE NÃO ENCONTRAR UM CAMPO, DEIXE-O COMO NULL OU VAZIO.
5. SIGA RIGOROSAMENTE O ESQUEMA SOLICITADO PELO USUÁRIO.
6. Extraia todos os itens da tabela. Tente identificar a qual fornecedor/empresa o item pertence (olhando os cabeçalhos) e preencha o campo fornecedor. Se não conseguir identificar na página, deixe o campo fornecedor vazio.
7. ECONOMIA DE TOKENS (OBRIGATÓRIO): Retorne o JSON de forma ESTRITAMENTE MINIFICADA. NÃO use quebras de linha, NÃO use recuos ou indentação. O JSON deve ser uma única string contínua sem espaços desnecessários.`

    const activePrompt = prompt || defaultSystemPrompt

    // --- 2. EXECUÇÃO DA EXTRAÇÃO ---
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${activeModel}:generateContent?key=${GEMINI_API_KEY}`
    
    let parts: any[] = [];
    if (imagesBase64 && Array.isArray(imagesBase64) && imagesBase64.length > 0) {
      parts = [
        { text: activePrompt },
        ...imagesBase64.map((b64: string) => ({
          inline_data: { mime_type: 'image/jpeg', data: b64.replace(/^data:image\/\w+;base64,/, '') }
        }))
      ];
    } else if (textContent && textContent.length > 100) {
      parts = [{ text: `${activePrompt}\n\nCONTEÚDO DO DOCUMENTO:\n${textContent}` }];
    } else {
      parts = [{ text: activePrompt }, { inline_data: { mime_type: mimeType || 'application/pdf', data: fileBase64 } }];
    }

    console.log(`[AI] Iniciando processamento com ${activeModel}...`)
    
    let response;
    let data;
    let attempts = 0;
    const maxAttempts = 2;

    while (attempts < maxAttempts) {
        attempts++;
        response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                contents: [{ parts }],
                safetySettings: [
                    { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_NONE" },
                    { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_NONE" },
                    { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_NONE" },
                    { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_NONE" }
                ],
                generationConfig: {
                    maxOutputTokens: 16384, // Aumentado de 8192 → 16384 para evitar truncamento
                    temperature: 0.1,
                    responseMimeType: "application/json",
                    ...(responseSchema ? { responseSchema } : {})
                }
            })
        });

        data = await response.json();

        const isRateLimit = response.status === 429 || (response.status === 400 && (
            (data.error?.message || '').includes('RESOURCE_EXHAUSTED') ||
            (data.error?.message || '').includes('Quota') ||
            (data.error?.message || '').includes('quota') ||
            (data.error?.message || '').includes('rate limit')
        ));

        if (isRateLimit && attempts < maxAttempts) {
            console.warn(`[AI] Cota temporária atingida (${response.status}). Tentativa ${attempts} de ${maxAttempts}. Aguardando 1.5s...`);
            await new Promise(resolve => setTimeout(resolve, 1500));
        } else {
            break;
        }
    }

    if (response.ok) {
        if (!data.candidates?.[0]?.content?.parts?.[0]?.text) {
            const finishReason = data.candidates?.[0]?.finishReason || "UNKNOWN";
            console.error("[AI Error] Raw response:", JSON.stringify(data));
            throw new Error(`A IA não retornou um conteúdo válido (finishReason: ${finishReason}). Verifique o arquivo.`)
        }
        const rawText = data.candidates[0].content.parts[0].text
        
        // Limpa blocos de markdown de código (```json) que o LLM insiste em mandar
        let cleanText = rawText.replace(/```json/g, '').replace(/```/g, '').trim();

        // Se ainda houver texto antes/depois do JSON, garantimos pegando o que está entre chaves
        const firstBrace = cleanText.indexOf('{');
        const lastBrace = cleanText.lastIndexOf('}');
        if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
            cleanText = cleanText.substring(firstBrace, lastBrace + 1);
        }

        // Verifica se o modelo parou por limite de tokens (finish_reason = MAX_TOKENS)
        const finishReason = data.candidates[0]?.finishReason;
        const wasTokenLimited = finishReason === 'MAX_TOKENS';
        if (wasTokenLimited) {
            console.warn(`[AI] ATENÇÃO: Resposta truncada por limite de tokens (finishReason: ${finishReason}). Tentando reparo...`);
        }

        try {
            const parsedJson = JSON.parse(cleanText.trim());

            return new Response(JSON.stringify(parsedJson), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            })
        } catch (parseError: any) {
            console.error("FALHA DE PARSE. Tentando reparo do JSON truncado...", parseError.message);

            // --- REPARO AUTOMÁTICO DE JSON TRUNCADO ---
            const repairedText = repairTruncatedJson(cleanText);

            if (repairedText) {
                try {
                    const repairedJson = JSON.parse(repairedText);
                    console.log("[AI] Reparo bem-sucedido! Retornando JSON parcial com flag is_partial=true.");

                    // Injeta a flag de parcialidade para o cliente poder fazer retry
                    repairedJson.is_partial = true;

                    return new Response(JSON.stringify(repairedJson), {
                        status: 206, // 206 Partial Content — indica ao cliente que o dado está incompleto
                        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                    })
                } catch {
                    console.error("[AI] Reparo falhou. JSON irrecuperável.");
                }
            }

            // Se o reparo também falhar, retorna o erro com snippet para debug
            const snippet = cleanText.substring(Math.max(0, cleanText.length - 300));

            return new Response(
                JSON.stringify({ 
                    error: `Falha ao processar o JSON. Erro: ${parseError.message}`,
                    snippet: snippet,
                    raw_length: cleanText.length
                }),
                { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }
    } else {
        const errStatus = response.status
        const errMsg = data.error?.message || "Erro desconhecido na Google API"
        
        // Tratamento Inteligente de Cota (429)
        if (errStatus === 429 || errMsg.includes('RESOURCE_EXHAUSTED') || errMsg.includes('quota') || errMsg.includes('Quota')) {
            const retryAt = new Date(Date.now() + 35000).toLocaleTimeString('pt-BR')
            return new Response(
                JSON.stringify({ error: `Cota temporária atingida. Para manter o custo baixo, a Google pede um intervalo. Tente novamente às ${retryAt}.` }),
                { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            )
        }
        
        throw new Error(`[IA ${activeModel}] Erro ${errStatus}: ${errMsg}`)
    }

  } catch (error: any) {
    console.error("Erro Final:", error.message)
    return new Response(JSON.stringify({ error: error.message }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
