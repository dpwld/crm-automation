

export const CURRENCIES = ["USD", "KRW", "EUR", "CNY", "JPY", "TWD", "GBP"];

export const UNITS = ["pcs", "EA", "set", "lot", "kg", "m", "hr"];

export const INCOTERMS = ["EXW", "FCA", "FOB", "CIF", "CPT", "DAP", "DDP"];

export const PAYMENT_TERMS = [
  "Net 30",
  "Net 60",
  "Net 90",
  "100% T/T in advance",
  "50% down payment, 50% before shipment",
  "100% before shipment",
  "100% on delivery",
];


export const DL = {
  currency: "sx-dl-currency",
  unit: "sx-dl-unit",
  incoterms: "sx-dl-incoterms",
  payment: "sx-dl-payment",
} as const;
