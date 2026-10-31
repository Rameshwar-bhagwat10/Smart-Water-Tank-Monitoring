import 'dart:math';
import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import '../theme/app_theme.dart';

class CurrentGaugeWidget extends StatelessWidget {
  final double current;
  final double peak;
  final double average;

  const CurrentGaugeWidget({
    super.key,
    required this.current,
    required this.peak,
    required this.average,
  });

  @override
  Widget build(BuildContext context) {
    String statusStr = 'Idle';
    Color statusColor = AppColors.green;
    if (current > 2.0) {
      statusStr = 'High Load';
      statusColor = AppColors.red;
    } else if (current > 0.1) {
      statusStr = 'Running';
      statusColor = AppColors.orange;
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
            'Pump Current Ring',
            style: GoogleFonts.outfit(
              fontSize: 15,
              fontWeight: FontWeight.w600,
              color: AppColors.text,
            ),
          ),
          const SizedBox(height: 16),
          Row(
            children: [
              // 104x104 Circular Gauge
              SizedBox(
                width: 104,
                height: 104,
                child: Stack(
                  alignment: Alignment.center,
                  children: [
                    CustomPaint(
                      size: const Size(104, 104),
                      painter: _CurrentRingPainter(current: current),
                    ),
                    Column(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Text(
                          current.toStringAsFixed(2),
                          style: GoogleFonts.outfit(
                            fontSize: 18,
                            fontWeight: FontWeight.w800,
                            color: AppColors.text,
                          ),
                        ),
                        Text(
                          'Amps',
                          style: GoogleFonts.inter(
                            fontSize: 10,
                            fontWeight: FontWeight.w500,
                            color: AppColors.textSec,
                          ),
                        ),
                      ],
                    ),
                  ],
                ),
              ),
              const SizedBox(width: 24),

              // Gauge Stats Breakdown
              Expanded(
                child: Column(
                  children: [
                    _buildStatRow('Peak', '${peak.toStringAsFixed(2)} A'),
                    const SizedBox(height: 8),
                    _buildStatRow('Average', '${average.toStringAsFixed(2)} A'),
                    const SizedBox(height: 8),
                    _buildStatRow('Status', statusStr, valColor: statusColor),
                  ],
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _buildStatRow(String label, String value, {Color? valColor}) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 7),
      decoration: BoxDecoration(
        color: AppColors.cardInset,
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: AppColors.border),
      ),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Text(
            label,
            style: GoogleFonts.inter(
              fontSize: 11,
              fontWeight: FontWeight.w500,
              color: AppColors.textSec,
            ),
          ),
          Text(
            value,
            style: GoogleFonts.outfit(
              fontSize: 12,
              fontWeight: FontWeight.w700,
              color: valColor ?? AppColors.text,
            ),
          ),
        ],
      ),
    );
  }
}

class _CurrentRingPainter extends CustomPainter {
  final double current;

  _CurrentRingPainter({required this.current});

  @override
  void paint(Canvas canvas, Size size) {
    final center = Offset(size.width / 2, size.height / 2);
    const radius = 40.0;
    const strokeWidth = 8.0;

    const startAngle = 0.75 * pi;
    const sweepTotal = 1.5 * pi;

    // Track Ring
    final trackPaint = Paint()
      ..color = AppColors.cardInner
      ..strokeWidth = strokeWidth
      ..strokeCap = StrokeCap.round
      ..style = PaintingStyle.stroke;

    canvas.drawArc(
      Rect.fromCircle(center: center, radius: radius),
      startAngle,
      sweepTotal,
      false,
      trackPaint,
    );

    // Active Arc
    const maxCurrent = 5.0;
    final pct = (current / maxCurrent).clamp(0.0, 1.0);
    if (pct > 0) {
      final sweepAngle = pct * sweepTotal;

      Color c1 = AppColors.accent;
      Color c2 = AppColors.cyan;
      if (pct >= 0.8) {
        c1 = AppColors.red;
        c2 = AppColors.orange;
      } else if (pct >= 0.5) {
        c1 = AppColors.orange;
        c2 = AppColors.accent;
      }

      final activePaint = Paint()
        ..shader = LinearGradient(
          colors: [c1, c2],
        ).createShader(Rect.fromCircle(center: center, radius: radius))
        ..strokeWidth = strokeWidth
        ..strokeCap = StrokeCap.round
        ..style = PaintingStyle.stroke;

      canvas.drawArc(
        Rect.fromCircle(center: center, radius: radius),
        startAngle,
        sweepAngle,
        false,
        activePaint,
      );
    }
  }

  @override
  bool shouldRepaint(covariant _CurrentRingPainter oldDelegate) => true;
}
