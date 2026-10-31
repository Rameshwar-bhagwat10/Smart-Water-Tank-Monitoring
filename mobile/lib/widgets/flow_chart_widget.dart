import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import '../theme/app_theme.dart';

class FlowChartWidget extends StatelessWidget {
  final List<double> history;
  final double currentFlow;

  const FlowChartWidget({
    super.key,
    required this.history,
    required this.currentFlow,
  });

  @override
  Widget build(BuildContext context) {
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
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text(
                'Flow Rate Sparkline',
                style: GoogleFonts.outfit(
                  fontSize: 15,
                  fontWeight: FontWeight.w600,
                  color: AppColors.text,
                ),
              ),
              Text(
                '${currentFlow.toStringAsFixed(1)} L/min',
                style: GoogleFonts.outfit(
                  fontSize: 14,
                  fontWeight: FontWeight.w700,
                  color: AppColors.cyan,
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),
          SizedBox(
            height: 80,
            width: double.infinity,
            child: CustomPaint(
              painter: _FlowChartPainter(history: history),
            ),
          ),
        ],
      ),
    );
  }
}

class _FlowChartPainter extends CustomPainter {
  final List<double> history;

  _FlowChartPainter({required this.history});

  @override
  void paint(Canvas canvas, Size size) {
    if (history.isEmpty) return;

    const padLeft = 6.0;
    const padRight = 6.0;
    const padTop = 6.0;
    const padBottom = 6.0;

    final cw = size.width - padLeft - padRight;
    final ch = size.height - padTop - padBottom;

    final data = history.length == 1 ? [history[0], history[0]] : history;
    double maxVal = 0.5;
    for (final v in data) {
      if (v > maxVal) maxVal = v;
    }

    final barWidth = (cw / 60.0).clamp(2.5, 6.0);
    final activeBarPaint = Paint()
      ..color = AppColors.accent.withValues(alpha: 0.3)
      ..style = PaintingStyle.fill;
    final inactiveBarPaint = Paint()
      ..color = Colors.white.withValues(alpha: 0.04)
      ..style = PaintingStyle.fill;

    // Draw Kalo vertical rounded bars
    for (int i = 0; i < data.length; i++) {
      final v = data[i];
      final bh = (v / maxVal * ch).clamp(2.0, ch);
      final bx = padLeft + (i / (data.length - 1)) * cw - barWidth / 2;
      final by = size.height - padBottom - bh;

      final rrect = RRect.fromRectAndCorners(
        Rect.fromLTWH(bx, by, barWidth, bh),
        topLeft: const Radius.circular(2),
        topRight: const Radius.circular(2),
      );

      canvas.drawRRect(rrect, v > 0.05 ? activeBarPaint : inactiveBarPaint);
    }

    // Neon Cyan Sparkline curve
    final pts = <Offset>[];
    for (int i = 0; i < data.length; i++) {
      final x = padLeft + (i / (data.length - 1)) * cw;
      final y = padTop + ch * (1.0 - (data[i] / maxVal));
      pts.add(Offset(x, y));
    }

    final linePath = Path();
    linePath.moveTo(pts.first.dx, pts.first.dy);
    for (int i = 1; i < pts.length; i++) {
      linePath.lineTo(pts[i].dx, pts[i].dy);
    }

    final linePaint = Paint()
      ..color = AppColors.cyan
      ..strokeWidth = 1.8
      ..strokeCap = StrokeCap.round
      ..strokeJoin = StrokeJoin.round
      ..style = PaintingStyle.stroke;

    canvas.drawPath(linePath, linePaint);

    // Terminal point with halo
    final lastPoint = pts.last;
    final haloPaint = Paint()
      ..color = AppColors.cyan.withValues(alpha: 0.35)
      ..style = PaintingStyle.fill;
    canvas.drawCircle(lastPoint, 6, haloPaint);

    final dotPaint = Paint()
      ..color = AppColors.cyan
      ..style = PaintingStyle.fill;
    canvas.drawCircle(lastPoint, 3, dotPaint);
  }

  @override
  bool shouldRepaint(covariant _FlowChartPainter oldDelegate) => true;
}
