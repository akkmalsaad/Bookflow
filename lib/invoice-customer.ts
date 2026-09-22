import type { Customer, Invoice } from '@/context/app-data-context';

/**
 * The client's details as the invoice last knew them.
 *
 * An invoice is a financial record and outlives the client record it was raised for: deleting a
 * client from the Clients screen must never take the invoice's "Bill to" details with it. The
 * snapshot is written at creation and tracks the client while they exist — editing a client
 * refreshes it on their invoices — so what it freezes is the client as they stood when they were
 * deleted, not a stale copy from months earlier. It is never cleared.
 *
 * This is deliberately unlike `InvoiceSnapshot`, which freezes the *business* profile at issue:
 * that one is the seller's own record of what it sent, while this one exists purely so a deleted
 * client can still be named. While the client record exists it always wins on screen, so the two
 * never disagree in the UI.
 *
 * `address` mirrors what `Customer.location` held; the invoice document calls that field the
 * client's address, and so does every renderer.
 */
export type InvoiceCustomerSnapshot = {
  name: string;
  email: string;
  phone: string;
  address: string;
};

/** Where the details on screen came from. 'missing' means neither source had anything. */
export type InvoiceCustomerSource = 'customer' | 'snapshot' | 'missing';

export type InvoiceCustomerDetails = InvoiceCustomerSnapshot & {
  /** null once the client record is gone, so nothing downstream tries to look one up. */
  customerId: string | null;
  source: InvoiceCustomerSource;
};

/** The subset of an invoice this module reads, so callers can pass drafts and stored records alike. */
export type InvoiceCustomerRef = {
  customerId?: string | null;
  customerSnapshot?: InvoiceCustomerSnapshot | null;
};

function clean(value: string | null | undefined) {
  return typeof value === 'string' ? value.trim() : '';
}

export function createInvoiceCustomerSnapshot(customer: Customer): InvoiceCustomerSnapshot {
  return {
    name: clean(customer.name),
    email: clean(customer.email),
    phone: clean(customer.phone),
    address: clean(customer.location),
  };
}

/** Field-by-field, so a refresh that changes nothing can be skipped rather than rewritten. */
export function isSameInvoiceCustomerSnapshot(
  left: InvoiceCustomerSnapshot | null | undefined,
  right: InvoiceCustomerSnapshot,
) {
  if (!left) return false;
  return (
    left.name === right.name &&
    left.email === right.email &&
    left.phone === right.phone &&
    left.address === right.address
  );
}

/** True when a snapshot carries anything worth showing. An all-empty one is treated as absent. */
function hasSnapshotContent(snapshot: InvoiceCustomerSnapshot | null | undefined) {
  if (!snapshot) return false;
  return Boolean(clean(snapshot.name) || clean(snapshot.email) || clean(snapshot.phone) || clean(snapshot.address));
}

/**
 * Resolves the client shown on an invoice, in the order the app can trust:
 *
 * 1. the live client record, so editing a client still updates their open invoices exactly as before;
 * 2. the snapshot frozen onto the invoice, once that record no longer exists;
 * 3. nothing at all, for legacy invoices that were never snapshotted and whose client is gone.
 *
 * It never throws and never returns null: an invoice always resolves to something renderable, which
 * is what lets the invoice screen open without a client record.
 */
export function resolveInvoiceCustomer(
  invoice: InvoiceCustomerRef,
  customer: Customer | null | undefined,
): InvoiceCustomerDetails {
  if (customer) {
    return { ...createInvoiceCustomerSnapshot(customer), customerId: customer.id, source: 'customer' };
  }

  if (hasSnapshotContent(invoice.customerSnapshot)) {
    const snapshot = invoice.customerSnapshot as InvoiceCustomerSnapshot;
    return {
      name: clean(snapshot.name),
      email: clean(snapshot.email),
      phone: clean(snapshot.phone),
      address: clean(snapshot.address),
      customerId: null,
      source: 'snapshot',
    };
  }

  return { name: '', email: '', phone: '', address: '', customerId: null, source: 'missing' };
}

/**
 * The name to print for an invoice's client. `deletedLabel` is the localized "Deleted client"
 * wording, used only when neither the client record nor the snapshot can name them.
 */
export function getInvoiceClientName(
  invoice: InvoiceCustomerRef,
  customer: Customer | null | undefined,
  deletedLabel: string,
) {
  return resolveInvoiceCustomer(invoice, customer).name || deletedLabel;
}

/**
 * Re-stamps the snapshot on one client's invoices after that client is edited, so the details the
 * invoice falls back to are the ones they were last known by rather than the ones they were first
 * raised under.
 *
 * Nothing visible changes while the client record exists — the resolver still prefers it — but the
 * moment they are deleted the invoice keeps their latest name, email, phone and address.
 *
 * Touches only this client's invoices, and only those whose snapshot would actually differ; when no
 * invoice changes the original array is returned, which lets a React state updater bail out rather
 * than re-render every invoice screen and queue a pointless workspace save.
 */
export function refreshInvoiceCustomerSnapshots(invoices: Invoice[], customer: Customer): Invoice[] {
  const snapshot = createInvoiceCustomerSnapshot(customer);
  let changed = false;

  const next = invoices.map((invoice) => {
    if (invoice.customerId !== customer.id) return invoice;
    if (isSameInvoiceCustomerSnapshot(invoice.customerSnapshot, snapshot)) return invoice;

    changed = true;
    return { ...invoice, customerSnapshot: snapshot };
  });

  return changed ? next : invoices;
}

/**
 * Backfills the snapshot on invoices raised before snapshots existed, using the client record they
 * still point at. Invoices whose client is already gone keep an absent snapshot and fall back to the
 * "Deleted client" label — nothing is ever invented for them.
 *
 * Returns the original array when there is nothing to add, so a loaded workspace is not rewritten
 * for no reason.
 */
export function backfillInvoiceCustomerSnapshots(invoices: Invoice[], customers: Customer[]): Invoice[] {
  const pending = invoices.some((invoice) => !hasSnapshotContent(invoice.customerSnapshot));
  if (!pending) return invoices;

  const customerById = new Map(customers.map((customer) => [customer.id, customer]));
  return invoices.map((invoice) => {
    if (hasSnapshotContent(invoice.customerSnapshot)) return invoice;

    const customer = invoice.customerId ? customerById.get(invoice.customerId) : undefined;
    if (!customer) return invoice;

    return { ...invoice, customerSnapshot: createInvoiceCustomerSnapshot(customer) };
  });
}
