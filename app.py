"""Battleship dev launcher.

Usage: python app.py
"""

import json
import os
import re
import shutil
import signal
import socket
import subprocess
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent
SERVER_DIR = ROOT / "server"
APP_DIR = ROOT / "app"
APP_JSON = APP_DIR / "app.json"
RELEASE_DIR = ROOT / "release"
IS_WINDOWS = os.name == "nt"
NPM = "npm.cmd" if IS_WINDOWS else "npm"
BACKEND_PORT = 2567
FRONTEND_PORT = 8081


def port_in_use(port: int) -> bool:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.settimeout(0.5)
        return sock.connect_ex(("127.0.0.1", port)) == 0


def ensure_ready(project_dir: Path) -> None:
    env_file = project_dir / ".env"
    env_example = project_dir / ".env.example"
    if not env_file.exists() and env_example.exists():
        shutil.copyfile(env_example, env_file)
        print(f"[setup] Created {env_file.relative_to(ROOT)} from .env.example")

    if not (project_dir / "node_modules").exists():
        print(f"[setup] Installing dependencies in {project_dir.name}/ ...")
        subprocess.run([NPM, "install"], cwd=project_dir, check=True)


def start(name: str, args: list[str], cwd: Path) -> subprocess.Popen:
    print(f"[{name}] Starting: npm {' '.join(args)}  (in {cwd.name}/)")
    if IS_WINDOWS:
        # New process group so Ctrl+C doesn't trigger npm's "Terminate batch job (Y/N)?" prompt.
        return subprocess.Popen(
            [NPM, *args], cwd=cwd, creationflags=subprocess.CREATE_NEW_PROCESS_GROUP
        )
    return subprocess.Popen([NPM, *args], cwd=cwd, start_new_session=True)


