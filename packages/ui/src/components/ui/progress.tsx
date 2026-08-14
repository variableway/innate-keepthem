// @shadcn-version: 2.3.0
// @last-sync: 2026-04-23
// @upstream: https://github.com/shadcn-ui/ui
// @custom-modifications: base-ui rewrite

'use client'

import * as React from 'react'
import { Progress as ProgressPrimitive } from '@base-ui/react/progress'

import { cn } from '../../lib/utils'

function Progress({
  className,
  value,
  ...props
}: React.ComponentProps<typeof ProgressPrimitive.Root>) {
  return (
    <ProgressPrimitive.Root
      data-slot="progress"
      className={cn(
        'bg-primary/20 relative h-2 w-full overflow-hidden rounded-full',
        className,
      )}
      {...props}
    >
      <ProgressPrimitive.Track className="h-full w-full">
        <ProgressPrimitive.Indicator
          data-slot="progress-indicator"
          className="bg-primary h-full w-full flex-1 transition-all"
          style={{ translate: `-${100 - (value || 0)}%` }}
        />
      </ProgressPrimitive.Track>
    </ProgressPrimitive.Root>
  )
}

export { Progress }
