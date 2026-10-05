/** Operator details for the legal pages — see the note in ./layout.tsx. */
export const legal = {
  entity: () => process.env.LEGAL_ENTITY_NAME || "[Operator legal name]",
  address: () => process.env.LEGAL_ENTITY_ADDRESS || "[Registered address]",
  email: () => process.env.SUPPORT_EMAIL || "[support email]",
  updated: "5 October 2026",
};
