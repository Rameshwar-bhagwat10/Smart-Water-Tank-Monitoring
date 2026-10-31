import 'dart:async';
import 'dart:convert';
import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_database/firebase_database.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';
import 'package:http/http.dart' as http;
import '../config/firebase_config.dart';
import '../models/tank_telemetry.dart';

class ActivityEvent {
  final String text;
  final String time;
  final int colorHex;

  ActivityEvent({
    required this.text,
    required this.time,
    required this.colorHex,
  });
}

class TelemetryService {
  static final TelemetryService _instance = TelemetryService._internal();
  factory TelemetryService() => _instance;
  TelemetryService._internal();

  final String tankId = FirebaseConfig.defaultTankId;

  // Stream controllers
  final _telemetryController = StreamController<TankTelemetry>.broadcast();
  Stream<TankTelemetry> get telemetryStream => _telemetryController.stream;

  final _eventsController = StreamController<List<ActivityEvent>>.broadcast();
  Stream<List<ActivityEvent>> get eventsStream => _eventsController.stream;

  // Current state cache
  TankTelemetry _currentTelemetry = const TankTelemetry();
  TankTelemetry get current => _currentTelemetry;

  // Histories (max 60 points)
  static const int maxHistory = 60;
  final List<double> levelHistory = [];
  final List<double> flowHistory = [];
  final List<double> currentHistory = [];
  final List<ActivityEvent> events = [];

  // Current stats
  double peakCurrent = 0.0;
  double sumCurrent = 0.0;
  int countCurrent = 0;

  // Subscriptions & Timers
  StreamSubscription<DatabaseEvent>? _rtdbSubscription;
  Timer? _restPollTimer;
  bool _isListening = false;

  // Optimistic locks
  String? _optimisticPump;
  int _optimisticPumpExpires = 0;
  String? _optimisticMode;
  int _optimisticModeExpires = 0;

  // Previous tracking for alerts/logs
  String _lastPump = '';
  String _lastMode = '';
  String _lastStatus = '';
  bool _lastProbe = false;
  int _lastFullAlarmMs = 0;

  void start() {
    if (_isListening) return;
    _isListening = true;

    addEvent('Station telemetry connecting...', 0xFFD4F63D);

    // 1. Firebase Native RTDB Listener
    try {
      final db = FirebaseDatabase.instanceFor(
        app: Firebase.app(),
        databaseURL: FirebaseConfig.databaseURL,
      );
      final ref = db.ref('tanks/$tankId/live');

      _rtdbSubscription = ref.onValue.listen((event) {
        if (event.snapshot.value != null) {
          final data = event.snapshot.value;
          if (data is Map) {
            _handleIncomingData(Map<dynamic, dynamic>.from(data));
          }
        }
      }, onError: (err) {
        debugPrint('[Telemetry] RTDB stream error: $err');
      });
    } catch (e) {
      debugPrint('[Telemetry] Failed to init native RTDB: $e');
    }

    // 2. High-speed REST backup stream/poll (every 250ms) to ensure continuous ultra-fast reception
    _restPollTimer = Timer.periodic(const Duration(milliseconds: 250), (_) {
      _pollRestTelemetry();
    });

    // Run first poll immediately
    _pollRestTelemetry();
  }

  void stop() {
    _isListening = false;
    _rtdbSubscription?.cancel();
    _rtdbSubscription = null;
    _restPollTimer?.cancel();
    _restPollTimer = null;
  }

  Future<void> _pollRestTelemetry() async {
    try {
      final url = Uri.parse('${FirebaseConfig.databaseURL}/tanks/$tankId/live.json');
      final resp = await http.get(url).timeout(const Duration(milliseconds: 1500));
      if (resp.statusCode == 200 && resp.body != 'null') {
        final decoded = jsonDecode(resp.body);
        if (decoded is Map) {
          _handleIncomingData(decoded);
        }
      }
    } catch (_) {
      // Quiet fallback
    }
  }

