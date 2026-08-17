import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

/**
 * Utilitário para mesclar classes Tailwind CSS de forma inteligente.
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Formata valores numéricos para o padrão de moeda brasileiro (R$).
 */
export function formatCurrency(value: number | string | null | undefined): string {
    if (value === null || value === undefined) return 'R$ 0,00'
    const numericValue = typeof value === 'string' ? parseFloat(value) : value
    if (isNaN(numericValue)) return 'R$ 0,00'
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(numericValue)
}

/**
 * Alias para compatibilidade com código legado.
 */
export const formatarMoeda = formatCurrency;

/**
 * Converte qualquer valor (string, número ou formatado em PT-BR) para um Number seguro do JavaScript.
 * Ideal para tratar retornos instáveis de IAs.
 */
export function parseMonetaryValue(value: any): number {
    if (value === null || value === undefined) return 0;
    if (typeof value === 'number') return value;
    
    try {
        // Converte para string e remove espaços e símbolo de moeda
        let s = String(value).replace(/[R$\s]/g, '').trim();
        
        // Se vazio após limpeza, retorna 0
        if (!s) return 0;
 
        // Lógica de detecção de formato:
        if (s.includes(',') && s.includes('.')) {
            // Possui ambos: identifica qual é o decimal pela posição do último
            if (s.lastIndexOf(',') > s.lastIndexOf('.')) {
                // Vírgula é decimal (padrão brasileiro: 1.234,56)
                s = s.replace(/\./g, '').replace(',', '.');
            } else {
                // Ponto é decimal (padrão americano: 1,234.56)
                s = s.replace(/,/g, '');
            }
        } else if (s.includes(',')) {
            // Possui apenas vírgula (ex: 1234,56 ou 1,83)
            // Em português, a vírgula é sempre decimal.
            s = s.replace(',', '.');
        } else if (s.includes('.')) {
            // Possui apenas ponto (ex: 1.833 ou 1.83)
            // Se o ponto for seguido por exatamente 3 dígitos (ex: 1.833, 10.000, 1.500)
            // tratamos como separador de milhar brasileiro (virando 1833, 10000, 1500)
            // Caso contrário (ex: 1.83, 1.5, 12.3456), tratamos como decimal americano.
            if (/^\d{1,3}(\.\d{3})+$/.test(s) || /\.\d{3}$/.test(s)) {
                s = s.replace(/\./g, '');
            }
        }
 
        const n = parseFloat(s);
        return isNaN(n) ? 0 : n;
    } catch (err) {
        console.error('[Utils] Erro ao parsear valor monetário:', value, err);
        return 0;
    }
}

/**
 * Converte valores financeiros em formato brasileiro de string para number no formato americano.
 */
export function parseBrazilianNumber(value: string | number | null | undefined): number {
    return parseMonetaryValue(value);
}

/**
 * Limpa uma string de moeda para conversão numérica (Legado, redireciona para parseMonetaryValue).
 */
export function cleanCurrency(value: any): number {
    return parseMonetaryValue(value);
}

/**
 * Gera um link para criar um evento no Google Agenda.
 */
export function gerarLinkGoogleCalendar(titulo: string, descricao: string, data: string) {
    const dataLimpa = data.replace(/-/g, '')
    // Horário padrão: 08:00 - 09:00
    const dates = `${dataLimpa}T110000Z/${dataLimpa}T120000Z` // UTC
    
    const params = new URLSearchParams({
      action: 'TEMPLATE',
      text: titulo,
      details: descricao,
      dates: dates,
    })
  
    return `https://calendar.google.com/calendar/render?${params.toString()}`
}

// --- DICIONÁRIOS E CONSTANTES DE NEGÓCIO ---

export const tiposDocumento = [
  'NOTA DE EMPENHO',
  'ORDEM DE FORNECIMENTO',
  'ORDEM DE COMPRA',
  'AUTORIZAÇÃO DE FORNECIMENTO',
  'PEDIDO DE COMPRA'
];

export const apresentacoes: Record<string, string> = {
  'CX': 'Caixa',
  'AMP': 'Ampola',
  'FRS': 'Frasco',
  'UN': 'Unidade',
  'PCT': 'Pacote',
  'BS': 'Bisnaga',
  'GL': 'Galão',
  'KIT': 'Kit',
  'COM': 'Comprimido'
};

export const categorias = [
    'Material de Consumo',
    'Material Hospitalar',
    'Material Odontológico',
    'Medicamentos',
    'Material de Limpeza',
    'Material de Expediente',
    'Outros'
];

export const volumes = [
    'Caixa',
    'Pacote',
    'Fardo',
    'Cartela',
    'Unidade Solta'
];

export const motivosPendencia = {
    'FATOR_CAIXA': 'Fator Caixa',
    'FALTA_ESTOQUE': 'Falta no Nosso Estoque (Interno)',
    'ENTREGA_PARCIAL': 'Entrega Parcial (Saldo Restante)',
    'INVALIDADO': 'Item danificado ou inválido',
    'ARREDONDAMENTO': 'Diferença de Arredondamento / Embalagem'
};

/**
 * Calcula a completude SESAU baseada nas regras de progresso e entregas.
 */
