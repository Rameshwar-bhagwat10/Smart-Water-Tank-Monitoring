class TankTelemetry {
  final double levelPercent;
  final double distanceCm;
  final double flowRateLpm;
  final double totalLitres;
  final double pumpCurrentA;
  final String rawAdc;
  final bool waterProbe;
  final String pumpState;
  final String controlMode;
  final String controllerStatus;
  final String sensorStatus;
  final String faultCode;
  final String deviceIp;
  final int updatedAt;
  final bool wifiConnected;

  const TankTelemetry({
    this.levelPercent = 0.0,
    this.distanceCm = 0.0,
    this.flowRateLpm = 0.0,
    this.totalLitres = 0.0,
    this.pumpCurrentA = 0.0,
    this.rawAdc = '--',
    this.waterProbe = false,
    this.pumpState = 'OFF',
    this.controlMode = 'AUTO',
    this.controllerStatus = 'Standby',
    this.sensorStatus = 'OK',
    this.faultCode = 'NONE',
    this.deviceIp = '',
    this.updatedAt = 0,
    this.wifiConnected = true,
  });

  factory TankTelemetry.fromMap(Map<dynamic, dynamic>? map) {
    if (map == null) return const TankTelemetry();

    double parseDouble(dynamic v, [double def = 0.0]) {
      if (v == null) return def;
      if (v is num) return v.toDouble();
      return double.tryParse(v.toString()) ?? def;
    }

    int parseInt(dynamic v, [int def = 0]) {
      if (v == null) return def;
      if (v is int) return v;
      if (v is num) return v.toInt();
      return int.tryParse(v.toString()) ?? def;
    }

    bool parseBool(dynamic v, [bool def = false]) {
      if (v == null) return def;
      if (v is bool) return v;
      if (v is num) return v != 0;
      final s = v.toString().toLowerCase().trim();
      return s == 'true' || s == '1' || s == 'yes';
    }

    double lvl = parseDouble(map['levelPercent'] ?? map['level'], -1.0);
    double dist = parseDouble(map['distanceCm'] ?? map['distance'], -1.0);

    // Ultrasonic close-range detection handling (hand close to sensor)
    if (dist >= 0 && dist < 2.0) {
      dist = 2.0;
      lvl = 100.0;
    } else if (lvl > 100.0) {
      lvl = 100.0;
    }

    return TankTelemetry(
      levelPercent: lvl,
      distanceCm: dist,
      flowRateLpm: parseDouble(map['flowRateLpm'] ?? map['flow'], 0.0),
      totalLitres: parseDouble(map['totalLitres'] ?? map['total'], 0.0),
      pumpCurrentA: parseDouble(map['pumpCurrentA'] ?? map['current'], 0.0),
      rawAdc: map['rawAdc']?.toString() ?? '--',
      waterProbe: parseBool(map['waterProbe']),
      pumpState: (map['pumpState'] ?? map['pump'] ?? 'OFF').toString().toUpperCase(),
      controlMode: (map['controlMode'] ?? map['mode'] ?? 'AUTO').toString().toUpperCase(),
      controllerStatus: (map['controllerStatus'] ?? map['status'] ?? 'Standby').toString(),
      sensorStatus: (map['sensorStatus'] ?? 'OK').toString(),
      faultCode: (map['faultCode'] ?? 'NONE').toString(),
      deviceIp: (map['deviceIp'] ?? map['ip'] ?? '').toString(),
      updatedAt: parseInt(map['updatedAt'], DateTime.now().millisecondsSinceEpoch),
      wifiConnected: parseBool(map['wifiConnected'], true),
    );
  }

  TankTelemetry copyWith({
    double? levelPercent,
    double? distanceCm,
    double? flowRateLpm,
    double? totalLitres,
    double? pumpCurrentA,
    String? rawAdc,
    bool? waterProbe,
    String? pumpState,
    String? controlMode,
    String? controllerStatus,
    String? sensorStatus,
    String? faultCode,
    String? deviceIp,
    int? updatedAt,
    bool? wifiConnected,
  }) {
    return TankTelemetry(
      levelPercent: levelPercent ?? this.levelPercent,
      distanceCm: distanceCm ?? this.distanceCm,
      flowRateLpm: flowRateLpm ?? this.flowRateLpm,
      totalLitres: totalLitres ?? this.totalLitres,
      pumpCurrentA: pumpCurrentA ?? this.pumpCurrentA,
      rawAdc: rawAdc ?? this.rawAdc,
      waterProbe: waterProbe ?? this.waterProbe,
      pumpState: pumpState ?? this.pumpState,
      controlMode: controlMode ?? this.controlMode,
      controllerStatus: controllerStatus ?? this.controllerStatus,
      sensorStatus: sensorStatus ?? this.sensorStatus,
      faultCode: faultCode ?? this.faultCode,
      deviceIp: deviceIp ?? this.deviceIp,
      updatedAt: updatedAt ?? this.updatedAt,
      wifiConnected: wifiConnected ?? this.wifiConnected,
    );
  }
}
