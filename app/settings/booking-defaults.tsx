import { SettingsDetailScreen, SettingsNotice } from '@/components/settings/SettingsDetailScreen';

export default function BookingDefaultsScreen() {
  return (
    <SettingsDetailScreen
      eyebrow="Business"
      title="Booking defaults"
      description="Values that would be pre-filled every time you create a booking.">
      <SettingsNotice
        title="Not configurable yet"
        body="Bookings currently take every value from the service you pick and whatever you type on the booking form — there are no saved defaults. Editing a service under Services & packages is the closest thing today. These defaults are planned:"
        items={[
          'Default booking duration',
          'Default service',
          'Default deposit percentage or amount',
          'Default location',
          'Default booking notes',
          'Default reminder time',
          'Cancellation policy',
        ]}
      />
    </SettingsDetailScreen>
  );
}
