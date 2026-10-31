import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import '../theme/app_theme.dart';

class LevelChartWidget extends StatelessWidget {
  final List<double> history;
  final double currentLevel;

  const LevelChartWidget({
    super.key,
    required this.history,
    required this.currentLevel,
  });

  @override
  Widget build(BuildContext context) {
    final valueText = currentLevel >= 0 ? '${currentLevel.toStringAsFixed(1)} %' : '-- %';

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
                'Water Level Trend',
                style: GoogleFonts.outfit(
                  fontSize: 15,
                  fontWeight: FontWeight.w600,
                  color: AppColors.text,
                ),
              ),
              Text(
                valueText,
                style: GoogleFonts.outfit(
                  fontSize: 14,
                  fontWeight: FontWeight.w700,
                  color: AppColors.accent,
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),
          SizedBox(
            height: 120,
            width: double.infinity,
            child: CustomPaint(
              painter: _LevelChartPainter(history: history),
            ),
          ),
        ],
      ),
    );
  }
}

class _LevelChartPainter extends CustomPainter {
  final List<double> history;

  _LevelChartPainter({required this.history});

  @override
  void paint(Canvas canvas, Size size) {
    const padLeft = 28.0;
    const padRight = 8.0;
    const padTop = 10.0;
    const padBottom = 16.0;

    final cw = size.width - padLeft - padRight;
    final ch = size.height - padTop - padBottom;

    // Gridlines
    final gridPaint = Paint()
      ..color = const Color(0x14FFFFFF)
      ..strokeWidth = 1.0;

    final textStyle = GoogleFonts.outfit(
      fontSize: 9,
      fontWeight: FontWeight.w600,
      color: AppColors.textMuted,
    );

    const labels = ['100', '75', '50', '25', '0'];
    for (int i = 0; i <= 4; i++) {
      final y = padTop + ch * (i / 4);
      canvas.drawLine(
        Offset(padLeft, y),
        Offset(size.width - padRight, y),
        gridPaint,
      );

      final textSpan = TextSpan(text: labels[i], style: textStyle);
      final textPainter = TextPainter(
        text: textSpan,
        textAlign: TextAlign.right,
        textDirection: TextDirection.ltr,
      );
      textPainter.layout();
      textPainter.paint(
        canvas,
        Offset(padLeft - textPainter.width - 6, y - textPainter.height / 2),
      );
    }

    if (history.isEmpty) return;

    final data = history.length == 1 ? [history[0], history[0]] : history;
    final pts = <Offset>[];
    for (int i = 0; i < data.length; i++) {
      final x = padLeft + (i / (data.length - 1)) * cw;
      final clamped = data[i] < 0 ? 0.0 : (data[i] > 100 ? 100.0 : data[i]);
      final y = padTop + ch * (1.0 - (clamped / 100.0));
      pts.add(Offset(x, y));
    }

    // Gradient Area Path
    final areaPath = Path();
    areaPath.moveTo(pts.first.dx, size.height - padBottom);
    for (final p in pts) {
      areaPath.lineTo(p.dx, p.dy);
    }
    areaPath.lineTo(pts.last.dx, size.height - padBottom);
    areaPath.close();

    final fillPaint = Paint()
      ..shader = const LinearGradient(
        begin: Alignment.topCenter,
        end: Alignment.bottomCenter,
        colors: [
          Color(0x47D4F63D),
          Color(0x10D4F63D),
          Color(0x00D4F63D),
        ],
      ).createShader(Rect.fromLTWH(0, padTop, size.width, ch))
      ..style = PaintingStyle.fill;

    canvas.drawPath(areaPath, fillPaint);

    // Neon Curve Line
    final linePath = Path();
    linePath.moveTo(pts.first.dx, pts.first.dy);
    for (int i = 1; i < pts.length; i++) {
      linePath.lineTo(pts[i].dx, pts[i].dy);
    }

    final linePaint = Paint()
      ..color = AppColors.accent
      ..strokeWidth = 2.5
      ..strokeCap = StrokeCap.round
      ..strokeJoin = StrokeJoin.round
      ..style = PaintingStyle.stroke;

    canvas.drawPath(linePath, linePaint);

    // Terminal point with glow halo
    final lastPoint = pts.last;
    final haloPaint = Paint()
      ..color = AppColors.accent.withValues(alpha: 0.3)
      ..style = PaintingStyle.fill;
    canvas.drawCircle(lastPoint, 8, haloPaint);

    final dotPaint = Paint()
      ..color = AppColors.accent
      ..style = PaintingStyle.fill;
    canvas.drawCircle(lastPoint, 4, dotPaint);

    final centerPaint = Paint()
      ..color = AppColors.bg
      ..style = PaintingStyle.fill;
    canvas.drawCircle(lastPoint, 2, centerPaint);
  }

  @override
  bool shouldRepaint(covariant _LevelChartPainter oldDelegate) => true;
}
