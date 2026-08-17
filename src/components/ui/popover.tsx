import * as React from 'react'
import ReactDOM from 'react-dom'
import { cn } from '@/lib/utils'

/**
 * Popover com portal — renderiza o conteúdo diretamente no document.body,
 * escapando de qualquer overflow:hidden de containers pai (como tabelas).
 */

interface PopoverContextValue {
  open: boolean
  onOpenChange: (v: boolean) => void
  triggerRef: React.MutableRefObject<HTMLElement | null>
}

const PopoverContext = React.createContext<PopoverContextValue>({
  open: false,
  onOpenChange: () => {},
  triggerRef: { current: null }
})

interface PopoverProps {
  open?: boolean
  onOpenChange?: (v: boolean) => void
  children: React.ReactNode
}

function Popover({ open = false, onOpenChange, children }: PopoverProps) {
  const triggerRef = React.useRef<HTMLElement | null>(null)

  // Fecha ao clicar fora (trigger ou conteúdo do portal)
  React.useEffect(() => {
    if (!open) return
    function handleMouseDown(e: MouseEvent) {
      const target = e.target as Node
      // Se clicou no trigger, ignora (o próprio toggle cuida)
      if (triggerRef.current?.contains(target)) return
      // Se clicou dentro de algum conteúdo de popover no portal, ignora
      const contents = document.querySelectorAll('[data-popover-portal]')
      for (const el of contents) {
        if (el.contains(target)) return
      }
      onOpenChange?.(false)
    }
    document.addEventListener('mousedown', handleMouseDown)
    return () => document.removeEventListener('mousedown', handleMouseDown)
  }, [open, onOpenChange])

  // Fecha ao pressionar Escape
  React.useEffect(() => {
    if (!open) return
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onOpenChange?.(false)
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [open, onOpenChange])

  return (
    <PopoverContext.Provider value={{ open, onOpenChange: onOpenChange ?? (() => {}), triggerRef }}>
      <div className="relative w-full">
        {children}
      </div>
    </PopoverContext.Provider>
  )
}

interface PopoverTriggerProps {
  asChild?: boolean
  children: React.ReactElement
}

function PopoverTrigger({ asChild, children }: PopoverTriggerProps) {
  const { open, onOpenChange, triggerRef } = React.useContext(PopoverContext)
  const child = React.Children.only(children) as React.ReactElement<any>

  const refCallback = (el: HTMLElement | null) => {
    triggerRef.current = el
    // Preserva o ref original do filho, se houver
    const origRef = (child as any).ref
    if (typeof origRef === 'function') origRef(el)
    else if (origRef && 'current' in origRef) origRef.current = el
  }

  if (asChild) {
    return React.cloneElement(child, {
      ref: refCallback,
      onClick: (e: React.MouseEvent) => {
        child.props.onClick?.(e)
        onOpenChange(!open)
      },
      'aria-expanded': open,
    })
  }

  return (
    <button
      ref={refCallback as React.RefCallback<HTMLButtonElement>}
      onClick={() => onOpenChange(!open)}
      aria-expanded={open}
    >
      {children}
    </button>
  )
}

interface PopoverContentProps extends React.HTMLAttributes<HTMLDivElement> {
  align?: 'start' | 'center' | 'end'
  sideOffset?: number
  children: React.ReactNode
}

function PopoverContent({
  className,
  align = 'start',
  sideOffset = 4,
  children,
  style,
  ...props
}: PopoverContentProps) {
  const { open, triggerRef } = React.useContext(PopoverContext)
  const [pos, setPos] = React.useState<{ top: number; left: number; width: number } | null>(null)
  const contentRef = React.useRef<HTMLDivElement>(null)

  React.useLayoutEffect(() => {
    if (!open || !triggerRef.current) {
      setPos(null)
      return
    }

    function compute() {
      const rect = triggerRef.current!.getBoundingClientRect()
      const scrollY = window.scrollY
      const scrollX = window.scrollX

      let left = rect.left + scrollX
      if (align === 'end') left = rect.right + scrollX - (contentRef.current?.offsetWidth ?? rect.width)
      if (align === 'center') left = rect.left + scrollX + rect.width / 2 - (contentRef.current?.offsetWidth ?? rect.width) / 2

      // Garante que não saia pela direita da viewport
      const maxLeft = window.innerWidth + scrollX - (contentRef.current?.offsetWidth ?? 200) - 8
      left = Math.min(left, maxLeft)
      left = Math.max(left, 8 + scrollX)

      setPos({
        top: rect.bottom + scrollY + sideOffset,
        left,
        width: rect.width,
      })
    }

    compute()

    window.addEventListener('scroll', compute, { passive: true })
    window.addEventListener('resize', compute)
    return () => {
      window.removeEventListener('scroll', compute)
      window.removeEventListener('resize', compute)
    }
  }, [open, align, sideOffset])

  if (!open) return null

  return ReactDOM.createPortal(
    <div
      ref={contentRef}
      data-popover-portal
      style={{
        position: 'absolute',
        top: pos?.top ?? 0,
        left: pos?.left ?? 0,
        minWidth: pos?.width ?? 'auto',
        zIndex: 9999,
        ...style,
      }}
      className={cn(
        'rounded-lg border border-zinc-200 bg-white dark:bg-zinc-950 dark:border-zinc-800 shadow-xl',
        'animate-in fade-in-0 zoom-in-95 duration-150',
        className
      )}
      {...props}
    >
      {children}
    </div>,
    document.body
  )
}

export { Popover, PopoverTrigger, PopoverContent }
