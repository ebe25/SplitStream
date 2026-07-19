export type ParsedSms = {
  direction: 'debit' | 'credit'
  amount: number // integer paise
  counterparty_raw: string | null
  account_tail: string | null // last digits of account/card, e.g. '1234'
  bank_ref: string | null // UPI ref / txn id
  occurred_at: string | null // ISO date if the SMS contains one, else null
}

export type SmsTemplate = {
  id: string
  senderPattern: RegExp
  bodyPattern: RegExp
  extract: (m: RegExpMatchArray) => ParsedSms
}

// amount with prefix, handles "Rs 450.50", "Rs.1,234.56", "INR 85,000.00", "₹99"
const AMT = String.raw`(?:Rs\.?|INR|₹)\s*([\d,]+(?:\.\d{1,2})?)`
const paise = (s: string): number => Math.round(Number(s.replace(/,/g, '')) * 100)

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']
// day, month (numeric or name), 2- or 4-digit year -> ISO date
const iso = (d: string, m: string, y: string): string => {
  const mm = /^\d/.test(m) ? m : String(MONTHS.indexOf(m.slice(0, 3).toLowerCase()) + 1)
  return `${y.length === 2 ? '20' + y : y}-${mm.padStart(2, '0')}-${d.padStart(2, '0')}`
}

export const templates: SmsTemplate[] = [
  {
    id: 'hdfc-upi-debit',
    senderPattern: /HDFCBK/i,
    bodyPattern: new RegExp(`${AMT} debited from a/c \\w*?(\\d+) on (\\d{2})-(\\d{2})-(\\d{2,4}) to VPA (\\S+) \\(UPI Ref (\\d+)\\)`, 'i'),
    extract: m => ({ direction: 'debit', amount: paise(m[1]), counterparty_raw: m[6], account_tail: m[2], bank_ref: m[7], occurred_at: iso(m[3], m[4], m[5]) }),
  },
  {
    id: 'hdfc-upi-credit',
    senderPattern: /HDFCBK/i,
    bodyPattern: new RegExp(`${AMT} credited to a/c \\w*?(\\d+) on (\\d{2})-(\\d{2})-(\\d{2,4}) by a/c linked to VPA (\\S+) \\(UPI Ref (\\d+)\\)`, 'i'),
    extract: m => ({ direction: 'credit', amount: paise(m[1]), counterparty_raw: m[6], account_tail: m[2], bank_ref: m[7], occurred_at: iso(m[3], m[4], m[5]) }),
  },
  {
    id: 'hdfc-cc-spend',
    senderPattern: /HDFCBK/i,
    bodyPattern: new RegExp(`spent ${AMT} On HDFC Bank \\w+ Card \\w*?(\\d+) At (.+?) On (\\d{4})-(\\d{2})-(\\d{2})`, 'i'),
    extract: m => ({ direction: 'debit', amount: paise(m[1]), counterparty_raw: m[3], account_tail: m[2], bank_ref: null, occurred_at: `${m[4]}-${m[5]}-${m[6]}` }),
  },
  {
    id: 'hdfc-neft-credit',
    senderPattern: /HDFCBK/i,
    bodyPattern: new RegExp(`${AMT} deposited in HDFC Bank A/c \\w*?(\\d+) on (\\d{2})-(\\w{3})-(\\d{2,4}) for NEFT Cr-[A-Z0-9]+-([^-]+)-[^-]+-(\\w+)`, 'i'),
    extract: m => ({ direction: 'credit', amount: paise(m[1]), counterparty_raw: m[6], account_tail: m[2], bank_ref: m[7], occurred_at: iso(m[3], m[4], m[5]) }),
  },
  {
    id: 'icici-upi-debit',
    senderPattern: /ICICIB/i,
    bodyPattern: new RegExp(`Acct \\w*?(\\d+) debited for ${AMT} on (\\d{2})-(\\w{3})-(\\d{2}); (\\S+) credited\\. UPI:(\\d+)`, 'i'),
    extract: m => ({ direction: 'debit', amount: paise(m[2]), counterparty_raw: m[6], account_tail: m[1], bank_ref: m[7], occurred_at: iso(m[3], m[4], m[5]) }),
  },
  {
    id: 'sbi-upi-debit',
    senderPattern: /SBI/i,
    // SBI UPI debits carry a bare amount with no Rs/INR prefix
    bodyPattern: /A\/C \w*?(\d+) debited by ([\d,]+(?:\.\d{1,2})?) on date (\d{2})(\w{3})(\d{2}) trf to (.+?) Refno (\d+)/i,
    extract: m => ({ direction: 'debit', amount: paise(m[2]), counterparty_raw: m[6], account_tail: m[1], bank_ref: m[7], occurred_at: iso(m[3], m[4], m[5]) }),
  },
  {
    id: 'sbi-upi-credit',
    senderPattern: /SBI/i,
    bodyPattern: new RegExp(`A/c \\w*?(\\d+)-credited by ${AMT} on (\\d{2})(\\w{3})(\\d{2}) transfer from (.+?) Ref No (\\d+)`, 'i'),
    extract: m => ({ direction: 'credit', amount: paise(m[2]), counterparty_raw: m[6], account_tail: m[1], bank_ref: m[7], occurred_at: iso(m[3], m[4], m[5]) }),
  },
  {
    id: 'axis-card-debit',
    senderPattern: /AXISBK/i,
    bodyPattern: new RegExp(`Spent Card no\\. \\w*?(\\d+) ${AMT} (\\d{2})-(\\d{2})-(\\d{2}) [\\d:]+ (.+?) Avl Lmt`, 'i'),
    extract: m => ({ direction: 'debit', amount: paise(m[2]), counterparty_raw: m[6], account_tail: m[1], bank_ref: null, occurred_at: iso(m[3], m[4], m[5]) }),
  },
]

export function parseSms(sender: string, body: string): ParsedSms | null {
  for (const t of templates) {
    if (!t.senderPattern.test(sender)) continue
    const m = body.match(t.bodyPattern)
    if (m) return t.extract(m)
  }
  return null
}
