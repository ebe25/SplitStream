// VPA @suffix → provider app. Source: NPCI TPAP register, verified in
// docs/adr/0002-multi-vpa-and-notification-capture.md — update from the
// register when an unknown suffix shows up.
export const vpaProviders: Record<string, string> = {
  // Google Pay
  okaxis: 'Google Pay',
  okhdfcbank: 'Google Pay',
  okicici: 'Google Pay',
  oksbi: 'Google Pay',
  okbizaxis: 'Google Pay',
  // PhonePe
  ybl: 'PhonePe',
  ibl: 'PhonePe',
  axl: 'PhonePe',
  phonepe: 'PhonePe',
  // Paytm
  paytm: 'Paytm',
  ptyes: 'Paytm',
  ptaxis: 'Paytm',
  pthdfc: 'Paytm',
  ptsbi: 'Paytm',
  // Amazon Pay
  rapl: 'Amazon Pay',
  yapl: 'Amazon Pay',
  apl: 'Amazon Pay',
  // CRED (NOT yescurie — that is Curie Money)
  axisb: 'CRED',
  yescred: 'CRED',
  // WhatsApp Pay
  waicici: 'WhatsApp Pay',
  icici: 'WhatsApp Pay',
  waaxis: 'WhatsApp Pay',
  wasbi: 'WhatsApp Pay',
  wahdfcbank: 'WhatsApp Pay',
  // Navi
  naviaxis: 'Navi',
  nyes: 'Navi',
  superyes: 'super.money',
  yespop: 'POP',
  // MobiKwik
  mbkns: 'MobiKwik',
  ikwik: 'MobiKwik',
  jupiteraxis: 'Jupiter',
  fkaxis: 'Flipkart UPI',
  yesg: 'Groww',
  pingpay: 'Samsung Pay',
  upi: 'BHIM',
  freecharge: 'Freecharge',
  fifederal: 'Fi Money', // legacy: removed from register late 2025, VPAs still live
}

export function vpaProvider(vpa: string): string | null {
  const at = vpa.lastIndexOf('@')
  if (at < 0) return null
  return vpaProviders[vpa.slice(at + 1).toLowerCase()] ?? null
}
