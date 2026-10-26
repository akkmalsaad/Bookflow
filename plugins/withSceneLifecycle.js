const { withAppDelegate, withInfoPlist } = require('expo/config-plugins');

/**
 * Adopts the UIScene life cycle.
 *
 * Apps built with the iOS 27 SDK (Xcode 27) must use it: without a scene manifest UIKit stops at
 * launch with "Application failed to launch: UIScene life cycle is required for apps built with this
 * SDK" (an EXC_BREAKPOINT in AppDelegate). Expo SDK 54's template still creates its window in
 * `application(_:didFinishLaunchingWithOptions:)`, so this plugin:
 *
 *   1. adds a single-scene `UIApplicationSceneManifest` to Info.plist;
 *   2. moves window creation and `startReactNative` into a `SceneDelegate` (declared in
 *      AppDelegate.swift, so the Xcode project needs no new file), and delivers
 *      didFinishLaunching to Expo's subscribers only after that — the order the template relies on
 *      (expo-dev-launcher requires the window at that point);
 *   3. forwards URLs, universal links and foreground/background events from the scene to the
 *      existing AppDelegate methods, so Expo's app delegate subscribers (dev launcher, linking,
 *      notifications…) and React Native's Linking keep receiving them exactly as before.
 *
 * UIScene has been available since iOS 13, so builds made with older SDKs behave the same. Nothing
 * is disabled or bypassed. Idempotent, and it fails loudly if the template ever changes shape.
 */

const MARKER = 'bookflow-scene-lifecycle';

const WINDOW_BLOCK = /#if os\(iOS\) \|\| os\(tvOS\)\n {4}window = UIWindow\(frame: UIScreen\.main\.bounds\)\n {4}factory\.startReactNative\(\n {6}withModuleName: "main",\n {6}in: window,\n {6}launchOptions: launchOptions\)\n#endif\n/;

const SCENE_DELEGATE = `
// @generated begin ${MARKER} - see plugins/withSceneLifecycle.js
/// Apps built with the iOS 27 SDK must use the UIScene life cycle or UIKit refuses to launch them.
/// Under it there is no window during application(_:didFinishLaunchingWithOptions:), so this scene
/// creates the window, starts React Native in it, and only then lets AppDelegate deliver the launch
/// to Expo's subscribers — the same order Expo SDK 54's template uses, so the dev launcher finds its
/// window. URLs and lifecycle events are passed on to AppDelegate exactly as before.
class SceneDelegate: UIResponder, UIWindowSceneDelegate {
  var window: UIWindow?

  private var appDelegate: AppDelegate? { UIApplication.shared.delegate as? AppDelegate }

  func scene(_ scene: UIScene, willConnectTo session: UISceneSession, options connectionOptions: UIScene.ConnectionOptions) {
    guard let windowScene = scene as? UIWindowScene, let appDelegate = appDelegate else { return }
    let window = UIWindow(windowScene: windowScene)
    self.window = window

    if appDelegate.hasDeliveredLaunch {
      // The system reconnected the scene: React Native is already running, so its root view
      // controller moves to the new window instead of starting a second time.
      window.rootViewController = appDelegate.window?.rootViewController
      appDelegate.window = window
      window.makeKeyAndVisible()
      if !connectionOptions.urlContexts.isEmpty {
        self.scene(scene, openURLContexts: connectionOptions.urlContexts)
      }
      return
    }

    appDelegate.window = window
    // A link that launched the app arrives the way it does without scenes: in the launch options
    // first, then once through application(_:open:options:) after launch. expo-dev-launcher relies
    // on exactly that — for a link launch it waits for the open-URL call to load the project.
    var launchOptions = appDelegate.launchOptions ?? [:]
    if let url = connectionOptions.urlContexts.first?.url {
      launchOptions[.url] = url
    }
    appDelegate.launchOptions = launchOptions
    appDelegate.reactNativeFactory?.startReactNative(withModuleName: "main", in: window, launchOptions: launchOptions)
    appDelegate.deliverLaunchToSubscribers()

    if !connectionOptions.urlContexts.isEmpty {
      self.scene(scene, openURLContexts: connectionOptions.urlContexts)
    }
    if let activity = connectionOptions.userActivities.first {
      self.scene(scene, continue: activity)
    }
  }

  func scene(_ scene: UIScene, openURLContexts URLContexts: Set<UIOpenURLContext>) {
    guard let appDelegate = appDelegate else { return }
    for context in URLContexts {
      var options: [UIApplication.OpenURLOptionsKey: Any] = [.openInPlace: context.options.openInPlace]
      if let source = context.options.sourceApplication { options[.sourceApplication] = source }
      if let annotation = context.options.annotation { options[.annotation] = annotation }
      _ = appDelegate.application(UIApplication.shared, open: context.url, options: options)
    }
  }

  func scene(_ scene: UIScene, continue userActivity: NSUserActivity) {
    _ = appDelegate?.application(UIApplication.shared, continue: userActivity, restorationHandler: { _ in })
  }

  func sceneDidBecomeActive(_ scene: UIScene) {
    appDelegate?.applicationDidBecomeActive(UIApplication.shared)
  }

  func sceneWillResignActive(_ scene: UIScene) {
    appDelegate?.applicationWillResignActive(UIApplication.shared)
  }

  func sceneWillEnterForeground(_ scene: UIScene) {
    appDelegate?.applicationWillEnterForeground(UIApplication.shared)
  }

  func sceneDidEnterBackground(_ scene: UIScene) {
    appDelegate?.applicationDidEnterBackground(UIApplication.shared)
  }
}
// @generated end ${MARKER}
`;

