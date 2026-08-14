// @shadcn-version: 2.3.0
// @last-sync: 2026-04-23
// @upstream: https://github.com/shadcn-ui/ui
// @custom-modifications: base-ui rewrite

'use client'

import * as React from 'react'

import { cn } from '../../lib/utils'

function AspectRatio({
  ratio = 16 / 9,
  className,
  children,
  ...props
}: React.ComponentProps<'div'> & { ratio?: number }) {
  return (
    <div
      data-slot="aspect-ratio"
      className={cn('relative w-full', className)}
      style={{ paddingBottom: `${(1 / ratio) * 100}%` }}
      {...props}
    >
      <div className="absolute inset-0">{children}</div>
    </div>
  )
}

export { AspectRatio }
