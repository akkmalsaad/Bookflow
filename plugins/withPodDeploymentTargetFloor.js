const { withPodfile } = require('expo/config-plugins');

/**
 * Raises any CocoaPods target whose iOS deployment target is below the app's own minimum.
 *
 * Xcode 26 only builds for iOS 15.0 and later, but several pods still declare older minimums on
 * their *resource bundle* targets (RNSVG-RNSVGFilters 12.4, SDWebImage 9.0, Sentry 11.0, RevenueCat
 * / RevenueCatUI / PurchasesHybridCommon 13.0), which Xcode reports as build errors.
 *
 * The floor is the same value the Podfile already uses for `platform :ios` — the
 * `ios.deploymentTarget` Podfile property, or Expo SDK 54's default of 15.1 — so the app's
 * supported iOS range never changes. Targets that already require a higher version are left alone;
 * nothing is ever lowered.
 *
 * It runs inside the existing `post_install` hook, after `react_native_post_install`, rather than
 * replacing it, and is written into the Podfile on every prebuild so the fix survives Continuous
 * Native Generation. It only edits build settings CocoaPods generates; the Pods project itself is
 * never patched by hand.
 */

const MARKER = 'bookflow-pod-deployment-target-floor';

const SNIPPET = `
    # @generated begin ${MARKER} - see plugins/withPodDeploymentTargetFloor.js
    # Some pods' resource bundles still declare iOS minimums Xcode no longer supports. Raise only
    # those below the app's own minimum (the platform version above); never lower a higher one.
    bookflow_minimum_ios = podfile_properties['ios.deploymentTarget'] || '15.1'
    installer.pods_project.targets.each do |pod_target|
      pod_target.build_configurations.each do |build_configuration|
        current_target = build_configuration.build_settings['IPHONEOS_DEPLOYMENT_TARGET']
        next if current_target.nil? || current_target.to_s.empty?
        if Gem::Version.new(current_target.to_s) < Gem::Version.new(bookflow_minimum_ios)
          build_configuration.build_settings['IPHONEOS_DEPLOYMENT_TARGET'] = bookflow_minimum_ios
        end
      end
    end
    # @generated end ${MARKER}
`;

/** Inserts the snippet right after the `react_native_post_install(...)` call. Idempotent. */
function applyDeploymentTargetFloor(podfile) {
  if (podfile.includes(`@generated begin ${MARKER}`)) return podfile;

  // The call spans several lines and ends with a line holding only its closing parenthesis.
  const call = /( *react_native_post_install\([\s\S]*?\n *\)\n)/;
  const match = call.exec(podfile);
  if (!match) {
    throw new Error(
      `[${MARKER}] Could not find react_native_post_install(...) in the Podfile, so the iOS deployment-target floor was not added.`,
    );
  }
  const end = match.index + match[0].length;
  return `${podfile.slice(0, end)}${SNIPPET}${podfile.slice(end)}`;
}

function withPodDeploymentTargetFloor(config) {
  return withPodfile(config, (config) => {
    config.modResults.contents = applyDeploymentTargetFloor(config.modResults.contents);
    return config;
  });
}

module.exports = withPodDeploymentTargetFloor;
module.exports.applyDeploymentTargetFloor = applyDeploymentTargetFloor;
