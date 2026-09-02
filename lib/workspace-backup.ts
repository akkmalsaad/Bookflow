import { normalizeInvoiceDesign } from '@/lib/invoice-design';

import type {
  Booking,
  BusinessProfile,
  Customer,
  CurrencyCode,
  FinanceEntry,
  Invoice,
  InvoicePayment,
  InvoiceSettings,
  PackageOption,
  Reminder,
} from '@/context/app-data-context';

/**
 * Portable BookFlow workspace backups.
 *
 * A backup is a plain JSON document of business records. Everything BookFlow stores for a user
 * already lives in one `bookflow_workspaces.data` JSONB document, so a backup is a copy of that
 * document and a restore is a merge back into it — no schema change, no new table, and no new write
 * path. Authentication material never appears here: the workspace document holds no tokens, and the
 * invoice public-link capability tokens live in a separate relational table that this file never
 * reads.
 */

export const BACKUP_VERSION = 1;

/** Versions this build knows how to read. A newer file is refused rather than half-imported. */
export const SUPPORTED_BACKUP_VERSIONS = [1];

/** The business data a backup carries. Deliberately not the whole app state — see `omitted`. */
export type WorkspaceSnapshot = {
  packages: PackageOption[];
  customers: Customer[];
  bookings: Booking[];
  invoices: Invoice[];
  payments: InvoicePayment[];
  financeEntries: FinanceEntry[];
  reminders: Reminder[];
  businessProfile: BusinessProfile;
  currency: CurrencyCode;
  invoiceSettings: InvoiceSettings;
};

export type BookflowBackup = {
  /** Marker every reader checks first. A file without it is not a BookFlow backup. */
  bookflowBackup: true;
  backupVersion: number;
  createdAt: string;
  appVersion: string;
  /** Human context for the restore preview. Never an account, user or workspace identifier. */
  workspace: {
    businessName: string;
    currency: CurrencyCode;
  };
  data: WorkspaceSnapshot;
};

export type BackupCollection =
  | 'customers'
  | 'bookings'
  | 'invoices'
  | 'payments'
  | 'financeEntries'
  | 'packages'
  | 'reminders';

export const BACKUP_COLLECTION_LABELS: Record<BackupCollection, string> = {
  customers: 'Customers',
  bookings: 'Bookings',
  invoices: 'Invoices',
  payments: 'Payment records',
  financeEntries: 'Finance entries',
  packages: 'Services & packages',
  reminders: 'Reminders',
};

const COLLECTION_ORDER: BackupCollection[] = [
  'customers',
  'bookings',
  'invoices',
  'payments',
  'financeEntries',
  'packages',
  'reminders',
];

// ---------------------------------------------------------------------------------------------
// Creating a backup
// ---------------------------------------------------------------------------------------------

/**
 * The business logo is deliberately left out.
 *
 * `logoPath` addresses an object in the original account's Storage prefix. Restoring it into a
 * different account would leave a reference that account cannot manage, and a later "remove logo"
 * would aim a delete at someone else's object. The logo is re-uploaded after a restore instead.
 */
function backupProfile(profile: BusinessProfile): BusinessProfile {
  return {
    name: profile.name,
    ssmRegistrationNo: profile.ssmRegistrationNo,
    nature: profile.nature,
    phone: profile.phone,
    email: profile.email,
    address: profile.address,
  };
}

export function createWorkspaceBackup(
  snapshot: WorkspaceSnapshot,
  meta: { appVersion: string; now?: Date },
): BookflowBackup {
  return {
    bookflowBackup: true,
    backupVersion: BACKUP_VERSION,
    createdAt: (meta.now ?? new Date()).toISOString(),
    appVersion: meta.appVersion,
    workspace: {
      businessName: snapshot.businessProfile.name?.trim() || '',
      currency: snapshot.currency,
    },
    data: { ...snapshot, businessProfile: backupProfile(snapshot.businessProfile) },
  };
}

export function serializeBackup(backup: BookflowBackup) {
  return JSON.stringify(backup, null, 2);
}

