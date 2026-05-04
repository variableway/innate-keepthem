// @shadcn-version: 2.3.0
// @last-sync: 2026-04-23
// @upstream: https://github.com/shadcn-ui/ui
// @custom-modifications: base-ui rewrite

'use client'

import * as React from 'react'

import { cn } from '../../lib/utils'

interface AvatarProps extends React.HTMLAttributes<HTMLDivElement> {
  children?: React.ReactNode
}

function Avatar({ className, ...props }: AvatarProps) {
  return (
    <div
      data-slot="avatar"
      className={cn(
        'relative flex size-8 shrink-0 overflow-hidden rounded-full',
        className,
      )}
      {...props}
    />
  )
}

interface AvatarImageProps extends React.ImgHTMLAttributes<HTMLImageElement> {
  onLoadingStatusChange?: (status: 'loading' | 'loaded' | 'error') => void
}

const AvatarImage = React.forwardRef<HTMLImageElement, AvatarImageProps>(
  ({ className, onLoadingStatusChange, ...props }, ref) => {
    const handleLoad = React.useCallback(() => {
      onLoadingStatusChange?.('loaded')
    }, [onLoadingStatusChange])

    const handleError = React.useCallback(() => {
      onLoadingStatusChange?.('error')
    }, [onLoadingStatusChange])

    React.useEffect(() => {
      onLoadingStatusChange?.('loading')
    }, [onLoadingStatusChange, props.src])

    return (
      <img
        ref={ref}
        data-slot="avatar-image"
        className={cn('aspect-square size-full', className)}
        onLoad={handleLoad}
        onError={handleError}
        {...props}
      />
    )
  },
)
AvatarImage.displayName = 'AvatarImage'

function AvatarFallback({
  className,
  delayMs = 0,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & { delayMs?: number }) {
  const [canRender, setCanRender] = React.useState(delayMs === 0)

  React.useEffect(() => {
    if (delayMs > 0) {
      const timer = setTimeout(() => setCanRender(true), delayMs)
      return () => clearTimeout(timer)
    }
  }, [delayMs])

  if (!canRender) return null

  return (
    <div
      data-slot="avatar-fallback"
      className={cn(
        'bg-muted flex size-full items-center justify-center rounded-full',
        className,
      )}
      {...props}
    />
  )
}

export { Avatar, AvatarImage, AvatarFallback }
