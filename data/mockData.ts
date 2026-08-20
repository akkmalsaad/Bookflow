export type Customer = {
  id: string;
  name: string;
  email: string;
  phone: string;
  location: string;
  notes: string;
};

export type BookingStatus = 'Inquiry' | 'Confirmed' | 'Completed' | 'Cancelled';
export type InvoiceStatus = 'Draft' | 'Sent' | 'Accepted' | 'Declined' | 'Paid' | 'Overdue' | 'Cancelled';

export type Booking = {
  id: string;
  customerId: string;
  title: string;
  date: string;
  time?: string;
  startTime?: string;
  endTime?: string;
  location: string;
  packageName: string;
  price: number;
  status: BookingStatus;
  notes: string;
};

export type Invoice = {
  id: string;
  bookingId: string;
  customerId: string;
  amount: number;
  depositPaid?: number;
  dueDate: string;
  status: InvoiceStatus;
  sentAt: string;
  serviceName?: string;
  packageDetails?: string;
  eventLocation?: string;
  eventDate?: string;
  eventTime?: string;
  eventStartTime?: string;
  eventEndTime?: string;
  terms?: string;
};

export type FinanceEntry = {
  id: string;
  category: string;
  amount: number;
  date: string;
  description: string;
  type: 'expense' | 'income';
};

export const customers: Customer[] = [
  {
    id: 'cust-1',
    name: 'Nur Aisyah Rahman',
    email: 'aisyah@serimajlis.my',
    phone: '+60 12-345 6789',
    location: 'Shah Alam, Selangor',
    notes: 'Wedding package client; prefers WhatsApp updates.',
  },
  {
    id: 'cust-2',
    name: 'Daniel Tan Wei Ming',
    email: 'daniel@keluargakita.my',
    phone: '+60 16-782 4510',
    location: 'Petaling Jaya, Selangor',
    notes: 'Family session with two shoots planned.',
  },
  {
    id: 'cust-3',
    name: 'Priya Nair',
    email: 'priya@ruangjenama.my',
    phone: '+60 17-664 2098',
    location: 'Kuala Lumpur',
    notes: 'Commercial lifestyle brand campaign.',
  },
];

export const bookings: Booking[] = [
  {
    id: 'bk-101',
    customerId: 'cust-1',
    title: 'Akad Nikah & Reception',
    date: '2026-08-18',
    time: '10:00',
    startTime: '10:00',
    endTime: '18:00',
    location: 'The Majestic Hotel, Kuala Lumpur',
    packageName: 'Wedding Package',
    price: 3200,
    status: 'Confirmed',
    notes: 'Akad nikah and reception coverage with two photographers.',
  },
  {
    id: 'bk-102',
    customerId: 'cust-2',
    title: 'Family Portrait Session',
    date: '2026-08-21',
    time: '16:30',
    startTime: '16:30',
    endTime: '18:30',
    location: 'Taman Tasik Titiwangsa, Kuala Lumpur',
    packageName: 'Family Session',
    price: 850,
    status: 'Inquiry',
    notes: 'Waiting on final approval of the date.',
  },
  {
    id: 'bk-103',
    customerId: 'cust-3',
    title: 'Local Brand Campaign',
    date: '2026-08-28',
    time: '09:00',
    startTime: '09:00',
    endTime: '17:00',
    location: 'REXKL, Kuala Lumpur',
    packageName: 'Commercial Day Rate',
    price: 4200,
    status: 'Confirmed',
    notes: 'Includes 8-hour day rate with raw image access.',
  },
  {
    id: 'bk-104',
    customerId: 'cust-1',
    title: 'Pre-Wedding Portrait Session',
    date: '2026-07-14',
    time: '17:30',
    startTime: '17:30',
    endTime: '19:00',
    location: 'Taman Botani Putrajaya',
    packageName: 'Mini Session',
    price: 650,
    status: 'Completed',
    notes: 'Gallery delivered and final invoice closed.',
  },
];

export const invoices: Invoice[] = [
  {
    id: 'inv-102',
    bookingId: 'bk-101',
    customerId: 'cust-1',
    amount: 3200,
    dueDate: '2026-08-05',
    status: 'Sent',
    sentAt: '2026-08-02',
  },
  {
    id: 'inv-103',
    bookingId: 'bk-103',
    customerId: 'cust-3',
    amount: 4200,
    dueDate: '2026-08-10',
    status: 'Accepted',
    sentAt: '2026-08-03',
  },
  {
    id: 'inv-104',
    bookingId: 'bk-102',
    customerId: 'cust-2',
    amount: 850,
    dueDate: '2026-08-09',
    status: 'Overdue',
    sentAt: '2026-08-01',
  },
  {
    id: 'inv-105',
    bookingId: 'bk-104',
    customerId: 'cust-1',
    amount: 650,
    dueDate: '2026-07-20',
    status: 'Paid',
    sentAt: '2026-07-12',
  },
];

export const financeEntries: FinanceEntry[] = [
  {
    id: 'fin-1',
    category: 'Camera Gear',
    amount: 420,
    date: '2026-08-02',
    description: 'Lens rental for weekend event',
    type: 'expense',
  },
  {
    id: 'fin-2',
    category: 'Travel',
    amount: 180,
    date: '2026-08-04',
    description: 'Fuel and parking for photo session',
    type: 'expense',
  },
  {
    id: 'fin-3',
    category: 'Wedding Package',
    amount: 3200,
    date: '2026-08-03',
    description: 'Deposit received from Nur Aisyah Rahman',
    type: 'income',
  },
  {
    id: 'fin-4',
    category: 'Commercial Shoot',
    amount: 4200,
    date: '2026-08-05',
    description: 'Campaign invoice accepted',
    type: 'income',
  },
];
