import 'dart:async';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import '../models/tank_telemetry.dart';
import '../services/auth_service.dart';
import '../services/telemetry_service.dart';
import '../theme/app_theme.dart';
import '../widgets/activity_log_widget.dart';
import '../widgets/controls_widget.dart';
import '../widgets/current_gauge_widget.dart';
import '../widgets/flow_chart_widget.dart';
import '../widgets/level_chart_widget.dart';
import '../widgets/metrics_grid_widget.dart';
import '../widgets/specs_footer_widget.dart';
import '../widgets/tank_cylinder_widget.dart';

class DashboardScreen extends StatefulWidget {
  final User? user;
  final bool isLocalMode;
  final VoidCallback? onSwitchToCloud;

  const DashboardScreen({
    super.key,
    this.user,
    this.isLocalMode = false,
    this.onSwitchToCloud,
  });

  @override
  State<DashboardScreen> createState() => _DashboardScreenState();
}

class _DashboardScreenState extends State<DashboardScreen> {
  final _telemetryService = TelemetryService();
  final _authService = AuthService();

  StreamSubscription<TankTelemetry>? _telemetrySub;
  StreamSubscription<List<ActivityEvent>>? _eventsSub;

  TankTelemetry _telemetry = const TankTelemetry();
  List<ActivityEvent> _events = [];
  String _actuationLatency = 'Cloud RTDB';

  @override
  void initState() {
    super.initState();
    if (widget.isLocalMode) {
      _telemetryService.setMode(StationConnectionMode.local);
      _actuationLatency = 'Local Direct 0ms';
    } else {
      _telemetryService.setMode(StationConnectionMode.cloud);
      _actuationLatency = 'Cloud RTDB';
    }
    _telemetryService.start();

    _telemetry = _telemetryService.current;
    _events = List.from(_telemetryService.events);

    _telemetrySub = _telemetryService.telemetryStream.listen((data) {
      if (mounted) {
        setState(() {
          _telemetry = data;
        });
      }
    });

    _eventsSub = _telemetryService.eventsStream.listen((evs) {
      if (mounted) {
        setState(() {
          _events = evs;
        });
      }
    });
  }

  @override
  void dispose() {
    _telemetrySub?.cancel();
    _eventsSub?.cancel();
    _telemetryService.stop();
    super.dispose();
  }

  Future<void> _handleModeChange(String newMode) async {
    final t0 = DateTime.now().millisecondsSinceEpoch;
    setState(() {
      _actuationLatency = 'Switching 0ms';
    });

    try {
      await _telemetryService.sendCommand(
        userId: widget.user?.uid,
        mode: newMode,
        pumpState: _telemetry.pumpState == 'ON' ? 'ON' : 'OFF',
      );
      final elapsed = DateTime.now().millisecondsSinceEpoch - t0;
      if (mounted) {
        setState(() {
          _actuationLatency = _telemetryService.connectionMode == StationConnectionMode.local
              ? 'Local $elapsed ms'
              : 'Synced $elapsed ms';
        });
      }
    } catch (e) {
      if (mounted) {
        setState(() {
          _actuationLatency = 'Error: $e';
        });
      }
    }
  }

  Future<void> _handlePumpChange(String newPumpState) async {
    final t0 = DateTime.now().millisecondsSinceEpoch;
    setState(() {
      _actuationLatency = 'Actuating 0ms';
    });

    try {
      await _telemetryService.sendCommand(
        userId: widget.user?.uid,
        mode: 'MANUAL',
        pumpState: newPumpState,
      );
      final elapsed = DateTime.now().millisecondsSinceEpoch - t0;
      if (mounted) {
        setState(() {
          _actuationLatency = _telemetryService.connectionMode == StationConnectionMode.local
              ? 'Actuated $elapsed ms'
              : 'Actuated $elapsed ms';
        });
      }
    } catch (e) {
      if (mounted) {
        setState(() {
          _actuationLatency = 'Error: $e';
        });
      }
    }
  }

  Future<void> _handleLogout() async {
    if (widget.user != null) {
      await _authService.signOut();
    } else if (widget.onSwitchToCloud != null) {
      widget.onSwitchToCloud!();
    } else {
      Navigator.of(context).pop();
    }
  }

