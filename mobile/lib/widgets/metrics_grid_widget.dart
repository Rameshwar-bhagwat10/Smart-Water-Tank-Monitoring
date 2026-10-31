import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import '../models/tank_telemetry.dart';
import '../theme/app_theme.dart';

class MetricsGridWidget extends StatelessWidget {
  final TankTelemetry telemetry;

  const MetricsGridWidget({
    super.key,
    required this.telemetry,
  });

  @override
  Widget build(BuildContext context) {
    final isPumpOn = telemetry.pumpState == 'ON';

    return GridView.count(
      crossAxisCount: 2,
      crossAxisSpacing: 12,
      mainAxisSpacing: 12,
      shrinkWrap: true,
      physics: const NeverScrollableScrollPhysics(),
      childAspectRatio: 1.25,
      children: [
        // Chip 1: Flow Rate
        _buildMetricChip(
          title: 'Flow Rate',
          iconText: '💧',
          iconBg: AppColors.waterBlue.withValues(alpha: 0.15),
          value: telemetry.flowRateLpm.toStringAsFixed(1),
          unit: 'L/min',
          subtext: 'Total: ${telemetry.totalLitres.toStringAsFixed(2)} L',
        ),

        // Chip 2: Pump Current
        _buildMetricChip(
          title: 'Pump Current',
          iconText: '⚡',
          iconBg: AppColors.orange.withValues(alpha: 0.15),
          value: telemetry.pumpCurrentA.toStringAsFixed(2),
          unit: 'A',
          subtext: 'ACS712 A0 | Raw: ${telemetry.rawAdc}',
        ),

        // Chip 3: Relay
        _buildRelayChip(
          isPumpOn: isPumpOn,
          waterProbe: telemetry.waterProbe,
        ),

        // Chip 4: State
        _buildMetricChip(
          title: 'State',
          iconText: '🛡️',
          iconBg: AppColors.purple.withValues(alpha: 0.15),
          value: telemetry.controllerStatus,
          unit: '',
          subtext: 'Autonomous Interlock',
          isState: true,
        ),
      ],
    );
  }

  Widget _buildMetricChip({
    required String title,
    required String iconText,
    required Color iconBg,
    required String value,
    required String unit,
    required String subtext,
    bool isState = false,
  }) {
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: AppColors.card,
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: AppColors.border),
        boxShadow: const [
          BoxShadow(
            color: Colors.black26,
            blurRadius: 10,
            offset: Offset(0, 4),
          ),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text(
                title,
                style: GoogleFonts.outfit(
                  fontSize: 12,
                  fontWeight: FontWeight.w600,
                  color: AppColors.textSec,
                ),
              ),
              Container(
                width: 26,
                height: 26,
                decoration: BoxDecoration(
                  color: iconBg,
                  borderRadius: BorderRadius.circular(8),
                ),
                alignment: Alignment.center,
                child: Text(iconText, style: const TextStyle(fontSize: 13)),
              ),
            ],
          ),
          Row(
            crossAxisAlignment: CrossAxisAlignment.baseline,
            textBaseline: TextBaseline.alphabetic,
            children: [
              Flexible(
                child: Text(
                  value,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: GoogleFonts.outfit(
                    fontSize: isState ? 16 : 22,
                    fontWeight: FontWeight.w800,
                    color: AppColors.text,
                  ),
                ),
              ),
              if (unit.isNotEmpty) ...[
                const SizedBox(width: 4),
                Text(
                  unit,
                  style: GoogleFonts.outfit(
                    fontSize: 11,
                    fontWeight: FontWeight.w600,
                    color: AppColors.textSec,
                  ),
                ),
              ],
            ],
          ),
          Text(
            subtext,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: GoogleFonts.inter(
              fontSize: 10,
              fontWeight: FontWeight.w500,
              color: AppColors.textMuted,
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildRelayChip({
    required bool isPumpOn,
    required bool waterProbe,
  }) {
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: AppColors.card,
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: AppColors.border),
        boxShadow: const [
          BoxShadow(
            color: Colors.black26,
            blurRadius: 10,
            offset: Offset(0, 4),
          ),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text(
                'Relay',
                style: GoogleFonts.outfit(
                  fontSize: 12,
                  fontWeight: FontWeight.w600,
                  color: AppColors.textSec,
                ),
              ),
              Container(
                width: 26,
                height: 26,
                decoration: BoxDecoration(
                  color: AppColors.green.withValues(alpha: 0.15),
                  borderRadius: BorderRadius.circular(8),
                ),
                alignment: Alignment.center,
                child: const Text('🔌', style: TextStyle(fontSize: 13)),
              ),
            ],
          ),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
            decoration: BoxDecoration(
              color: isPumpOn ? AppColors.accent : const Color(0x26FF4757),
              borderRadius: BorderRadius.circular(9999),
              boxShadow: isPumpOn
                  ? [
                      BoxShadow(
                        color: AppColors.accent.withValues(alpha: 0.4),
                        blurRadius: 8,
                        offset: const Offset(0, 2),
                      ),
                    ]
                  : null,
            ),
            child: Text(
              isPumpOn ? 'RUNNING' : 'OFF',
              style: GoogleFonts.outfit(
                fontSize: 12,
                fontWeight: FontWeight.w800,
                color: isPumpOn ? AppColors.accentDark : AppColors.red,
              ),
            ),
          ),
          Row(
            children: [
              Text(
                'D6 Pin | Probe: ',
                style: GoogleFonts.inter(
                  fontSize: 10,
                  fontWeight: FontWeight.w500,
                  color: AppColors.textMuted,
                ),
              ),
              Text(
                waterProbe ? 'DETECTED' : 'DRY',
                style: GoogleFonts.inter(
                  fontSize: 10,
                  fontWeight: FontWeight.w700,
                  color: waterProbe ? AppColors.red : AppColors.accent,
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}
