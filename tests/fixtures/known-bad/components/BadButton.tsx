import React from 'react';

// A button that drifts from the design system in three measurable ways.
// Each style property below is a deterministic, raw-literal violation the
// checker must catch (US3 acceptance scenario 1):
//   - color:        a raw hex colour, not an approved token
//   - fontSize:     a size off the approved type scale
//   - borderRadius: a radius not in the approved set
export function BadButton({ label }: { label: string }) {
  return (
    <button
      style={{
        color: '#FF0000',
        fontSize: '13px',
        borderRadius: '99px',
      }}
    >
      {label}
    </button>
  );
}
