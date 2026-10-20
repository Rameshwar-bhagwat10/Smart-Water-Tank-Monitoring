# 🔧 Firmware Commands Reference — Smart Water Tank

> All commands run from: `d:\projects\Smart Water Tank\firmware`

---

## 📡 Serial Monitor (View ESP Logs)

```bash
# Open serial monitor at 115200 baud (press Ctrl+C to exit)
pio device monitor

# With specific baud rate
pio device monitor -b 115200

# With specific COM port (if auto-detect fails)
pio device monitor -p COM5 -b 115200

# Monitor with timestamp on each line
pio device monitor -b 115200 --filter time
```

---

## 🔨 Build Commands

```bash
# Build firmware (compile only, no upload)
pio run

# Build + Upload to ESP via USB
pio run -t upload

# Build + Upload + Open Serial Monitor (all in one)
pio run -t upload && pio device monitor -b 115200

# Clean build (remove compiled files)
pio run -t clean

# Full clean rebuild
pio run -t clean && pio run
```

---

## 📋 Device Info

```bash
# List connected serial devices (find COM port)
pio device list

# Check board/platform info
pio boards nodemcuv2

# Check installed libraries
pio lib list
```

---

## 🧹 Maintenance

```bash
# Erase entire ESP8266 flash memory
pio run -t erase

# Check firmware size (RAM/Flash usage)
pio run -t size

# Update PlatformIO and packages
pio upgrade
pio pkg update
```

---

## 💬 Serial Console Commands (Send TO the ESP)

Once the serial monitor is open, you can type these commands:

| Command | What It Does |
|---------|--------------|
| `STATUS` | Print current tank ID, cloud connection, pump state |
| `SET_TANK tank-01` | Change the active tank ID |
| `RESET_CONFIG` | Wipe EEPROM settings and reboot to setup portal |

---

## ⚡ Quick Workflows

```bash
# 🚀 Fresh upload + monitor (most common)
cd "d:\projects\Smart Water Tank\firmware"
pio run -t upload && pio device monitor -b 115200

# 🔄 Just rebuild after code change (no upload)
pio run

# 🧪 Upload and immediately watch logs
pio run -t upload && pio device monitor

# 🗑️ Full reset: clean + rebuild + upload
pio run -t clean && pio run -t upload
```

---

## 🔑 Hardware Button

| Action | What Happens |
|--------|--------------|
| **Hold FLASH button 5 seconds** (GPIO0/D3 on NodeMCU) | Wipes EEPROM config and reboots into Setup Portal mode |