export function buildBackupFileName(createdAt: string | Date) {
  const date = typeof createdAt === 'string' ? new Date(createdAt) : createdAt;
  const stamp = Number.isNaN(date.getTime()) ? new Date() : date;
  const key = `${stamp.getFullYear()}-${String(stamp.getMonth() + 1).padStart(2, '0')}-${String(
    stamp.getDate(),
  ).padStart(2, '0')}`;
  return `BookFlow-Workspace-Backup-${key}.json`;
}

export function countBackupRecords(backup: BookflowBackup) {
  return COLLECTION_ORDER.map((collection) => ({
    collection,
    label: BACKUP_COLLECTION_LABELS[collection],
    count: backup.data[collection].length,
  })).filter((item) => item.collection !== 'reminders' || item.count > 0);
}

// ---------------------------------------------------------------------------------------------
// Reading a backup
// ---------------------------------------------------------------------------------------------

export type BackupRejection =
  | 'not-json'
  | 'not-a-backup'
  | 'unsupported-version'
  | 'malformed'
  | 'empty';

export const BACKUP_REJECTION_MESSAGES: Record<BackupRejection, string> = {
  'not-json': "This file could not be read. Choose a BookFlow backup file ending in .json.",
  'not-a-backup': "This doesn't appear to be a valid BookFlow backup.",
  'unsupported-version': 'This backup was made by a newer version of BookFlow. Update BookFlow, then try again.',
  malformed: 'This backup file is damaged and cannot be restored.',
  empty: 'This backup does not contain any records to restore.',
};

export type BackupParseResult =
  | { ok: true; backup: BookflowBackup; discardedRecords: number }
  | { ok: false; reason: BackupRejection };

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

const str = (value: unknown, fallback = '') => (typeof value === 'string' ? value : fallback);
const num = (value: unknown, fallback = 0) => (typeof value === 'number' && Number.isFinite(value) ? value : fallback);
const optionalStr = (value: unknown) => (typeof value === 'string' ? value : undefined);
const nullableStr = (value: unknown) =>
  typeof value === 'string' ? value : value === null ? null : undefined;

/** A record is usable only with a non-empty string id; everything else is coerced or dropped. */
function id(value: unknown) {
  return typeof value === 'string' && value.trim() ? value : null;
}

/**
 * Every field is copied out by name.
 *
 * Reading fields explicitly rather than spreading the parsed object is what stops a hand-edited or
 * hostile file from smuggling extra keys into the workspace document — anything not listed here
 * simply does not survive the import.
 */
