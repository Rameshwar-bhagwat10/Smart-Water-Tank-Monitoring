import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import '../theme/app_theme.dart';

class ControlsWidget extends StatelessWidget {
  final String mode; // 'AUTO' or 'MANUAL'
  final String pumpState; // 'ON' or 'OFF'
  final double level;
  final bool waterProbe;
  final String actuationLatency;
  final ValueChanged<String> onModeChange;
  final ValueChanged<String> onPumpChange;

  const ControlsWidget({
    super.key,
    required this.mode,
    required this.pumpState,
    required this.level,
    required this.waterProbe,
    required this.actuationLatency,
    required this.onModeChange,
    required this.onPumpChange,
  });

  @override
  Widget build(BuildContext context) {
    final isAuto = mode == 'AUTO';
    final isPumpOn = pumpState == 'ON';

    String statusText;
    Color statusColor = AppColors.text;

    if (isAuto) {
      if (level >= 95.0 && waterProbe) {
        statusText = 'Auto: Tank FULL (Pump Idle)';
        statusColor = AppColors.orange;
      } else if (isPumpOn) {
        statusText = 'Auto: Pump RUNNING (Filling)';
        statusColor = AppColors.accent;
      } else if (level >= 0 && level <= 20.0) {
        statusText = 'Auto: Tank LOW (Auto-Start)';
        statusColor = AppColors.accent;
      } else {
        statusText = 'Auto: Standby';
        statusColor = AppColors.textSec;
      }
    } else {
      statusText = isPumpOn ? 'Manual: Pump RUNNING' : 'Manual: Pump STOPPED';
      statusColor = isPumpOn ? AppColors.accent : AppColors.red;
    }

    return Container(
      padding: const EdgeInsets.all(18),
      decoration: BoxDecoration(
        color: AppColors.card,
        borderRadius: BorderRadius.circular(24),
        border: Border.all(color: AppColors.border),
        boxShadow: const [
          BoxShadow(
            color: Colors.black38,
            blurRadius: 16,
            offset: Offset(0, 8),
          ),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'Control Mode',
            style: GoogleFonts.outfit(
              fontSize: 15,
              fontWeight: FontWeight.w600,
              color: AppColors.text,
            ),
          ),
          const SizedBox(height: 12),

          // Segmented Switch [Automatic] | [Manual]
          Container(
            padding: const EdgeInsets.all(4),
            decoration: BoxDecoration(
              color: AppColors.cardInset,
              borderRadius: BorderRadius.circular(9999),
              border: Border.all(color: AppColors.border),
            ),
            child: Row(
              children: [
                Expanded(
                  child: GestureDetector(
                    onTap: () => onModeChange('AUTO'),
                    behavior: HitTestBehavior.opaque,
                    child: AnimatedContainer(
                      duration: const Duration(milliseconds: 150),
                      padding: const EdgeInsets.symmetric(vertical: 10),
                      decoration: BoxDecoration(
                        color: isAuto ? AppColors.accent : Colors.transparent,
                        borderRadius: BorderRadius.circular(9999),
                        boxShadow: isAuto
                            ? [
                                BoxShadow(
                                  color: AppColors.accent.withValues(alpha: 0.4),
                                  blurRadius: 10,
                                  offset: const Offset(0, 2),
                                ),
                              ]
                            : null,
                      ),
                      alignment: Alignment.center,
                      child: Text(
                        'Automatic',
                        style: GoogleFonts.outfit(
                          fontSize: 13,
                          fontWeight: FontWeight.w700,
                          color: isAuto ? AppColors.accentDark : AppColors.textSec,
                        ),
                      ),
                    ),
                  ),
                ),
                Expanded(
                  child: GestureDetector(
                    onTap: () => onModeChange('MANUAL'),
                    behavior: HitTestBehavior.opaque,
                    child: AnimatedContainer(
                      duration: const Duration(milliseconds: 150),
                      padding: const EdgeInsets.symmetric(vertical: 10),
                      decoration: BoxDecoration(
                        color: !isAuto ? AppColors.accent : Colors.transparent,
                        borderRadius: BorderRadius.circular(9999),
                        boxShadow: !isAuto
                            ? [
                                BoxShadow(
                                  color: AppColors.accent.withValues(alpha: 0.4),
                                  blurRadius: 10,
                                  offset: const Offset(0, 2),
                                ),
                              ]
                            : null,
                      ),
                      alignment: Alignment.center,
                      child: Text(
                        'Manual',
                        style: GoogleFonts.outfit(
                          fontSize: 13,
                          fontWeight: FontWeight.w700,
                          color: !isAuto ? AppColors.accentDark : AppColors.textSec,
                        ),
                      ),
                    ),
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 14),

          // Action Buttons [⚡ Start] | [🛑 Stop]
          Row(
            children: [
              Expanded(
                child: Opacity(
                  opacity: isAuto ? 0.45 : 1.0,
                  child: GestureDetector(
                    onTap: isAuto ? null : () => onPumpChange('ON'),
                    child: Container(
                      padding: const EdgeInsets.symmetric(vertical: 13),
                      decoration: BoxDecoration(
                        gradient: LinearGradient(
                          colors: [
                            AppColors.accent.withValues(alpha: isPumpOn ? 0.28 : 0.12),
                            AppColors.accent.withValues(alpha: isPumpOn ? 0.16 : 0.04),
                          ],
                          begin: Alignment.topCenter,
                          end: Alignment.bottomCenter,
                        ),
                        borderRadius: BorderRadius.circular(16),
                        border: Border.all(
                          color: isPumpOn
                              ? AppColors.accent
                              : AppColors.accent.withValues(alpha: 0.35),
                          width: 1.5,
                        ),
                        boxShadow: (isPumpOn && !isAuto)
                            ? [
                                BoxShadow(
                                  color: AppColors.accent.withValues(alpha: 0.45),
                                  blurRadius: 16,
                                  offset: const Offset(0, 4),
                                ),
                              ]
                            : null,
                      ),
                      alignment: Alignment.center,
                      child: Row(
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          const Text('⚡', style: TextStyle(fontSize: 14)),
                          const SizedBox(width: 6),
                          Text(
                            'Start',
                            style: GoogleFonts.outfit(
                              fontSize: 14,
                              fontWeight: FontWeight.w700,
                              color: AppColors.accent,
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Opacity(
                  opacity: isAuto ? 0.45 : 1.0,
                  child: GestureDetector(
                    onTap: isAuto ? null : () => onPumpChange('OFF'),
                    child: Container(
                      padding: const EdgeInsets.symmetric(vertical: 13),
                      decoration: BoxDecoration(
                        gradient: LinearGradient(
                          colors: [
                            AppColors.red.withValues(alpha: !isPumpOn ? 0.28 : 0.12),
                            AppColors.red.withValues(alpha: !isPumpOn ? 0.16 : 0.04),
                          ],
                          begin: Alignment.topCenter,
                          end: Alignment.bottomCenter,
                        ),
                        borderRadius: BorderRadius.circular(16),
                        border: Border.all(
                          color: !isPumpOn
                              ? AppColors.red
                              : AppColors.red.withValues(alpha: 0.35),
                          width: 1.5,
                        ),
                        boxShadow: (!isPumpOn && !isAuto)
                            ? [
                                BoxShadow(
                                  color: AppColors.red.withValues(alpha: 0.45),
                                  blurRadius: 16,
                                  offset: const Offset(0, 4),
                                ),
                              ]
                            : null,
                      ),
                      alignment: Alignment.center,
                      child: Row(
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          const Text('🛑', style: TextStyle(fontSize: 14)),
                          const SizedBox(width: 6),
                          Text(
                            'Stop',
                            style: GoogleFonts.outfit(
                              fontSize: 14,
                              fontWeight: FontWeight.w700,
                              color: AppColors.red,
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),

          // Footer Status Row
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text(
                statusText,
                style: GoogleFonts.inter(
                  fontSize: 12,
                  fontWeight: FontWeight.w600,
                  color: statusColor,
                ),
              ),
              Text(
                actuationLatency,
                style: GoogleFonts.jetBrainsMono(
                  fontSize: 11,
                  color: AppColors.textSec,
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}
