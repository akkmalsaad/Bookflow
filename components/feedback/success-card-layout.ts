import { StyleSheet } from 'react-native';

// These are the original Add Expense / PaymentModalShell surface values.
// Height is measured from the unchanged Expense form, never from confirmation text.
export const SUCCESS_SAFE_AREA_GAP = 12;
export const successCardLayout = StyleSheet.create({
  backdrop: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  card: {
    borderRadius: 28,
    borderWidth: 1,
    elevation: 14,
    maxHeight: '100%',
    maxWidth: 520,
    padding: 20,
    shadowOffset: { height: 10, width: 0 },
    shadowOpacity: 0.3,
    shadowRadius: 24,
    width: '100%',
  },
});