  void _showConnectionModeDialog() {
    final ipController = TextEditingController(text: _telemetryService.localStationIp);
    showModalBottomSheet(
      context: context,
      backgroundColor: AppColors.card,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(28)),
      ),
      builder: (ctx) {
        final isCloud = _telemetryService.connectionMode == StationConnectionMode.cloud;
        return Padding(
          padding: EdgeInsets.only(
            left: 20,
            right: 20,
            top: 20,
            bottom: MediaQuery.of(ctx).viewInsets.bottom + 24,
          ),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Center(
                child: Container(
                  width: 40,
                  height: 4,
                  decoration: BoxDecoration(
                    color: AppColors.border,
                    borderRadius: BorderRadius.circular(2),
                  ),
                ),
              ),
              const SizedBox(height: 18),
              Text(
                'Connection Mode Switcher',
                style: GoogleFonts.outfit(
                  fontSize: 18,
                  fontWeight: FontWeight.w700,
                  color: AppColors.text,
                ),
              ),
              const SizedBox(height: 6),
              Text(
                'Choose how your phone connects to the Smart Water Tank:',
                style: GoogleFonts.inter(fontSize: 12, color: AppColors.textSec),
              ),
              const SizedBox(height: 16),

              // Option 1: Cloud RTDB
              GestureDetector(
                onTap: () {
                  if (widget.user == null && widget.onSwitchToCloud != null) {
                    Navigator.pop(ctx);
                    widget.onSwitchToCloud!();
                    return;
                  }
                  setState(() {
                    _telemetryService.setMode(StationConnectionMode.cloud);
                    _actuationLatency = 'Cloud RTDB';
                  });
                  Navigator.pop(ctx);
                },
                child: Container(
                  padding: const EdgeInsets.all(14),
                  decoration: BoxDecoration(
                    color: isCloud ? AppColors.accent.withValues(alpha: 0.12) : AppColors.cardInset,
                    borderRadius: BorderRadius.circular(16),
                    border: Border.all(
                      color: isCloud ? AppColors.accent : AppColors.border,
                      width: 1.5,
                    ),
                  ),
                  child: Row(
                    children: [
                      const Text('☁️', style: TextStyle(fontSize: 22)),
                      const SizedBox(width: 12),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              'Cloud RTDB Mode',
                              style: GoogleFonts.outfit(
                                fontSize: 14,
                                fontWeight: FontWeight.w700,
                                color: isCloud ? AppColors.accent : AppColors.text,
                              ),
                            ),
                            Text(
                              'Access tank from anywhere worldwide via Firebase RTDB',
                              style: GoogleFonts.inter(fontSize: 11, color: AppColors.textSec),
                            ),
                          ],
                        ),
                      ),
                      if (isCloud)
                        const Icon(Icons.check_circle_rounded, color: AppColors.accent, size: 20),
                    ],
                  ),
                ),
              ),
              const SizedBox(height: 12),

              // Option 2: Direct Local Station (Offline)
              GestureDetector(
                onTap: () {
                  setState(() {
                    _telemetryService.setMode(
                      StationConnectionMode.local,
                      customIp: ipController.text.trim(),
                    );
                    _actuationLatency = 'Local Direct 0ms';
                  });
                  Navigator.pop(ctx);
                },
                child: Container(
                  padding: const EdgeInsets.all(14),
                  decoration: BoxDecoration(
                    color: !isCloud ? AppColors.cyan.withValues(alpha: 0.12) : AppColors.cardInset,
                    borderRadius: BorderRadius.circular(16),
                    border: Border.all(
                      color: !isCloud ? AppColors.cyan : AppColors.border,
                      width: 1.5,
                    ),
                  ),
                  child: Row(
                    children: [
                      const Text('⚡', style: TextStyle(fontSize: 22)),
                      const SizedBox(width: 12),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              'Direct Local Mode (Offline)',
                              style: GoogleFonts.outfit(
                                fontSize: 14,
                                fontWeight: FontWeight.w700,
                                color: !isCloud ? AppColors.cyan : AppColors.text,
                              ),
                            ),
                            Text(
                              'Sub-millisecond local LAN & AP without internet',
                              style: GoogleFonts.inter(fontSize: 11, color: AppColors.textSec),
                            ),
                          ],
                        ),
                      ),
                      if (!isCloud)
                        const Icon(Icons.check_circle_rounded, color: AppColors.cyan, size: 20),
                    ],
                  ),
                ),
              ),
              const SizedBox(height: 14),

              // NodeMCU IP field
              Row(
                children: [
                  Expanded(
                    child: Container(
                      padding: const EdgeInsets.symmetric(horizontal: 14),
                      decoration: BoxDecoration(
                        color: AppColors.cardInset,
                        borderRadius: BorderRadius.circular(12),
                        border: Border.all(color: AppColors.border),
                      ),
                      child: TextField(
                        controller: ipController,
                        style: GoogleFonts.jetBrainsMono(fontSize: 13, color: AppColors.text),
                        decoration: const InputDecoration(
                          hintText: '192.168.4.1 or IP',
                          hintStyle: TextStyle(color: AppColors.textMuted),
                          border: InputBorder.none,
                          prefixIcon: Icon(Icons.router_outlined, color: AppColors.textMuted, size: 18),
                        ),
                      ),
                    ),
                  ),
                  const SizedBox(width: 10),
                  ElevatedButton(
                    onPressed: () {
                      setState(() {
                        _telemetryService.setMode(
                          StationConnectionMode.local,
                          customIp: ipController.text.trim(),
                        );
                        _actuationLatency = 'Local Direct 0ms';
                      });
                      Navigator.pop(ctx);
                    },
                    style: ElevatedButton.styleFrom(
                      backgroundColor: AppColors.cyan,
                      foregroundColor: AppColors.accentDark,
                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
                    ),
                    child: Text(
                      'Apply IP',
                      style: GoogleFonts.outfit(fontWeight: FontWeight.w700, fontSize: 13),
                    ),
                  ),
                ],
              ),
            ],
          ),
        );
      },
    );
  }

  @override
  Widget build(BuildContext context) {
    final isLevelValid = _telemetry.levelPercent >= 0;

    return Scaffold(
      backgroundColor: AppColors.bg,
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              // Header Row
              _buildHeader(),
              const SizedBox(height: 16),

              // Hero Water Level Card (Monex / Kalo)
              _buildHeroWaterCard(isLevelValid),
              const SizedBox(height: 12),

              // Controls Card (Directly below water level box)
              ControlsWidget(
                mode: _telemetry.controlMode,
                pumpState: _telemetry.pumpState,
                level: _telemetry.levelPercent,
                waterProbe: _telemetry.waterProbe,
                actuationLatency: _actuationLatency,
                onModeChange: _handleModeChange,
                onPumpChange: _handlePumpChange,
              ),
              const SizedBox(height: 12),

              // Water Level Trend Chart
              LevelChartWidget(
                history: _telemetryService.levelHistory,
                currentLevel: _telemetry.levelPercent,
              ),
              const SizedBox(height: 12),

              // 2x2 Metrics Grid
              MetricsGridWidget(telemetry: _telemetry),
              const SizedBox(height: 12),

              // Flow Sparkline Chart
              FlowChartWidget(
                history: _telemetryService.flowHistory,
                currentFlow: _telemetry.flowRateLpm,
              ),
              const SizedBox(height: 12),

              // Pump Current Gauge Ring
              CurrentGaugeWidget(
                current: _telemetry.pumpCurrentA,
                peak: _telemetryService.peakCurrent,
                average: _telemetryService.countCurrent > 0
                    ? _telemetryService.sumCurrent / _telemetryService.countCurrent
                    : 0.0,
              ),
              const SizedBox(height: 12),

              // Activity Log Timeline
              ActivityLogWidget(events: _events),
              const SizedBox(height: 12),

              // Specs Footer
              SpecsFooterWidget(
                telemetry: _telemetry,
                userEmail: widget.user?.email ?? 'Direct Local Operator',
                tankId: _telemetryService.tankId,
              ),
              const SizedBox(height: 24),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildHeader() {
    final isCloud = _telemetryService.connectionMode == StationConnectionMode.cloud;

    return Row(
      mainAxisAlignment: MainAxisAlignment.spaceBetween,
      children: [
        // Brand Left
        Row(
          children: [
            Container(
              width: 38,
              height: 38,
              decoration: BoxDecoration(
                color: AppColors.card,
                borderRadius: BorderRadius.circular(12),
                border: Border.all(
                  color: (isCloud ? AppColors.accent : AppColors.cyan).withValues(alpha: 0.4),
                  width: 1.2,
                ),
                boxShadow: [
                  BoxShadow(
                    color: (isCloud ? AppColors.accent : AppColors.cyan).withValues(alpha: 0.2),
                    blurRadius: 10,
                  ),
                ],
              ),
              clipBehavior: Clip.antiAlias,
              child: Image.asset(
                'assets/icon/app_icon.png',
                width: 38,
                height: 38,
                fit: BoxFit.cover,
              ),
            ),
            const SizedBox(width: 10),
            Text(
              'Water Tank',
              style: GoogleFonts.outfit(
                fontSize: 18,
                fontWeight: FontWeight.w800,
                color: AppColors.text,
                letterSpacing: -0.3,
              ),
            ),
          ],
        ),

        // Status Badge (Tap to switch mode) + Logout Right
        Row(
          children: [
            GestureDetector(
              onTap: _showConnectionModeDialog,
              child: Container(
                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
                decoration: BoxDecoration(
                  color: AppColors.card,
                  borderRadius: BorderRadius.circular(9999),
                  border: Border.all(
                    color: (isCloud ? AppColors.accent : AppColors.cyan).withValues(alpha: 0.4),
                  ),
                ),
                child: Row(
                  children: [
                    Container(
                      width: 6,
                      height: 6,
                      decoration: BoxDecoration(
                        color: isCloud ? AppColors.accent : AppColors.cyan,
                        shape: BoxShape.circle,
                      ),
                    ),
                    const SizedBox(width: 6),
                    Text(
                      isCloud ? 'Cloud Live' : 'Local Direct',
                      style: GoogleFonts.outfit(
                        fontSize: 11,
                        fontWeight: FontWeight.w700,
                        color: isCloud ? AppColors.accent : AppColors.cyan,
                      ),
                    ),
                    const SizedBox(width: 4),
                    const Icon(Icons.swap_horiz_rounded, size: 12, color: AppColors.textSec),
                  ],
                ),
              ),
            ),
            const SizedBox(width: 8),
            GestureDetector(
              onTap: _handleLogout,
              child: Container(
                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
                decoration: BoxDecoration(
                  color: AppColors.card,
                  borderRadius: BorderRadius.circular(9999),
                  border: Border.all(color: AppColors.border),
                ),
                child: Row(
                  children: [
                    const Icon(
                      Icons.logout_rounded,
                      size: 13,
                      color: AppColors.textSec,
                    ),
                    const SizedBox(width: 4),
                    Text(
                      'Logout',
                      style: GoogleFonts.inter(
                        fontSize: 11,
                        fontWeight: FontWeight.w600,
                        color: AppColors.textSec,
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ],
        ),
      ],
    );
  }

  Widget _buildHeroWaterCard(bool isLevelValid) {
    return Container(
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        color: AppColors.card,
        borderRadius: BorderRadius.circular(28),
        border: Border.all(color: AppColors.border),
        boxShadow: const [
          BoxShadow(
            color: Colors.black45,
            blurRadius: 20,
            offset: Offset(0, 10),
          ),
        ],
      ),
      child: Row(
        children: [
          // Left: Cylinder Widget
          TankCylinderWidget(levelPercent: _telemetry.levelPercent),
          const SizedBox(width: 20),

          // Right: Level Info
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'Water Level',
                  style: GoogleFonts.outfit(
                    fontSize: 13,
                    fontWeight: FontWeight.w600,
                    color: AppColors.textSec,
                  ),
                ),
                const SizedBox(height: 4),
                Row(
                  crossAxisAlignment: CrossAxisAlignment.baseline,
                  textBaseline: TextBaseline.alphabetic,
                  children: [
                    Text(
                      isLevelValid
                          ? _telemetry.levelPercent.toStringAsFixed(1)
                          : '--',
                      style: GoogleFonts.outfit(
                        fontSize: 40,
                        fontWeight: FontWeight.w800,
                        color: AppColors.text,
                        letterSpacing: -1,
                      ),
                    ),
                    const SizedBox(width: 4),
                    Text(
                      '%',
                      style: GoogleFonts.outfit(
                        fontSize: 18,
                        fontWeight: FontWeight.w700,
                        color: AppColors.accent,
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 4),
                Row(
                  children: [
                    Text(
                      'Distance: ',
                      style: GoogleFonts.inter(
                        fontSize: 12,
                        color: AppColors.textSec,
                      ),
                    ),
                    Text(
                      isLevelValid
                          ? '${_telemetry.distanceCm.toStringAsFixed(1)} cm'
                          : '--',
                      style: GoogleFonts.outfit(
                        fontSize: 12,
                        fontWeight: FontWeight.w700,
                        color: AppColors.text,
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 10),
                Container(
                  padding:
                      const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                  decoration: BoxDecoration(
                    color: isLevelValid
                        ? AppColors.green.withValues(alpha: 0.12)
                        : Colors.white.withValues(alpha: 0.06),
                    borderRadius: BorderRadius.circular(9999),
                    border: Border.all(
                      color: isLevelValid
                          ? AppColors.green.withValues(alpha: 0.3)
                          : AppColors.border,
                    ),
                  ),
                  child: Text(
                    isLevelValid ? 'Sensor Active' : 'Waiting for telemetry...',
                    style: GoogleFonts.inter(
                      fontSize: 11,
                      fontWeight: FontWeight.w600,
                      color: isLevelValid ? AppColors.green : AppColors.textSec,
                    ),
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
