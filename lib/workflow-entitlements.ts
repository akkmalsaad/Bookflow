/**
 * Who may use each booking-workflow feature.
 *
 * BookFlow had no existing policy for these features, so the assumption is the least surprising one
 * for a released app: every feature is available on Free and Pro alike, and anything that creates a
 * booking, customer or invoice still counts against the Free plan's existing monthly limits
 * (lib/plan-limits) — enforced again on the server for public submissions. Nothing previously
 * available is gated, and no price changes.
 *
 * To gate a feature behind Pro later, change its entry to 'pro' here; every entry point reads this.
 */
export type WorkflowFeature =
  | 'additionalCharges'
  | 'bookingForms'
  | 'quotations'
  | 'customerPages'
  | 'deliveryTracking'
  | 'jobMoney'
  | 'preparedMessages';

export const WORKFLOW_FEATURE_ACCESS: Record<WorkflowFeature, 'all' | 'pro'> = {
  additionalCharges: 'all',
  bookingForms: 'all',
  quotations: 'all',
  customerPages: 'all',
  deliveryTracking: 'all',
  jobMoney: 'all',
  preparedMessages: 'all',
};

export function canUseWorkflowFeature(feature: WorkflowFeature, isPro: boolean) {
  return WORKFLOW_FEATURE_ACCESS[feature] === 'all' || isPro;
}
