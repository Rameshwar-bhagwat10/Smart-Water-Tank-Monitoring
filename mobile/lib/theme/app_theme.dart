import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';

class AppColors {
  static const Color bg = Color(0xFF090B10);
  static const Color bgElevated = Color(0xFF0D1017);
  static const Color card = Color(0xFF131722);
  static const Color cardHover = Color(0xFF171C2B);
  static const Color cardInner = Color(0xFF191E2C);
  static const Color cardInset = Color(0xFF11141E);

  static const Color border = Color(0x14FFFFFF);
  static const Color borderLight = Color(0x1FFFFFFF);
  static const Color borderGlow = Color(0x59D4F63D);
  static const Color separator = Color(0x0FFFFFFF);

  static const Color text = Color(0xFFFFFFFF);
  static const Color textSec = Color(0xFF8A92A6);
  static const Color textMuted = Color(0xFF525A6C);

  // Signature Accents
  static const Color accent = Color(0xFFD4F63D); // Electric Lime
  static const Color accentHover = Color(0xFFE2FC5B);
  static const Color accentDark = Color(0xFF090B10);
  static const Color accentGlow = Color(0x4DD4F63D);
  static const Color accentSoft = Color(0x1FD4F63D);

  // Functional colors
  static const Color cyan = Color(0xFF3DF6D9);
  static const Color waterBlue = Color(0xFF007AFF);
  static const Color orange = Color(0xFFFFA928);
  static const Color orangeSoft = Color(0x24FFA928);
  static const Color red = Color(0xFFFF4757);
  static const Color redSoft = Color(0x24FF4757);
  static const Color purple = Color(0xFFAF52DE);
  static const Color green = Color(0xFFD4F63D);
}

class AppTheme {
  static ThemeData get darkTheme {
    return ThemeData(
      brightness: Brightness.dark,
      scaffoldBackgroundColor: AppColors.bg,
      primaryColor: AppColors.accent,
      colorScheme: const ColorScheme.dark(
        primary: AppColors.accent,
        secondary: AppColors.cyan,
        surface: AppColors.card,
        error: AppColors.red,
      ),
      textTheme: GoogleFonts.outfitTextTheme(ThemeData.dark().textTheme).copyWith(
        bodyMedium: GoogleFonts.inter(color: AppColors.text),
        bodySmall: GoogleFonts.inter(color: AppColors.textSec),
      ),
    );
  }
}
