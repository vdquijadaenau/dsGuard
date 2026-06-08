import React from 'react';
import { colors, spacing, radius, typeScale } from './tokens';

// Conforms to the design system: every styled value is a token reference,
// never a raw colour, size, or radius literal (US3 acceptance scenario 2).
// The checker must report zero findings for this file.
export function GoodButton({ label }: { label: string }) {
  return (
    <button
      style={{
        color: colors['brand-teal'],
        padding: spacing.sm,
        fontSize: typeScale.body,
        borderRadius: radius.md,
      }}
    >
      {label}
    </button>
  );
}
