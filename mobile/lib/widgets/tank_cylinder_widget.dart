import 'package:flutter/material.dart';
import '../theme/app_theme.dart';

class TankCylinderWidget extends StatelessWidget {
  final double levelPercent;

  const TankCylinderWidget({
    super.key,
    required this.levelPercent,
  });

  @override
  Widget build(BuildContext context) {
    final clampedLevel = levelPercent < 0 ? 0.0 : (levelPercent > 100 ? 100.0 : levelPercent);

    return SizedBox(
      width: 58,
      height: 110,
      child: Stack(
        alignment: Alignment.bottomCenter,
        children: [
          // Tank Outer Cylinder
          Container(
            width: 58,
            height: 110,
            decoration: BoxDecoration(
              color: AppColors.cardInset,
              borderRadius: BorderRadius.circular(18),
              border: Border.all(color: AppColors.border, width: 1.5),
              boxShadow: const [
                BoxShadow(
                  color: Colors.black45,
                  blurRadius: 8,
                  offset: Offset(0, 4),
                ),
              ],
            ),
          ),

          // Tick Marks
          Positioned(
            right: 4,
            top: 10,
            bottom: 10,
            child: Column(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: List.generate(5, (index) {
                final isMajor = index == 0 || index == 4 || index == 2;
                return Container(
                  width: isMajor ? 6 : 4,
                  height: 1.5,
                  decoration: BoxDecoration(
                    color: isMajor ? AppColors.textMuted : AppColors.border,
                    borderRadius: BorderRadius.circular(1),
                  ),
                );
              }),
            ),
          ),

          // Water Level Fill
          ClipRRect(
            borderRadius: BorderRadius.circular(17),
            child: Align(
              alignment: Alignment.bottomCenter,
              child: AnimatedContainer(
                duration: const Duration(milliseconds: 100),
                curve: Curves.easeOut,
                width: 58,
                height: 110 * (clampedLevel / 100),
                decoration: const BoxDecoration(
                  gradient: LinearGradient(
                    begin: Alignment.bottomCenter,
                    end: Alignment.topCenter,
                    colors: [
                      Color(0xFF007AFF),
                      Color(0xFF3DF6D9),
                      Color(0xFFD4F63D),
                    ],
                  ),
                ),
                child: Stack(
                  children: [
                    // Surface glowing line
                    Positioned(
                      top: 0,
                      left: 0,
                      right: 0,
                      child: Container(
                        height: 3,
                        decoration: BoxDecoration(
                          color: Colors.white,
                          boxShadow: [
                            BoxShadow(
                              color: AppColors.accent.withValues(alpha: 0.8),
                              blurRadius: 6,
                              spreadRadius: 1,
                            ),
                          ],
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}
