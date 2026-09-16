type ObjectValue = Record<string, unknown>;
const object = (value: unknown): ObjectValue => value && typeof value === 'object' && !Array.isArray(value) ? value as ObjectValue : {};
const string = (value: unknown) => typeof value === 'string' ? value : '';
const number = (value: unknown) => typeof value === 'number' && Number.isFinite(value) ? value : 0;
const cents = (value: unknown) => Math.round(number(value) * 100);
function strings(value: unknown, keys: string[]): Record<string, string> {
  const source = object(value);
  return Object.fromEntries(keys.map(key => [key, string(source[key])]));
}

/** The only projection allowed to leave the service-role boundary. Never spread stored payloads. */
export function publicInvoiceResponse(value: unknown, today = new Date().toISOString().slice(0, 10)) {
  const state = object(value), source = object(state.payload), invoice = object(state.invoice);
  const saved = object(source.invoice), model = object(source.render), design = object(model.design);
  const flags = object(design.visibility);
  const visible = (key: string) => flags[key] !== false;
  const total = Math.max(0, cents(invoice.amount));
  const payments = (Array.isArray(state.payments) ? state.payments : []).map(object)
    .filter(p => p.invoiceId === invoice.id);
  const recorded = payments.reduce((sum, p) => sum + cents(p.amount), 0);
  // Legacy workspaces may not yet have payment records; mirror the app's legacy migration.
  const paid = invoice.status === 'Paid' ? total : Math.max(0, Math.min(total,
    payments.length ? recorded : cents(invoice.depositPaid)));
  const deposit = payments.length ? Math.max(0, payments.filter(p => p.kind === 'deposit').reduce((sum,p) => sum + cents(p.amount),0)) : paid;
  const closed = ['Cancelled', 'Void'];
  let status = 'Sent';
  if (invoice.deletedAt || closed.includes(string(invoice.status))) status = invoice.status === 'Void' ? 'Void' : 'Cancelled';
  else if (closed.includes(string(state.status))) status = string(state.status);
  else if (invoice.status === 'Declined' || state.status === 'Declined') status = 'Declined';
  else if (invoice.status === 'Paid' || total > 0 && paid >= total) status = 'Paid';
  else if (paid > 0) status = 'Partially Paid';
  else if (invoice.status === 'Accepted' || state.status === 'Accepted') status = 'Accepted';
  else if (!['Sent','Overdue'].includes(string(invoice.status))) status = 'Cancelled';
  const currency = ['MYR','IDR','USD'].includes(string(source.currency)) ? string(source.currency) : 'MYR';
  const formatter = new Intl.NumberFormat(currency === 'MYR' ? 'ms-MY' : currency === 'IDR' ? 'id-ID' : 'en-US', {style:'currency',currency});
  const money = (amount: number) => formatter.format(amount / 100);
  const business = strings(source.businessProfile, ['name','ssmRegistrationNo','phone','email','address','logoUrl']);
  if (!visible('businessAddress')) business.address = '';
  const payload: ObjectValue = {
    locale: ['en','ms','id'].includes(string(source.locale)) ? source.locale : 'en', currency,
    invoice: { invoiceNumber: string(saved.invoiceNumber), amount: total / 100, depositPaid: paid / 100,
      dueDate: visible('dueDate') ? string(saved.dueDate) : '', sentAt: string(saved.sentAt),
      status, terms: visible('terms') ? string(saved.terms) : '' },
    customer: strings(source.customer,['name','email','phone']), businessProfile: business,
    ...strings(source,['serviceName','packageDetails','eventLocation','eventDate','eventStartTime','eventEndTime']),
  };
  if (source.render && typeof source.render === 'object') {
    const business = strings(model.business,['name','registrationNumber','phone','email','website','address','logoUrl']);
    const client = strings(model.client,['name','email','phone','address']);
    if (!visible('businessAddress')) business.address = '';
    if (!visible('clientAddress')) client.address = '';
    const renderInvoice = strings(model.invoice,['number','issuedOn','dueOn','eventDate','eventTime','eventLocation']);
    if (!visible('dueDate')) renderInvoice.dueOn = '';
    const overdue = string(invoice.dueDate) && string(invoice.dueDate) < today;
    const paymentStatus = status === 'Sent' && overdue ? 'Overdue' : status === 'Partially Paid' && overdue ? 'Partially Paid · Overdue' : status;
    payload.render = {
      design: { ...strings(design,['templateId','accentColor','invoicePrefix']), thankYouMessage: visible('thankYou') ? string(design.thankYouMessage) : '',
        visibility: Object.fromEntries(['businessAddress','clientAddress','dueDate','paymentStatus','paymentInformation','paymentInstructions','terms','thankYou','bookflowBranding'].map(k=>[k,visible(k)])) },
      tokens: strings(model.tokens,['accent','accentText','accentSoft','text','muted','border','background','surface']),
      ...(model.labels ? {labels: strings(model.labels, ['invoice','from','billTo','billToLabel','yourBusiness','client','invoiceNumber','issued','due','eventDate','eventTime','location','description','amount','professionalServices','invoiceTotal','depositPaid','amountPaid','balanceDue','paymentInformation','paymentInstructions','bank','accountName','accountNumber','duitNow','terms','createdWith'])} : {}),
      business, client, currency,
      invoice: {...renderInvoice,status,paymentStatus:visible('paymentStatus') ? paymentStatus : ''},
      items: (Array.isArray(model.items) ? model.items : []).map(item=>({...strings(item,['description','detail']),amountLabel:money(total)})),
      totals: {subtotal:money(total),total:money(total),depositPaid:money(deposit),amountPaid:money(paid),balance:money(Math.max(0,total-paid)),hasDeposit:deposit>0,isSettled:paid>=total},
      payment: visible('paymentInformation') ? strings(model.payment,['bankName','accountHolder','accountNumber','duitNowId']) : {bankName:'',accountHolder:'',accountNumber:'',duitNowId:''},
      paymentInstructions: visible('paymentInstructions') ? string(model.paymentInstructions) : '',
      terms: visible('terms') ? string(model.terms) : '',
      thankYouMessage: visible('thankYou') ? string(model.thankYouMessage) : '',
    };
  }
  return {payload,status};
}
