import { useState, useEffect, useRef, memo } from 'react'
import { supabase } from '../../lib/supabase'
import { Search, Loader2 } from 'lucide-react'
import { Input } from './input'
import { cn } from '../../lib/utils'

interface Product {
  id: number
  codigo_interno: string
  descricao_completa: string
  descricao_resumida: string | null
  unidade_venda: string | null
  unidade_compra: string | null
  marca: string | null
  fabricante: string | null
  grupo: string | null
  classe: string | null
}

interface ProductAutocompleteProps {
  onSelect: (product: Product) => void
  onChange?: (value: string) => void
  placeholder?: string
  defaultValue?: string
  className?: string
  inputClassName?: string
}

export const ProductAutocomplete = memo(function ProductAutocomplete({
  onSelect,
  onChange,
  placeholder = 'Buscar produto...',
  defaultValue = '',
  className = '',
  inputClassName = ''
}: ProductAutocompleteProps) {
  const [query, setQuery] = useState(defaultValue)
  const [results, setResults] = useState<Product[]>([])
  const [loading, setLoading] = useState(false)
  const [isOpen, setIsOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  // Keep local query sync with defaultValue if it changes from parent
  useEffect(() => {
    setQuery(defaultValue)
  }, [defaultValue])

  // Handle click outside to close results dropdown
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // Debounced search
  useEffect(() => {
    if (!isOpen) {
      return
    }

    if (!query || query.trim().length < 2) {
      setResults([])
      return
    }

    setLoading(true)
    const delayDebounce = setTimeout(async () => {
      try {
        const search = query.trim()
        const { data, error } = await supabase
          .from('catalogo_produtos')
          .select('*')
          .or(`codigo_interno.ilike.%${search}%,descricao_completa.ilike.%${search}%,descricao_resumida.ilike.%${search}%`)
          .limit(8)

        if (error) throw error
        setResults(data || [])
      } catch (err) {
        console.error('Error fetching autocomplete products:', err)
      } finally {
        setLoading(false)
      }
    }, 250) // 250ms debounce

    return () => clearTimeout(delayDebounce)
  }, [query, isOpen])

  const handleSelectProduct = (product: Product) => {
    setQuery(product.descricao_completa)
    setIsOpen(false)
    onSelect(product)
  }

  return (
    <div ref={containerRef} className={cn("relative w-full", className)}>
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-400" />
        <Input
          type="text"
          placeholder={placeholder}
          value={query}
          onChange={(e) => {
            const val = e.target.value
            setQuery(val)
            setIsOpen(true)
            if (onChange) {
              onChange(val)
            }
          }}
          onFocus={() => setIsOpen(true)}
          className={cn("pl-8 h-9 text-xs font-semibold bg-white dark:bg-zinc-950", inputClassName)}
        />
        {loading && (
          <Loader2 className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-400 animate-spin" />
        )}
      </div>

      {isOpen && (results.length > 0 || (query.trim().length >= 2 && !loading)) && (
        <div className="absolute left-0 right-0 z-50 mt-1 max-h-[220px] overflow-y-auto bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl shadow-xl scrollbar-thin">
          {results.length === 0 ? (
            <div className="p-3 text-center text-xs text-zinc-400 italic">
              Nenhum produto encontrado
            </div>
          ) : (
            results.map((product) => (
              <button
                key={product.id}
                type="button"
                onClick={() => handleSelectProduct(product)}
                className="w-full text-left px-3.5 py-2.5 hover:bg-zinc-50 dark:hover:bg-zinc-800/80 transition-all border-b border-zinc-100 dark:border-zinc-800 last:border-b-0 flex flex-col gap-0.5"
              >
                <div className="text-xs font-bold text-zinc-800 dark:text-zinc-200 line-clamp-2">
                  {product.descricao_completa}
                </div>
                <div className="flex items-center justify-between text-[9px] text-zinc-400 font-medium">
                  <span>Cód: <strong className="font-mono text-brand-accent">{product.codigo_interno}</strong></span>
                  <span>{product.grupo} {product.unidade_venda ? `(${product.unidade_venda})` : ''}</span>
                </div>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  )
}, (prevProps, nextProps) => {
  return prevProps.defaultValue === nextProps.defaultValue &&
         prevProps.placeholder === nextProps.placeholder &&
         prevProps.className === nextProps.className &&
         prevProps.inputClassName === nextProps.inputClassName;
})