const DELIVER_LAUNCH = `
  // @generated begin ${MARKER}-launch - see plugins/withSceneLifecycle.js
  /// Whether Expo's subscribers have received didFinishLaunching. Set once.
  private(set) var hasDeliveredLaunch = false

  /// Delivers the launch to Expo's app delegate subscribers once the scene's window exists and React
  /// Native has been started in it — the order the Expo template guarantees. Runs at most once.
  func deliverLaunchToSubscribers() {
    guard !hasDeliveredLaunch else { return }
    hasDeliveredLaunch = true
    _ = super.application(UIApplication.shared, didFinishLaunchingWithOptions: launchOptions)
  }
  // @generated end ${MARKER}-launch
`;

/** AppDelegate.swift with window creation and the subscriber launch moved to SceneDelegate. */
function applySceneLifecycleToAppDelegate(contents) {
  if (contents.includes(`@generated begin ${MARKER}`)) return contents;
  if (!WINDOW_BLOCK.test(contents)) {
    throw new Error(`[${MARKER}] AppDelegate.swift does not match the Expo SDK 54 template; the UIScene life cycle was not added.`);
  }
  const anchor = '  var reactNativeFactory: RCTReactNativeFactory?\n';
  const superLaunch = '    return super.application(application, didFinishLaunchingWithOptions: launchOptions)\n  }\n';
  if (!contents.includes(anchor) || !contents.includes(superLaunch)) {
    throw new Error(`[${MARKER}] AppDelegate.swift does not match the Expo SDK 54 template; the UIScene life cycle was not added.`);
  }
  return `${contents
    .replace(anchor, `${anchor}  /// Kept for SceneDelegate, which starts React Native once UIKit connects the scene.\n  var launchOptions: [UIApplication.LaunchOptionsKey: Any]?\n`)
    .replace(
      WINDOW_BLOCK,
      '    // UIScene life cycle: there is no window yet. SceneDelegate (below) creates it, starts React\n    // Native in it and then calls deliverLaunchToSubscribers().\n    self.launchOptions = launchOptions\n',
    )
    .replace(superLaunch, `    return true\n  }\n${DELIVER_LAUNCH}`)
    .trimEnd()}\n${SCENE_DELEGATE}`;
}

/** Info.plist with a single-window scene manifest pointing at SceneDelegate. */
function applySceneManifest(infoPlist) {
  return {
    ...infoPlist,
    UIApplicationSceneManifest: {
      UIApplicationSupportsMultipleScenes: false,
      UISceneConfigurations: {
        UIWindowSceneSessionRoleApplication: [
          {
            UISceneConfigurationName: 'Default Configuration',
            UISceneDelegateClassName: '$(PRODUCT_MODULE_NAME).SceneDelegate',
          },
        ],
      },
    },
  };
}

function withSceneLifecycle(config) {
  config = withInfoPlist(config, (config) => {
    config.modResults = applySceneManifest(config.modResults);
    return config;
  });
  return withAppDelegate(config, (config) => {
    if (config.modResults.language !== 'swift') {
      throw new Error(`[${MARKER}] Expected a Swift AppDelegate.`);
    }
    config.modResults.contents = applySceneLifecycleToAppDelegate(config.modResults.contents);
    return config;
  });
}

module.exports = withSceneLifecycle;
module.exports.applySceneLifecycleToAppDelegate = applySceneLifecycleToAppDelegate;
module.exports.applySceneManifest = applySceneManifest;
