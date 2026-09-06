const { withEntitlementsPlist } = require('expo/config-plugins');

// TEMPORARY: free Apple Personal Team, local iOS development only.
// Register FIRST: entitlement mods execute in reverse registration order, so this
// cleanup runs after expo-notifications and Clerk.
// Remove this override and re-enable Clerk appleSignIn / ios.usesAppleSignIn when
// restoring Push Notifications and Sign in with Apple for paid-team production.
module.exports = function withPersonalTeamSigning(config) {
  return withEntitlementsPlist(config, (config) => {
    delete config.modResults['aps-environment'];
    delete config.modResults['com.apple.developer.applesignin'];
    return config;
  });
};