  void _handleIncomingData(Map<dynamic, dynamic> map) {
    TankTelemetry parsed = TankTelemetry.fromMap(map);
    final now = DateTime.now().millisecondsSinceEpoch;

    // Apply optimistic pump if within lock window
    if (_optimisticPump != null && now < _optimisticPumpExpires) {
      if (parsed.pumpState == _optimisticPump) {
        _optimisticPump = null; // Confirmed by hardware
      } else {
        parsed = parsed.copyWith(pumpState: _optimisticPump);
      }
    } else {
      _optimisticPump = null;
    }

    // Apply optimistic mode if within lock window
    if (_optimisticMode != null && now < _optimisticModeExpires) {
      if (parsed.controlMode == _optimisticMode) {
        _optimisticMode = null; // Confirmed by hardware
      } else {
        parsed = parsed.copyWith(controlMode: _optimisticMode);
      }
    } else {
      _optimisticMode = null;
    }

    _currentTelemetry = parsed;

    // Update histories
    if (parsed.levelPercent >= 0) {
      levelHistory.add(parsed.levelPercent);
      if (levelHistory.length > maxHistory) levelHistory.removeAt(0);
    }

    final f = parsed.flowRateLpm >= 0 ? parsed.flowRateLpm : 0.0;
    flowHistory.add(f);
    if (flowHistory.length > maxHistory) flowHistory.removeAt(0);

    final c = parsed.pumpCurrentA >= 0 ? parsed.pumpCurrentA : 0.0;
    currentHistory.add(c);
    if (currentHistory.length > maxHistory) currentHistory.removeAt(0);

    if (c > peakCurrent) peakCurrent = c;
    sumCurrent += c;
    countCurrent++;

    // State change events
    if (_lastPump.isNotEmpty && _lastPump != parsed.pumpState) {
      if (parsed.pumpState == 'ON') {
        addEvent('Pump started', 0xFFD4F63D);
        HapticFeedback.mediumImpact();
      } else {
        addEvent('Pump stopped', 0xFFFF4757);
        HapticFeedback.mediumImpact();
      }
    }
    _lastPump = parsed.pumpState;

    if (_lastMode.isNotEmpty && _lastMode != parsed.controlMode) {
      addEvent('Mode → ${parsed.controlMode}', 0xFFAF52DE);
      HapticFeedback.lightImpact();
    }
    _lastMode = parsed.controlMode;

    if (_lastStatus.isNotEmpty && _lastStatus != parsed.controllerStatus) {
      addEvent(
        'State → ${parsed.controllerStatus}',
        (parsed.controllerStatus == 'Normal' || parsed.controllerStatus == 'IDLE')
            ? 0xFFD4F63D
            : 0xFFFFA928,
      );
    }
    _lastStatus = parsed.controllerStatus;

    if (parsed.waterProbe && !_lastProbe) {
      addEvent('Water level sensor probe DETECTED', 0xFFFF4757);
      HapticFeedback.heavyImpact();
    }
    _lastProbe = parsed.waterProbe;

    // Full Tank Alarm when >= 95% AND water probe detected
    if (parsed.levelPercent >= 95.0 && parsed.waterProbe) {
      if (now - _lastFullAlarmMs >= 4000) {
        _lastFullAlarmMs = now;
        SystemSound.play(SystemSoundType.alert);
        HapticFeedback.heavyImpact();
      }
    }

    _telemetryController.add(_currentTelemetry);
  }

  void addEvent(String text, int colorHex) {
    final now = DateTime.now();
    final timeStr =
        '${now.hour.toString().padLeft(2, '0')}:${now.minute.toString().padLeft(2, '0')}:${now.second.toString().padLeft(2, '0')}';
    events.insert(0, ActivityEvent(text: text, time: timeStr, colorHex: colorHex));
    if (events.length > 25) events.removeLast();
    _eventsController.add(List.unmodifiable(events));
  }

  // ============================================================================
  // ULTRA-FAST DUAL-CHANNEL ACTUATION (<1ms optimistic + LAN REST + Cloud RTDB)
  // ============================================================================
  Future<void> sendCommand({
    required String? userId,
    required String mode,
    required String pumpState,
  }) async {
    final now = DateTime.now().millisecondsSinceEpoch;
    HapticFeedback.selectionClick();

    // 1. Instant optimistic update (<1ms visual feedback)
    _optimisticMode = mode;
    _optimisticModeExpires = now + 3500;
    _optimisticPump = pumpState;
    _optimisticPumpExpires = now + 3500;

    _currentTelemetry = _currentTelemetry.copyWith(
      controlMode: mode,
      pumpState: mode == 'MANUAL' ? pumpState : _currentTelemetry.pumpState,
      updatedAt: now,
    );
    _telemetryController.add(_currentTelemetry);

    // 2. Direct LAN fast-path actuation (1ms latency when on same Wi-Fi)
    final targets = <Uri>[];
    if (_currentTelemetry.deviceIp.isNotEmpty) {
      targets.add(Uri.parse(
          'http://${_currentTelemetry.deviceIp}/api/command?mode=$mode&pump=$pumpState&_t=$now'));
    }
    targets.add(Uri.parse(
        'http://192.168.4.1/api/command?mode=$mode&pump=$pumpState&_t=$now'));

    for (final u in targets) {
      http.get(u).timeout(const Duration(milliseconds: 350)).catchError((_) => http.Response('', 500));
    }

    // 3. Cloud RTDB write (synchronizes fleet & firmware in 30ms)
    final cmdId = 'cmd_${now}_${(now % 99999).toString()}';
    final cmdPayload = {
      'commandId': cmdId,
      'requestedMode': mode,
      'requestedPumpState': pumpState,
      'requestedAt': now,
      'requestedBy': userId ?? 'mobile-operator',
    };

    final liveUpdate = {
      'controlMode': mode,
      'updatedAt': now,
    };
    if (mode == 'MANUAL') {
      liveUpdate['pumpState'] = pumpState;
    }

    try {
      final db = FirebaseDatabase.instanceFor(
        app: Firebase.app(),
        databaseURL: FirebaseConfig.databaseURL,
      );
      await Future.wait([
        db.ref('tanks/$tankId/commands').set(cmdPayload),
        db.ref('tanks/$tankId/live').update(liveUpdate),
      ]);
    } catch (e) {
      // Fallback via HTTP REST PUT if native SDK encounters timeout
      final cmdUrl = Uri.parse('${FirebaseConfig.databaseURL}/tanks/$tankId/commands.json');
      final liveUrl = Uri.parse('${FirebaseConfig.databaseURL}/tanks/$tankId/live.json');
      try {
        await Future.wait([
          http.put(cmdUrl, body: jsonEncode(cmdPayload)),
          http.patch(liveUrl, body: jsonEncode(liveUpdate)),
        ]);
      } catch (_) {}
    }
  }
}