export function calculateSesauCompleteness(itens: any[], percent: number): 'SIM' | 'SIM_CONCLUIDA' | 'NAO' | 'NAO_CONCLUIDA' {
  if (!itens || itens.length === 0 || percent < 100) {
    return 'NAO';
  }

  const deliveries = itens.flatMap(item => (item.historico_entregas as any[]) || []);
  if (deliveries.length === 0) {
    return 'NAO';
  }

  const billedOnlyCount = deliveries.filter(d => d.itens_entregues === false).length;
  const physicalCount = deliveries.length - billedOnlyCount;

  if (physicalCount === 0) {
    return 'NAO_CONCLUIDA';
  } else if (billedOnlyCount === 0) {
    return 'SIM';
  } else {
    return 'SIM_CONCLUIDA';
  }
}

/**
 * Verifica se um empenho pertence ao Modo SESAU (seja por flag no banco ou pelo nome da entidade/emissor)
 */
export function isNotaModoSesau(nota: any): boolean {
  if (!nota) return false;
  if (nota.modo_sesau === true) return true;
  
  // Obter o nome da entidade/emissor de forma segura
  const entityName = (nota.entidades?.nome || nota.emissor || '').trim().toUpperCase();
  if (!entityName) return false;

  // Normalização para remover acentos e facilitar comparação case-insensitive
  const normalized = entityName.normalize("NFD").replace(/[\u0300-\u036f]/g, "");

  return (
    normalized.includes("FUNDO ESTADUAL DE SAUDE DO TOCANTINS") ||
    normalized.includes("SESAU/TO") ||
    normalized.includes("SESAU-TO") ||
    normalized.includes("SESAU - TO") ||
    normalized === "SESAU" ||
    (normalized.includes("SECRETARIA DE ESTADO DA SAUDE") && normalized.includes("TOCANTINS")) ||
    (normalized.includes("FUNDO ESTADUAL DE SAUDE") && normalized.includes("TOCANTINS"))
  );
}


const STATE_NAME_TO_UF: Record<string, string> = {
  ACRE: 'AC',
  ALAGOAS: 'AL',
  AMAPA: 'AP',
  AMAZONAS: 'AM',
  BAHIA: 'BA',
  CEARA: 'CE',
  DISTRITOFEDERAL: 'DF',
  ESPIRITOSANTO: 'ES',
  GOIAS: 'GO',
  MARANHAO: 'MA',
  MATOGROSSO: 'MT',
  MATOGROSSODOSUL: 'MS',
  MINASGERAIS: 'MG',
  PARA: 'PA',
  PARAIBA: 'PB',
  PARANA: 'PR',
  PERNAMBUCO: 'PE',
  PIAUI: 'PI',
  RIODEJANEIRO: 'RJ',
  RIOGRANDEDONORTE: 'RN',
  RIOGRANDEDOSUL: 'RS',
  RONDONIA: 'RO',
  RORAIMA: 'RR',
  SANTACATARINA: 'SC',
  SAOPAULO: 'SP',
  SERGIPE: 'SE',
  TOCANTINS: 'TO'
};

const UF_TO_REGION: Record<string, string> = {
  AC: 'Norte', AM: 'Norte', AP: 'Norte', PA: 'Norte', RO: 'Norte', RR: 'Norte', TO: 'Norte',
  AL: 'Nordeste', BA: 'Nordeste', CE: 'Nordeste', MA: 'Nordeste', PB: 'Nordeste', PE: 'Nordeste', PI: 'Nordeste', RN: 'Nordeste', SE: 'Nordeste',
  DF: 'Centro-Oeste', GO: 'Centro-Oeste', MS: 'Centro-Oeste', MT: 'Centro-Oeste',
  ES: 'Sudeste', MG: 'Sudeste', RJ: 'Sudeste', SP: 'Sudeste',
  PR: 'Sul', RS: 'Sul', SC: 'Sul'
};

export function normalizeState(rawState: string | null | undefined): string {
  if (!rawState) return '';
  
  let clean = rawState.toUpperCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, '')
    .replace(/[^A-Z]/g, '');
    
  clean = clean.replace(/^(ESTADODO|ESTADODA|ESTADODE|ESTADO)/, '');
  
  if (STATE_NAME_TO_UF[clean]) {
    return STATE_NAME_TO_UF[clean];
  }
  
  if (clean.length === 2 && UF_TO_REGION[clean]) {
    return clean;
  }
  
  for (const uf of Object.keys(UF_TO_REGION)) {
    if (clean.endsWith(uf)) {
      return uf;
    }
  }

  const rawCleaned = rawState.toUpperCase().replace(/[^A-Z]/g, '');
  for (const uf of Object.keys(UF_TO_REGION)) {
    if (rawCleaned.includes(uf)) {
      const regex = new RegExp(`\\b${uf}\\b`);
      if (regex.test(rawState.toUpperCase())) {
        return uf;
      }
    }
  }
  
  return clean.slice(0, 2);
}

export function getStateRegion(uf: string): string {
  return UF_TO_REGION[uf.toUpperCase()] || 'Norte';
}

export function sanitizeMunicipality(raw: string | null | undefined): string {
  if (!raw) return '';
  let clean = raw.trim();

  clean = clean.replace(/[\s-]{1,3}[a-zA-Z]{2}$/g, '').trim();
  clean = clean.replace(/\/([a-zA-Z]{2})$/g, '').trim();

  if (clean.toLowerCase().includes(' palmas') && clean.toLowerCase() !== 'palmas') {
    clean = clean.replace(/ palmas/gi, '').trim();
  }

  const lowerClean = clean.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  if (lowerClean === 'nao informado' || lowerClean === 'nao especificado' || lowerClean === 'null') {
    return '';
  }

  return clean.split(' ').map(word => {
    if (['de', 'do', 'da', 'dos', 'das', 'e'].includes(word.toLowerCase())) return word.toLowerCase();
    return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
  }).join(' ');
}