const SANITIZERS = {
  packages: (value: Record<string, unknown>): PackageOption | null => {
    const recordId = id(value.id);
    if (!recordId) return null;
    return {
      id: recordId,
      name: str(value.name),
      details: str(value.details),
      duration: str(value.duration),
      price: num(value.price),
      info: str(value.info),
    };
  },
  customers: (value: Record<string, unknown>): Customer | null => {
    const recordId = id(value.id);
    if (!recordId) return null;
    return {
      id: recordId,
      name: str(value.name),
      email: str(value.email),
      phone: str(value.phone),
      location: str(value.location),
      notes: str(value.notes),
    };
  },
  bookings: (value: Record<string, unknown>): Booking | null => {
    const recordId = id(value.id);
    if (!recordId) return null;
    const status = str(value.status) as Booking['status'];
    return {
      id: recordId,
      customerId: str(value.customerId),
      title: str(value.title),
      date: str(value.date),
      time: optionalStr(value.time),
      startTime: optionalStr(value.startTime),
      endTime: optionalStr(value.endTime),
      location: str(value.location),
      packageName: str(value.packageName),
      price: num(value.price),
      status: BOOKING_STATUSES.includes(status) ? status : 'Inquiry',
      notes: str(value.notes),
    };
  },
  invoices: (value: Record<string, unknown>): Invoice | null => {
    const recordId = id(value.id);
    if (!recordId) return null;
    const status = str(value.status) as Invoice['status'];
    const snapshot = isRecord(value.snapshot) ? value.snapshot : null;
    return {
      id: recordId,
      bookingId: str(value.bookingId),
      customerId: str(value.customerId),
      amount: num(value.amount),
      depositPaid: typeof value.depositPaid === 'number' ? value.depositPaid : undefined,
      dueDate: str(value.dueDate),
      status: INVOICE_STATUSES.includes(status) ? status : 'Draft',
      sentAt: str(value.sentAt),
      serviceName: optionalStr(value.serviceName),
      packageDetails: optionalStr(value.packageDetails),
      eventLocation: optionalStr(value.eventLocation),
      eventDate: optionalStr(value.eventDate),
      eventTime: optionalStr(value.eventTime),
      eventStartTime: optionalStr(value.eventStartTime),
      eventEndTime: optionalStr(value.eventEndTime),
      terms: optionalStr(value.terms),
      invoiceNumber: optionalStr(value.invoiceNumber),
      snapshot: snapshot
        ? {
            businessName: str(snapshot.businessName),
            businessRegistrationNumber: str(snapshot.businessRegistrationNumber),
            businessPhone: str(snapshot.businessPhone),
            businessEmail: str(snapshot.businessEmail),
            businessAddress: str(snapshot.businessAddress),
            businessLogoUrl: nullableStr(snapshot.businessLogoUrl),
            paymentTermDays: num(snapshot.paymentTermDays),
            paymentInstructions: str(snapshot.paymentInstructions),
          }
        : undefined,
      deletedAt: nullableStr(value.deletedAt) ?? null,
      deletionReason: nullableStr(value.deletionReason) ?? null,
      voidedAt: nullableStr(value.voidedAt) ?? null,
      voidReason: nullableStr(value.voidReason) ?? null,
      statusBeforeTrash: (nullableStr(value.statusBeforeTrash) as Invoice['status'] | null) ?? null,
    };
  },
  payments: (value: Record<string, unknown>): InvoicePayment | null => {
    const recordId = id(value.id);
    if (!recordId || !id(value.invoiceId)) return null;
    return {
      id: recordId,
      invoiceId: str(value.invoiceId),
      amount: num(value.amount),
      method: str(value.method),
      date: str(value.date),
      notes: optionalStr(value.notes),
      kind: value.kind === 'deposit' ? 'deposit' : 'payment',
      recordedAt: str(value.recordedAt),
    };
  },
  financeEntries: (value: Record<string, unknown>): FinanceEntry | null => {
    const recordId = id(value.id);
    if (!recordId) return null;
    return {
      id: recordId,
      category: str(value.category),
      amount: num(value.amount),
      date: str(value.date),
      description: str(value.description),
      type: value.type === 'expense' ? 'expense' : 'income',
      sourceType: optionalStr(value.sourceType) as FinanceEntry['sourceType'],
      sourceId: optionalStr(value.sourceId),
      bookingId: optionalStr(value.bookingId),
      invoiceId: optionalStr(value.invoiceId),
      customerId: optionalStr(value.customerId),
    };
  },
  reminders: (value: Record<string, unknown>): Reminder | null => {
    const recordId = id(value.id);
    if (!recordId) return null;
    const channel = str(value.channel);
    const status = str(value.status);
    return {
      id: recordId,
      title: str(value.title),
      dueDate: str(value.dueDate),
      channel: channel === 'whatsapp' || channel === 'sms' ? channel : 'email',
      status: status === 'sent' || status === 'failed' ? status : 'scheduled',
    };
  },
} as const;

const BOOKING_STATUSES: Booking['status'][] = ['Inquiry', 'Confirmed', 'In Progress', 'Completed', 'Cancelled'];
const INVOICE_STATUSES: Invoice['status'][] = [
  'Draft',
  'Sent',
  'Accepted',
  'Declined',
  'Paid',
  'Partially Paid',
  'Overdue',
  'Cancelled',
  'Void',
];

type SanitizedRecord<K extends BackupCollection> = NonNullable<ReturnType<(typeof SANITIZERS)[K]>>;

