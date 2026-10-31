import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import '../models/tank_telemetry.dart';
import '../theme/app_theme.dart';

class SpecsFooterWidget extends StatelessWidget {
  final TankTelemetry telemetry;
  final String userEmail;
  final String tankId;

  const SpecsFooterWidget({
    super.key,
    required this.telemetry,
    required this.userEmail,
    required this.tankId,
  });

  @override
  Widget build(BuildContext context) {
    final lastTime = telemetry.updatedAt > 0
        ? DateTime.fromMillisecondsSinceEpoch(telemetry.updatedAt)
        : DateTime.now();
    final timeStr =
        '${lastTime.hour.toString().padLeft(2, '0')}:${lastTime.minute.toString().padLeft(2, '0')}:${lastTime.second.toString().padLeft(2, '0')}';

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
      decoration: BoxDecoration(
        color: AppColors.card,
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: AppColors.border),
      ),
      child: Column(
        children: [
          _buildRow('Channel', '☁️ Cloud RTDB & Direct LAN'),
          const Divider(color: AppColors.separator, height: 16),
          _buildRow('Tank ID', tankId),
          const Divider(color: AppColors.separator, height: 16),
          _buildRow('Operator', userEmail.isNotEmpty ? userEmail : 'operator@gmail.com'),
          const Divider(color: AppColors.separator, height: 16),
          _buildRow('Node MCU IP', telemetry.deviceIp.isNotEmpty ? telemetry.deviceIp : '192.168.4.1 (AP)'),
          const Divider(color: AppColors.separator, height: 16),
          _buildRow('Last Telemetry', timeStr),
        ],
      ),
    );
  }

  Widget _buildRow(String label, String value) {
    return Row(
      mainAxisAlignment: MainAxisAlignment.spaceBetween,
      children: [
        Text(
          label,
          style: GoogleFonts.inter(
            fontSize: 12,
            fontWeight: FontWeight.w500,
            color: AppColors.textSec,
          ),
        ),
        Text(
          value,
          style: GoogleFonts.outfit(
            fontSize: 12,
            fontWeight: FontWeight.w600,
            color: AppColors.text,
          ),
        ),
      ],
    );
  }
}
