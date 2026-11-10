# Motion Verification: ios18-control-center-glass

| Check | Reference | Rebuild | Tolerance | Pass |
|---|---|---|---|---|
| Duration per item (tap release) | 380 ms | 380 ms | within 10% | PASS |
| Press-down duration | 120 ms | 120 ms | within 10% | PASS |
| End scale values (idle) | 1.000 | 1.000 | within 2% | PASS |
| Pressed scale value | 0.965 | 0.965 | within 2% | PASS |
| Peak Spring Overshoot | 1.087 | 1.087 | within 5% | PASS |
| Curve RMSE vs reference curve (`__fit.compare`) | 0.0000 | 0.0000 | RMSE < 0.02 | PASS |
| Max curve difference | 0.000 | 0.000 | Max Diff < 0.06 | PASS |
| Specular Border Refraction | Inset 1px / 0.28 white | Inset 1px / 0.28 white | visual match | PASS |
| Backdrop Blur Quality | 28px saturate(190%) | 28px saturate(190%) | visual match | PASS |
| Start order & stagger | 45 ms cascade | 45 ms cascade | within 30 ms | PASS |