function sanitizeCollection<K extends BackupCollection>(value: unknown, collection: K) {
  const records: SanitizedRecord<K>[] = [];
  let discarded = 0;

  if (!Array.isArray(value)) return { records, discarded };

  value.forEach((entry) => {
    if (!isRecord(entry)) {
      discarded += 1;
      return;
    }
    const sanitized = SANITIZERS[collection](entry);
    if (sanitized) records.push(sanitized as SanitizedRecord<K>);
    else discarded += 1;
  });

  return { records, discarded };
}

function sanitizeProfile(value: unknown): BusinessProfile {
  const source = isRecord(value) ? value : {};
  return {
    name: str(source.name),
    ssmRegistrationNo: str(source.ssmRegistrationNo),
    nature: str(source.nature),
    phone: str(source.phone),
    email: str(source.email),
    address: str(source.address),
  };
}

function sanitizeInvoiceSettings(value: unknown): InvoiceSettings {
  const source = isRecord(value) ? value : {};
  return {
    numberFormat: str(source.numberFormat),
    paymentTermDays: Math.max(0, Math.floor(num(source.paymentTermDays))),
    paymentInstructions: str(source.paymentInstructions),
    termsAndConditions: str(source.termsAndConditions),
    nextInvoiceSequence: Math.max(1, Math.floor(num(source.nextInvoiceSequence, 1))),
    design: normalizeInvoiceDesign(source.design),
  };
}

function sanitizeCurrency(value: unknown): CurrencyCode {
  return value === 'MYR' || value === 'IDR' || value === 'USD' ? value : 'MYR';
}

/**
 * Reads a candidate backup file, refusing anything that is not one.
 *
 * Nothing reaches the workspace until this returns `ok`. Individual records that fail their shape
 * check are dropped and counted rather than aborting the whole restore, but a file that is not JSON,
 * carries no `bookflowBackup` marker, or announces a version this build cannot read is rejected
 * outright.
 */
export function parseWorkspaceBackup(text: string): BackupParseResult {
  let parsed: unknown;

  try {
    parsed = JSON.parse(text);
  } catch {
    return { ok: false, reason: 'not-json' };
  }

  if (!isRecord(parsed) || parsed.bookflowBackup !== true) {
    return { ok: false, reason: 'not-a-backup' };
  }

  const version = parsed.backupVersion;
  if (typeof version !== 'number' || !Number.isInteger(version) || version < 1) {
    return { ok: false, reason: 'malformed' };
  }
  if (!SUPPORTED_BACKUP_VERSIONS.includes(version)) {
    return { ok: false, reason: 'unsupported-version' };
  }
  if (!isRecord(parsed.data)) {
    return { ok: false, reason: 'malformed' };
  }

  const source = parsed.data;
  let discardedRecords = 0;
  const collect = <K extends BackupCollection>(collection: K) => {
    const result = sanitizeCollection(source[collection], collection);
    discardedRecords += result.discarded;
    return result.records;
  };

  const data: WorkspaceSnapshot = {
    packages: collect('packages'),
    customers: collect('customers'),
    bookings: collect('bookings'),
    invoices: collect('invoices'),
    payments: collect('payments'),
    financeEntries: collect('financeEntries'),
    reminders: collect('reminders'),
    businessProfile: sanitizeProfile(source.businessProfile),
    currency: sanitizeCurrency(source.currency),
    invoiceSettings: sanitizeInvoiceSettings(source.invoiceSettings),
  };

  const total = COLLECTION_ORDER.reduce((sum, collection) => sum + data[collection].length, 0);
  if (total === 0) {
    return { ok: false, reason: 'empty' };
  }

  const workspace = isRecord(parsed.workspace) ? parsed.workspace : {};

  return {
    ok: true,
    discardedRecords,
    backup: {
      bookflowBackup: true,
      backupVersion: version,
      createdAt: str(parsed.createdAt),
      appVersion: str(parsed.appVersion),
      workspace: {
        businessName: str(workspace.businessName),
        currency: sanitizeCurrency(workspace.currency),
      },
      data,
    },
  };
}

