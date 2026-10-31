import 'dart:async';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:firebase_core/firebase_core.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:http/http.dart' as http;
import 'package:shared_preferences/shared_preferences.dart';
import 'config/firebase_config.dart';
import 'screens/dashboard_screen.dart';
import 'screens/login_screen.dart';
import 'services/auth_service.dart';
import 'services/telemetry_service.dart';
import 'theme/app_theme.dart';

void main() async {
  WidgetsFlutterBinding.ensureInitialized();

  // Dark obsidian status bar & system navigation bar
  SystemChrome.setSystemUIOverlayStyle(
    const SystemUiOverlayStyle(
      statusBarColor: Colors.transparent,
      statusBarIconBrightness: Brightness.light,
      systemNavigationBarColor: AppColors.bg,
      systemNavigationBarIconBrightness: Brightness.light,
    ),
  );

  // Initialize Firebase with exact project credentials
  try {
    await Firebase.initializeApp(
      options: FirebaseConfig.currentPlatformOptions,
    );
  } catch (e) {
    debugPrint('[Firebase] Initialization error: $e');
  }

  runApp(const SmartWaterTankApp());
}

class SmartWaterTankApp extends StatelessWidget {
  const SmartWaterTankApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Smart Water Tank',
      debugShowCheckedModeBanner: false,
      theme: AppTheme.darkTheme,
      home: const AuthGate(),
    );
  }
}

class AuthGate extends StatefulWidget {
  const AuthGate({super.key});

  @override
  State<AuthGate> createState() => _AuthGateState();
}

class _AuthGateState extends State<AuthGate> {
  bool _isDetecting = true;
  String? _detectedLocalIp;
  bool _forceCloud = false;

  @override
  void initState() {
    super.initState();
    _detectNetwork();
  }

  Future<void> _detectNetwork() async {
    // 1. Probe the tank's Access Point IP (192.168.4.1)
    // 2. Also probe last known device IP saved on local Wi-Fi router
    final prefs = await SharedPreferences.getInstance();
    final lastIp = prefs.getString('last_device_ip');

    final candidates = <String>['192.168.4.1'];
    if (lastIp != null && lastIp.isNotEmpty && lastIp != '192.168.4.1') {
      candidates.insert(0, lastIp);
    }

    String? foundIp;
    for (final ip in candidates) {
      try {
        final uri = Uri.parse('http://$ip/api/live?_t=${DateTime.now().millisecondsSinceEpoch}');
        final resp = await http.get(uri).timeout(const Duration(milliseconds: 500));
        if (resp.statusCode == 200) {
          foundIp = ip;
          break;
        }
      } catch (_) {
        // Not reachable on this IP
      }
    }

    if (foundIp != null) {
      TelemetryService().setMode(StationConnectionMode.local, customIp: foundIp);
    }

    if (mounted) {
      setState(() {
        _isDetecting = false;
        _detectedLocalIp = foundIp;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_isDetecting) {
      return const _InitialLoader();
    }

    // =========================================================================
    // 1. IF CONNECTED TO TANK'S WI-FI / LOCAL NETWORK:
    // Open the local dashboard directly — USER DOES NOT NEED TO LOGIN!
    // =========================================================================
    if (_detectedLocalIp != null && !_forceCloud) {
      return DashboardScreen(
        isLocalMode: true,
        onSwitchToCloud: () {
          setState(() {
            _forceCloud = true;
          });
        },
      );
    }

    // =========================================================================
    // 2. IF NOT CONNECTED TO TANK'S WI-FI:
    // Open the cloud dashboard / auth gate
    // =========================================================================
    return StreamBuilder<User?>(
      stream: AuthService().authStateChanges,
      builder: (context, snapshot) {
        if (snapshot.connectionState == ConnectionState.waiting) {
          return const _InitialLoader();
        }

        if (snapshot.hasData && snapshot.data != null) {
          return DashboardScreen(
            user: snapshot.data,
            isLocalMode: false,
          );
        }

        return const LoginScreen();
      },
    );
  }
}

class _InitialLoader extends StatelessWidget {
  const _InitialLoader();

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.bg,
      body: Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            // Master App Icon
            Container(
              width: 72,
              height: 72,
              decoration: BoxDecoration(
                borderRadius: BorderRadius.circular(22),
                boxShadow: [
                  BoxShadow(
                    color: AppColors.accent.withValues(alpha: 0.25),
                    blurRadius: 28,
                    offset: const Offset(0, 6),
                  ),
                ],
              ),
              child: ClipRRect(
                borderRadius: BorderRadius.circular(22),
                child: Image.asset(
                  'assets/icon/app_icon.png',
                  width: 72,
                  height: 72,
                  fit: BoxFit.cover,
                  errorBuilder: (_, __, ___) => Container(
                    color: AppColors.cardInset,
                    alignment: Alignment.center,
                    child: const Text('💧', style: TextStyle(fontSize: 32)),
                  ),
                ),
              ),
            ),
            const SizedBox(height: 22),
            Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Text(
                  'Smart Water Tank',
                  style: GoogleFonts.outfit(
                    fontSize: 22,
                    fontWeight: FontWeight.w800,
                    color: AppColors.text,
                    letterSpacing: -0.5,
                  ),
                ),
                const SizedBox(width: 6),
                Container(
                  width: 6,
                  height: 6,
                  decoration: const BoxDecoration(
                    color: AppColors.accent,
                    shape: BoxShape.circle,
                  ),
                ),
              ],
            ),
            const SizedBox(height: 6),
            Text(
              'Detecting Tank Network & Connection...',
              style: GoogleFonts.inter(
                fontSize: 13,
                fontWeight: FontWeight.w500,
                color: AppColors.textSec,
              ),
            ),
            const SizedBox(height: 26),
            const SizedBox(
              width: 26,
              height: 26,
              child: CircularProgressIndicator(
                strokeWidth: 2.5,
                color: AppColors.accent,
              ),
            ),
          ],
        ),
      ),
    );
  }
}
