import React from 'react';
import { token } from './tokens';

// US9 — authoritative checking. The "coral" reference below matches the token
// naming convention but is NOT a defined token (only teal, ink, and white
// exist). When the token set is authoritative this is a hard ERROR; otherwise
// it is an advisory warning. The teal reference is a defined token and must
// always pass.
export function AuthoritativeBad({ label }: { label: string }) {
  return (
    <span
      style={{
        backgroundColor: token('color.brand.teal'),
        color: token('color.brand.coral'),
      }}
    >
      {label}
    </span>
  );
}