// ---------------------------------------------------------------------------------------------
// Merging a backup into the current workspace
// ---------------------------------------------------------------------------------------------

export type MergeTally = { added: number; skipped: number; renumbered: number };

export type WorkspaceMergeResult = {
  snapshot: WorkspaceSnapshot;
  tally: Record<BackupCollection, MergeTally>;
  totalAdded: number;
  totalSkipped: number;
  /** Records that arrived under an id already used by a different record and were given a new one. */
  totalRenumbered: number;
};

/**
 * A record's identity independent of its id.
 *
 * Ids are what hold BookFlow's relationships together, but they are not proof of identity across
 * workspaces: every new workspace is seeded with `pkg-1`, `pkg-2` and `pkg-3`, so those three ids
 * collide on any cross-workspace restore. A business key resolves that — two records are the same
 * record when this matches, whatever their ids say.
 */
type BusinessKey = string | null;

/** Null when a record carries nothing that could identify it; such a record is matched by id only. */
function keyed(parts: string[], value: string): BusinessKey {
  return parts.some((part) => part.trim()) ? value : null;
}

const BUSINESS_KEYS: { [K in BackupCollection]: (record: WorkspaceSnapshot[K][number]) => BusinessKey } = {
  packages: (item) => keyed([item.name], `name:${item.name.trim().toLowerCase()}`),
  customers: (item) =>
    item.email.trim()
      ? `email:${item.email.trim().toLowerCase()}`
      : keyed([item.name], `name:${item.name.trim().toLowerCase()}`),
  bookings: (item) =>
    keyed(
      [item.customerId, item.date, item.title],
      `${item.customerId}|${item.date}|${item.title.trim().toLowerCase()}`,
    ),
  invoices: (item) =>
    item.invoiceNumber?.trim()
      ? `number:${item.invoiceNumber.trim().toLowerCase()}`
      : keyed(
          [item.bookingId, item.customerId, item.dueDate],
          `${item.bookingId}|${item.customerId}|${item.amount}|${item.dueDate}`,
        ),
  payments: (item) => `${item.invoiceId}|${item.date}|${item.amount}|${item.kind}|${item.method}`,
  financeEntries: (item) =>
    item.sourceId
      ? `source:${item.sourceId}`
      : keyed(
          [item.date, item.category, item.description],
          `${item.date}|${item.type}|${item.category}|${item.amount}|${item.description}`,
        ),
  reminders: (item) =>
    keyed([item.title, item.dueDate], `${item.title.trim().toLowerCase()}|${item.dueDate}|${item.channel}`),
};

function mintId(prefix: string, used: Set<string>) {
  let candidate = `${prefix}-${Date.now()}`;
  let suffix = 1;

  while (used.has(candidate)) {
    candidate = `${prefix}-${Date.now()}-${suffix}`;
    suffix += 1;
  }

  return candidate;
}

type MergeOutcome<T> = { merged: T[]; idMap: Map<string, string>; tally: MergeTally };

/**
 * Additive merge for one collection.
 *
 * Three cases, in this order:
 *  1. a record with the same business key is already here — whatever the ids say, this is the same
 *     record: keep the one on the device and map the incoming id onto it, so the backup's child
 *     records attach to the record that is actually present;
 *  2. its id is taken by a genuinely different record — give the incoming one a fresh id;
 *  3. otherwise it is new — add it under its original id.
 *
 * The business key is checked before the id on purpose. A record renumbered by an earlier import
 * no longer holds the id the backup names, and matching on id first would collide with the device's
 * record all over again and add a fresh duplicate on every repeat import.
 *
 * Nothing on the device is ever overwritten or removed, so re-importing the same file is a no-op.
 */
