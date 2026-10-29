# Multi-Device Setup & Operation Guide

This guide explains:
1. **How to operate the Smart Water Tank from another device** (Smartphone, Tablet, or Laptop) via both **Local Offline Mode** and **Cloud Remote Mode**.
2. **How to install, compile, and run this entire project on another computer** from scratch.

---

## Quick Reference Summary

| Service | Connection Required | URL / App | Devices Supported | Internet Needed? |
| :--- | :--- | :--- | :--- | :--- |
| **Local Service** | Connect Wi-Fi to `SmartWaterTank` | `http://192.168.4.1` | Any Phone, Tablet, Laptop | ❌ No |
| **Cloud Dashboard (LAN)** | Connect to same Hotspot (`Password`) | `http://<YOUR_PC_IP>:5173` | Any Phone, Tablet, Laptop |  Yes |
| **Cloud Dashboard (Hosted)** | Any Internet connection | `https://smart-water-tank-monitor-c38c0.web.app` | Any device worldwide |  Yes |

---

## PART 1: Operating the System from Another Device (Zero Installation)

You do **not** need to install any apps or software on your phone, tablet, or secondary laptop to control the tank.

---

### Option A: Local Offline Operation (Direct to ESP8266)

Use this when you are near the tank, or when there is **no internet router or mobile hotspot available**.

```
  [ Your Phone / Tablet ]  <--- (Direct Wi-Fi) --->  [ ESP8266 Controller ]
  Browser: http://192.168.4.1                          (SSID: SmartWaterTank)
```

1. **Power the ESP8266**: Plug the ESP8266 into any USB power source (adapter, power bank, or laptop).
2. **Open Wi-Fi Settings on your phone / tablet**:
   - Search for the network: **`SmartWaterTank`**
   - Password: **`SmartWaterTank`**
   - Tap **Connect**. *(If your phone says "Internet not available", select "Stay connected" or "Keep Wi-Fi connection".)*
3. **Open Browser**:
   - Navigate to: **`http://192.168.4.1`**
4. **Operate the Tank**:
   - View live water level gauge, flow rate, and pump motor current.
   - Switch between **AUTO** and **MANUAL** mode.
   - Press **Turn Pump ON** or **Turn Pump OFF**.
   - Changes execute immediately (< 10 ms latency) and are logged on the controller's Serial Monitor.

---

### Option B: Cloud Remote Operation (Via Local Network / Hotspot)

Use this to access the web dashboard from any phone, laptop, or tablet connected to the same mobile hotspot or home Wi-Fi network.

```
  [ Your Phone / Tablet ] ──────┐
                                ├─► [ Hotspot: "Password" ] ◄──► [ ESP8266 ]
  [ Host Computer (Dev Server)] ┘             │
                                              ▼
                                   ☁️ Firebase Realtime DB
```

#### Step 1: Find the Host Computer's IP Address
On the computer currently running the project:
1. Open terminal and run:
   ```powershell
   ipconfig
   ```
2. Look for **IPv4 Address** under your active Wi-Fi adapter (for example: `10.11.175.99` or `192.168.1.15`).

#### Step 2: Start the Web Dashboard with Host Access
In the project directory on your computer:
```powershell
cd "d:\projects\Smart Water Tank\dashboard"
npm run dev -- --host
```
Vite will show:
```text
  ➜  Local:   http://localhost:5173/
  ➜  Network: http://10.11.175.99:5173/
```

#### Step 3: Connect and Open from Any Other Device
1. Connect your other phone, tablet, or laptop to the **same Wi-Fi hotspot** (`Password`).
2. Open Chrome, Safari, or any browser on that device and navigate to the Network URL:
   ```text
   http://10.11.175.99:5173
   ```
   *(Replace `10.11.175.99` with your actual PC IP address)*
3. **Log in** with your account credentials:
   - Email: `ram@gmail.com`
   - Password: `ram123`
   *(Or click "Sign Up" to create a new user; the system will automatically allocate `tank-02` or `tank-03`)*
4. You now have full cloud control of your water tank from your mobile device!

---

### Option C: Worldwide Cloud Deployment (Firebase Hosting)

To access your dashboard from **anywhere in the world** without keeping your local computer running:

1. In the project folder, build the dashboard production bundle:
   ```powershell
   cd "d:\projects\Smart Water Tank\dashboard"
   npm run build
   ```
2. Deploy to Firebase Hosting:
   ```powershell
   firebase deploy --only hosting
   ```
3. Once deployed, open the public URL on any device globally:
   ```text
   https://smart-water-tank-monitor-c38c0.web.app
   ```

---

## PART 2: Installing the System on Another Computer (Developer / Admin Setup)

If you want to set up this entire development and flashing environment on a **brand new computer** (Windows, macOS, or Linux):

### 1. Prerequisites to Install on the New Computer