def stop(name: str, proc: subprocess.Popen) -> None:
    if proc.poll() is not None:
        return
    print(f"[{name}] Stopping...")
    if IS_WINDOWS:
        subprocess.run(
            ["taskkill", "/PID", str(proc.pid), "/T", "/F"],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
    else:
        try:
            os.killpg(proc.pid, signal.SIGTERM)
        except ProcessLookupError:
            pass
    try:
        proc.wait(timeout=10)
    except subprocess.TimeoutExpired:
        proc.kill()


def run_backend_and_frontend() -> None:
    busy = [
        f"{name} port {port}"
        for name, port in (("backend", BACKEND_PORT), ("frontend", FRONTEND_PORT))
        if port_in_use(port)
    ]
    if busy:
        print(f"Already in use: {', '.join(busy)}. Stop the running instance first.\n")
        return

    try:
        ensure_ready(SERVER_DIR)
        ensure_ready(APP_DIR)
    except subprocess.CalledProcessError as exc:
        print(f"[setup] npm install failed (exit code {exc.returncode}).")
        return

    procs: list[tuple[str, subprocess.Popen]] = []
    try:
        procs.append(("backend", start("backend", ["run", "dev"], SERVER_DIR)))
        time.sleep(2)
        procs.append(("frontend", start("frontend", ["run", "web"], APP_DIR)))

        print()
        print(f"Backend:  ws://localhost:{BACKEND_PORT}  (monitor: http://localhost:{BACKEND_PORT}/colyseus)")
        print(f"Frontend: http://localhost:{FRONTEND_PORT}")
        print("Press Ctrl+C to stop both and return to the menu.")
        print()

        while True:
            for name, proc in procs:
                code = proc.poll()
                if code is not None:
                    print(f"\n[{name}] Exited with code {code}.")
                    return
            time.sleep(0.5)
    except KeyboardInterrupt:
        print()
    finally:
        for name, proc in reversed(procs):
            stop(name, proc)
        print("All processes stopped.\n")


def run_apk_script(*args: str) -> bool:
    """Run app/scripts/build-apk.js, which does the preflight checks and the Gradle build (APK or AAB)."""
    try:
        ensure_ready(APP_DIR)
    except subprocess.CalledProcessError as exc:
        print(f"[setup] npm install failed (exit code {exc.returncode}).")
        return False

    try:
        code = subprocess.run(["node", "scripts/build-apk.js", *args], cwd=APP_DIR).returncode
    except KeyboardInterrupt:
        print("\nCancelled.\n")
        return False
    print("Done.\n" if code == 0 else f"Failed (exit code {code}).\n")
    return code == 0


def bump_version() -> str:
    """Bump expo.version (patch) and expo.android.versionCode in app/app.json. Returns the original text."""
    original = APP_JSON.read_text(encoding="utf-8")
    config = json.loads(original)
    expo = config["expo"]
    android = expo.setdefault("android", {})

    old_version = expo.get("version", "1.0.0")
    major, minor, patch = (int(part) for part in old_version.split("."))
    new_version = f"{major}.{minor}.{patch + 1}"
    old_code = int(android.get("versionCode", 1))
    new_code = old_code + 1

    expo["version"] = new_version
    android["versionCode"] = new_code
    APP_JSON.write_text(json.dumps(config, indent=2) + "\n", encoding="utf-8")
    print(f"Bumped app.json: versionCode {old_code} -> {new_code}, version {old_version} -> {new_version}\n")
    return original


def build_aab() -> None:
    if not run_apk_script("preflight", "aab"):
        return

    try:
        original = bump_version()
    except (OSError, KeyError, ValueError) as exc:
        print(f"Could not bump the version in {APP_JSON.relative_to(ROOT)}: {exc}\n")
        return

    if not run_apk_script("aab", "--skip-preflight"):
        APP_JSON.write_text(original, encoding="utf-8")
        print(f"Restored {APP_JSON.relative_to(ROOT)} to its previous version because the build failed.\n")


def sdk_tool(subdir: str, name: str) -> str | None:
    """Locate an Android SDK tool, falling back to whatever is on PATH."""
    exe = f"{name}.exe" if IS_WINDOWS else name
    sdk_roots = [os.environ.get("ANDROID_HOME"), os.environ.get("ANDROID_SDK_ROOT")]
    if IS_WINDOWS and os.environ.get("LOCALAPPDATA"):
        sdk_roots.append(str(Path(os.environ["LOCALAPPDATA"]) / "Android" / "Sdk"))
    else:
        sdk_roots.append(str(Path.home() / "Library" / "Android" / "sdk"))
        sdk_roots.append(str(Path.home() / "Android" / "Sdk"))
    for root in filter(None, sdk_roots):
        candidate = Path(root) / subdir / exe
        if candidate.exists():
            return str(candidate)
    return shutil.which(name)


def connected_devices(adb: str) -> list[str]:
    out = subprocess.run([adb, "devices"], capture_output=True, text=True).stdout
    return [line.split()[0] for line in out.splitlines()[1:] if line.strip().endswith("device")]


def connected_emulators(adb: str) -> list[str]:
    return [serial for serial in connected_devices(adb) if serial.startswith("emulator-")]


def start_emulator(adb: str) -> str | None:
    emulator = sdk_tool("emulator", "emulator")
    if not emulator:
        print("No emulator binary found. Start an emulator from Android Studio and retry.")
        return None
    avds = subprocess.run([emulator, "-list-avds"], capture_output=True, text=True).stdout.split()
    if not avds:
        print("No AVDs found. Create one in Android Studio (Device Manager) and retry.")
        return None

    print(f"No running emulator found. Starting emulator '{avds[0]}'...")
    subprocess.Popen(
        [emulator, "-avd", avds[0]],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
        creationflags=subprocess.CREATE_NEW_PROCESS_GROUP if IS_WINDOWS else 0,
    )
    print("Waiting for Android to finish booting...")
    deadline = time.time() + 180
    serial = None
    while time.time() < deadline:
        if serial is None:
            emulators = connected_emulators(adb)
            serial = emulators[0] if emulators else None
        if serial is not None:
            booted = subprocess.run(
                [adb, "-s", serial, "shell", "getprop", "sys.boot_completed"],
                capture_output=True,
                text=True,
            ).stdout.strip()
            if booted == "1":
                return serial
        time.sleep(2)
    print("Emulator did not finish booting within 3 minutes.")
    return None


def android_package() -> str | None:
    config = (APP_DIR / "app.config.ts").read_text(encoding="utf-8")
    match = re.search(r"android:\s*\{[^}]*?package:\s*['\"]([^'\"]+)['\"]", config)
    return match.group(1) if match else None


def run_apk_in_emulator() -> None:
    apk = RELEASE_DIR / "app-release.apk"
    if not apk.exists():
        print(f"APK not found at {apk.relative_to(ROOT)}. Build it first with option 2.\n")
        return

    adb = sdk_tool("platform-tools", "adb")
    if not adb:
        print("adb not found. Install Android SDK platform-tools or set ANDROID_HOME.\n")
        return

    package = android_package()
    if not package:
        print("Could not read android.package from app/app.config.ts.\n")
        return

    try:
        emulators = connected_emulators(adb)
        serial = emulators[0] if emulators else start_emulator(adb)
        if not serial:
            print()
            return
        print(f"Installing {apk.relative_to(ROOT)} on {serial}...")
        subprocess.run([adb, "-s", serial, "install", "-r", str(apk)], check=True)
        print(f"Launching {package}...")
        subprocess.run(
            [
                adb, "-s", serial, "shell", "monkey",
                "-p", package, "-c", "android.intent.category.LAUNCHER", "1",
            ],
            check=True,
            stdout=subprocess.DEVNULL,
        )
    except subprocess.CalledProcessError as exc:
        print(f"Failed (exit code {exc.returncode}).\n")
        return
    except KeyboardInterrupt:
        print("\nCancelled.\n")
        return
    print("Done.\n")


def main() -> None:
    if shutil.which(NPM) is None:
        print("npm was not found on PATH. Install Node.js 20+ first.")
        sys.exit(1)

    while True:
        print("=" * 32)
        print("        Battleship Launcher")
        print("=" * 32)
        print("1. Run backend + frontend")
        print("2. Build Android APK (release/app-release.apk)")
        print("3. Run prechecks (APK preflight)")
        print("4. Run release/app-release.apk in emulator (adb install + launch)")
        print("5. Build signed Play Store AAB (release/app-release.aab, bumps version)")
        print("6. Run prechecks (AAB preflight + upload key)")
        print("0. Exit")
        try:
            choice = input("Select an option: ").strip()
        except (KeyboardInterrupt, EOFError):
            print()
            break

        if choice == "1":
            run_backend_and_frontend()
        elif choice == "2":
            run_apk_script("release")
        elif choice == "3":
            run_apk_script("preflight", "release")
        elif choice == "4":
            run_apk_in_emulator()
        elif choice == "5":
            build_aab()
        elif choice == "6":
            run_apk_script("preflight", "aab")
        elif choice == "0":
            break
        else:
            print("Invalid option, try again.\n")

    print("Bye!")


if __name__ == "__main__":
    main()