function mergeCollection<T extends { id: string }>(
  current: T[],
  incoming: T[],
  businessKey: (record: T) => BusinessKey,
  idPrefix: string,
): MergeOutcome<T> {
  const byId = new Map(current.map((record) => [record.id, record]));
  const byKey = new Map<string, T>();
  current.forEach((record) => {
    const key = businessKey(record);
    if (key && !byKey.has(key)) byKey.set(key, record);
  });

  const usedIds = new Set(byId.keys());
  const idMap = new Map<string, string>();
  const added: T[] = [];
  const tally: MergeTally = { added: 0, skipped: 0, renumbered: 0 };

  const remember = (record: T, key: BusinessKey) => {
    usedIds.add(record.id);
    byId.set(record.id, record);
    if (key && !byKey.has(key)) byKey.set(key, record);
  };

  incoming.forEach((record) => {
    const key = businessKey(record);
    const existingByKey = key ? byKey.get(key) : undefined;

    if (existingByKey) {
      idMap.set(record.id, existingByKey.id);
      tally.skipped += 1;
      return;
    }

    const existingById = byId.get(record.id);

    if (existingById) {
      // Same id, different record — the seeded `pkg-1`/`pkg-2`/`pkg-3` case, or a genuine clash
      // between two workspaces. The device keeps its record; the incoming one comes in beside it.
      const freshId = mintId(idPrefix, usedIds);
      const relocated = { ...record, id: freshId };
      idMap.set(record.id, freshId);
      remember(relocated, key);
      added.push(relocated);
      tally.added += 1;
      tally.renumbered += 1;
      return;
    }

    idMap.set(record.id, record.id);
    remember(record, key);
    added.push(record);
    tally.added += 1;
  });

  return { merged: [...current, ...added], idMap, tally };
}

/** Follows an id through a merge, leaving unknown references untouched rather than blanking them. */
function remap(value: string | undefined, idMap: Map<string, string>) {
  if (!value) return value;
  return idMap.get(value) ?? value;
}

/**
 * Merges a backup into the current workspace, keeping every relationship intact.
 *
 * Collections are merged parent-first — customers, then bookings, then invoices, then payments and
 * ledger rows — and each step rewrites the incoming records' foreign keys through the id maps built
 * by the steps before it. A booking therefore follows its customer to whatever id that customer
 * ended up with, an invoice follows its booking, and a payment follows its invoice.
 */
export function mergeWorkspaceBackup(
  current: WorkspaceSnapshot,
  backup: BookflowBackup,
): WorkspaceMergeResult {
  const incoming = backup.data;

  const packages = mergeCollection(current.packages, incoming.packages, BUSINESS_KEYS.packages, 'pkg');
  const customers = mergeCollection(current.customers, incoming.customers, BUSINESS_KEYS.customers, 'cust');

  const bookings = mergeCollection(
    current.bookings,
    incoming.bookings.map((booking) => ({
      ...booking,
      customerId: remap(booking.customerId, customers.idMap) ?? booking.customerId,
    })),
    BUSINESS_KEYS.bookings,
    'booking',
  );

  const invoices = mergeCollection(
    current.invoices,
    incoming.invoices.map((invoice) => ({
      ...invoice,
      customerId: remap(invoice.customerId, customers.idMap) ?? invoice.customerId,
      bookingId: remap(invoice.bookingId, bookings.idMap) ?? invoice.bookingId,
    })),
    BUSINESS_KEYS.invoices,
    'invoice',
  );

  const payments = mergeCollection(
    current.payments,
    incoming.payments.map((payment) => ({
      ...payment,
      invoiceId: remap(payment.invoiceId, invoices.idMap) ?? payment.invoiceId,
    })),
    BUSINESS_KEYS.payments,
    'pay',
  );

  const financeEntries = mergeCollection(
    current.financeEntries,
    incoming.financeEntries.map((entry) => ({
      ...entry,
      invoiceId: remap(entry.invoiceId, invoices.idMap),
      bookingId: remap(entry.bookingId, bookings.idMap),
      customerId: remap(entry.customerId, customers.idMap),
      // The ledger's own dedupe key points at the payment that produced the row.
      sourceId: remap(entry.sourceId, payments.idMap),
    })),
    BUSINESS_KEYS.financeEntries,
    'fin',
  );

  const reminders = mergeCollection(current.reminders, incoming.reminders, BUSINESS_KEYS.reminders, 'rem');

  const tally: Record<BackupCollection, MergeTally> = {
    packages: packages.tally,
    customers: customers.tally,
    bookings: bookings.tally,
    invoices: invoices.tally,
    payments: payments.tally,
    financeEntries: financeEntries.tally,
    reminders: reminders.tally,
  };

  return {
    snapshot: {
      packages: packages.merged,
      customers: customers.merged,
      bookings: bookings.merged,
      invoices: invoices.merged,
      payments: payments.merged,
      financeEntries: financeEntries.merged,
      reminders: reminders.merged,
      businessProfile: mergeProfile(current.businessProfile, incoming.businessProfile),
      currency: mergeCurrency(current, incoming.currency),
      invoiceSettings: mergeInvoiceSettings(current, incoming.invoiceSettings, invoices.merged),
    },
    tally,
    totalAdded: COLLECTION_ORDER.reduce((sum, key) => sum + tally[key].added, 0),
    totalSkipped: COLLECTION_ORDER.reduce((sum, key) => sum + tally[key].skipped, 0),
    totalRenumbered: COLLECTION_ORDER.reduce((sum, key) => sum + tally[key].renumbered, 0),
  };
}

