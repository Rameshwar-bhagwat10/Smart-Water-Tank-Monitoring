import 'package:firebase_core/firebase_core.dart';

class FirebaseConfig {
  static const String apiKey = "AIzaSyCd20LOQTNcqOWLAQn6Z42aWat3l9zsQ0g";
  static const String authDomain = "smart-water-tank-monitor-c38c0.firebaseapp.com";
  static const String databaseURL = "https://smart-water-tank-monitor-c38c0-default-rtdb.firebaseio.com";
  static const String projectId = "smart-water-tank-monitor-c38c0";
  static const String storageBucket = "smart-water-tank-monitor-c38c0.appspot.com";
  static const String messagingSenderId = "792718502432";
  static const String appId = "1:792718502432:web:7859d2308094c480e56a45";

  static const String defaultTankId = "tank-01";

  static FirebaseOptions get currentPlatformOptions {
    return const FirebaseOptions(
      apiKey: apiKey,
      appId: appId,
      messagingSenderId: messagingSenderId,
      projectId: projectId,
      databaseURL: databaseURL,
      storageBucket: storageBucket,
      authDomain: authDomain,
    );
  }
}