Download and install the following free tools:

1. **Git**: [https://git-scm.com/downloads](https://git-scm.com/downloads)
2. **Node.js (v18 or v20 LTS)**: [https://nodejs.org/](https://nodejs.org/) *(Check: `node -v` and `npm -v`)*
3. **VS Code**: [https://code.visualstudio.com/](https://code.visualstudio.com/)
4. **PlatformIO IDE Extension**:
   - Open VS Code → Extensions tab (`Ctrl + Shift + X`).
   - Search for **PlatformIO IDE** and click **Install**.
   - *(Alternatively, install PlatformIO CLI via Python: `pip install platformio`)*
5. **USB-to-Serial Driver** (Required for the PC to recognize the NodeMCU ESP8266):
   - Most NodeMCU boards use the **CH340G** chip: [Download CH340 Driver](http://www.wch-ic.com/downloads/CH341SER_EXE.html)
   - Some boards use the **CP2102** chip: [Download CP210x Driver](https://www.silabs.com/developers/usb-to-uart-bridge-vcp-drivers)

---

### 2. Clone the Repository

Open terminal / command prompt on the new computer:
```bash
git clone https://github.com/Rameshwar-bhagwat10/Smart-Water-Tank-Monitoring.git
cd Smart-Water-Tank-Monitoring
```

---

### 3. Setup and Run the Web Dashboard

1. Navigate to the dashboard directory:
   ```bash
   cd dashboard
   ```
2. Install all dependencies:
   ```bash
   npm install
   ```
3. Run the automated test suite to verify everything is working:
   ```bash
   npm test
   ```
   *(All 76 tests should pass with 0 failures)*
4. Launch the local dev server:
   ```bash
   npm run dev -- --host
   ```
5. Open `http://localhost:5173` in your browser.

---

### 4. Build and Flash the Firmware (ESP8266)

1. Connect your NodeMCU ESP8266 to the new computer using a **Micro-USB Data Cable** *(ensure it is a data cable, not a power-only charging cable)*.
2. Verify Wi-Fi and Firebase credentials in `firmware/src/secrets.h`:
   ```c
   #define WIFI_SSID "Password"
   #define WIFI_PASSWORD "12345678"
   #define FIREBASE_HOST "smart-water-tank-monitor-c38c0-default-rtdb.firebaseio.com"
   #define FIREBASE_AUTH_KEY ""
   ```
3. Navigate to the firmware directory:
   ```bash
   cd ../firmware
   ```
4. Build the firmware (compiles dependencies automatically):
   ```bash
   pio run
   ```
5. Flash the firmware and launch the Serial Monitor:
   ```bash
   pio run -t upload && pio device monitor -b 115200
   ```
6. The terminal will upload the binary to the ESP8266 and immediately show the live serial output!

---

## PART 3: Troubleshooting & Common Issues

| Issue | Cause | Solution |
| :--- | :--- | :--- |
| **Cannot open `http://192.168.4.1` on phone** | Phone switched to mobile data because Wi-Fi has no internet | Turn off Mobile Data on your phone temporarily, or accept the prompt "Keep Wi-Fi Connection". |
| **`http://<PC_IP>:5173` not loading on phone** | Windows Firewall blocking port 5173 | On the host PC: Windows Defender Firewall → Allow an app → Allow Node.js on Private Networks. |
| **ESP8266 not connecting to Hotspot** | Hotspot set to 5 GHz band | ESP8266 only supports **2.4 GHz**. In your phone hotspot settings, turn on **"Maximize Compatibility"** or select **2.4 GHz band**. |
| **`pio run -t upload` fails with "Port not found"** | Missing USB driver or charge-only cable | Install CH340 / CP2102 driver and verify the device appears under Device Manager → Ports (COM & LPT). |
| **Serial monitor shows garbage characters** | Incorrect baud rate | Always use **115200** baud rate: `pio device monitor -b 115200`. |
| **Multi-tank table shows only 1 or 2 tanks** | Additional tanks only appear after login | This is intended behavior. Sign up a new user account on the dashboard; within 5 seconds `tank-03` will dynamically appear. |

---

## Useful Serial Console Commands

When the ESP8266 is connected via USB, type any of these commands directly into the PlatformIO Serial Monitor:

- **`LOCAL`**: Immediately prints the dedicated Single Local Tank Service snapshot.
- **`FLEET`** or **`STATUS`**: Prints the full multi-tank fleet status table across all cloud-registered users.
- **`WIFI`**: Prints current Wi-Fi connection, Station IP, RSSI signal strength, and gateway mode.
- **`SET_TANK <id>`**: Dynamically changes the active tank hardware ID (e.g., `SET_TANK tank-02`).
- **`RESET_CONFIG`**: Clears EEPROM configuration and reboots into the Setup Portal.