/** Fills blanks only. A detail the user has already entered on this device always wins. */
function mergeProfile(current: BusinessProfile, incoming: BusinessProfile): BusinessProfile {
  const pick = (mine: string, theirs: string) => (mine.trim() ? mine : theirs);

  return {
    ...current,
    name: pick(current.name, incoming.name),
    ssmRegistrationNo: pick(current.ssmRegistrationNo, incoming.ssmRegistrationNo),
    nature: pick(current.nature, incoming.nature),
    phone: pick(current.phone, incoming.phone),
    email: pick(current.email, incoming.email),
    address: pick(current.address, incoming.address),
    // Never restored: the logo object belongs to the Storage prefix of the account that made the
    // backup. Whatever logo this workspace already has is left exactly as it is.
    logoUrl: current.logoUrl,
    logoPath: current.logoPath,
  };
}

/**
 * Only a workspace that has never priced anything adopts the backup's currency. Switching it under
 * existing invoices would silently restate every amount already recorded.
 */
function mergeCurrency(current: WorkspaceSnapshot, incoming: CurrencyCode): CurrencyCode {
  const hasPricedRecords =
    current.invoices.length > 0 || current.payments.length > 0 || current.financeEntries.length > 0;
  return hasPricedRecords ? current.currency : incoming;
}

function mergeInvoiceSettings(
  current: WorkspaceSnapshot,
  incoming: InvoiceSettings,
  mergedInvoices: Invoice[],
): InvoiceSettings {
  const hasInvoices = current.invoices.length > 0;

  return {
    numberFormat: current.invoiceSettings.numberFormat.trim() && hasInvoices
      ? current.invoiceSettings.numberFormat
      : incoming.numberFormat.trim() || current.invoiceSettings.numberFormat,
    paymentTermDays: hasInvoices ? current.invoiceSettings.paymentTermDays : incoming.paymentTermDays,
    paymentInstructions: current.invoiceSettings.paymentInstructions.trim()
      ? current.invoiceSettings.paymentInstructions
      : incoming.paymentInstructions,
    termsAndConditions: current.invoiceSettings.termsAndConditions.trim()
      ? current.invoiceSettings.termsAndConditions
      : incoming.termsAndConditions,
    // Appearance follows the same rule as the rest: a workspace that has already issued invoices
    // keeps the look it is using, and a fresh one adopts the backup's.
    design: hasInvoices ? current.invoiceSettings.design : incoming.design,
    // The counter can only ever move forward, so a restored invoice can never take a number a
    // future invoice would also be given.
    nextInvoiceSequence: Math.max(
      current.invoiceSettings.nextInvoiceSequence,
      incoming.nextInvoiceSequence,
      mergedInvoices.length + 1,
    ),
  };
}
