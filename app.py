"""Battleship dev launcher.

Usage: python app.py
"""

import os
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


def main() -> None:
    if shutil.which(NPM) is None:
        print("npm was not found on PATH. Install Node.js 20+ first.")
        sys.exit(1)

    while True:
        print("=" * 32)
        print("        Battleship Launcher")
        print("=" * 32)
        print("1. Run backend + frontend")
        print("0. Exit")
        try:
            choice = input("Select an option: ").strip()
        except (KeyboardInterrupt, EOFError):
            print()
            break

        if choice == "1":
            run_backend_and_frontend()
        elif choice == "0":
            break
        else:
            print("Invalid option, try again.\n")

    print("Bye!")


if __name__ == "__main__":
    main()
