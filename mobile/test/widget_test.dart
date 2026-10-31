import 'package:flutter_test/flutter_test.dart';
import 'package:smart_water_tank_mobile/models/tank_telemetry.dart';

void main() {
  group('TankTelemetry Unit Tests', () {
    test('Correctly parses empty map into default values', () {
      final t = TankTelemetry.fromMap({});
      expect(t.levelPercent, -1.0);
      expect(t.pumpState, 'OFF');
      expect(t.controlMode, 'AUTO');
      expect(t.flowRateLpm, 0.0);
    });

    test('Clamps close-range ultrasonic readings under 2cm to 100%', () {
      final t = TankTelemetry.fromMap({
        'distanceCm': 1.2,
        'levelPercent': 98.0,
      });
      expect(t.distanceCm, 2.0);
      expect(t.levelPercent, 100.0);
    });

    test('Parses live ESP8266 telemetry payload correctly', () {
      final payload = {
        'levelPercent': 82.5,
        'distanceCm': 15.4,
        'flowRateLpm': 2.3,
        'totalLitres': 45.8,
        'pumpCurrentA': 1.15,
        'rawAdc': 512,
        'waterProbe': true,
        'pumpState': 'ON',
        'controlMode': 'MANUAL',
        'controllerStatus': 'MANUAL_FILLING',
        'deviceIp': '192.168.1.105',
      };

      final t = TankTelemetry.fromMap(payload);
      expect(t.levelPercent, 82.5);
      expect(t.distanceCm, 15.4);
      expect(t.flowRateLpm, 2.3);
      expect(t.totalLitres, 45.8);
      expect(t.pumpCurrentA, 1.15);
      expect(t.rawAdc, '512');
      expect(t.waterProbe, true);
      expect(t.pumpState, 'ON');
      expect(t.controlMode, 'MANUAL');
      expect(t.controllerStatus, 'MANUAL_FILLING');
      expect(t.deviceIp, '192.168.1.105');
    });
  });
}
