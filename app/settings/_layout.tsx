import { Stack } from 'expo-router';

/** Every screen behind a settings row draws its own header, so the stack stays chrome-free. */
export default function SettingsStackLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
