#!/usr/bin/env python3
"""Development server with no-cache headers, graceful shutdown, and PID management."""
import http.server
import os
import signal
import socket
import sys

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8080
KILL_EXISTING = "--kill" in sys.argv
PID_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), ".server.pid")

server = None


def remove_pid_file():
    """Remove PID file if it exists."""
    try:
        os.remove(PID_FILE)
    except FileNotFoundError:
        pass


def handle_signal(signum, frame):
    """Handle SIGINT/SIGTERM for graceful shutdown."""
    print(f"\nReceived signal {signum}, shutting down...")
    if server:
        server.server_close()
    remove_pid_file()
    sys.exit(0)


def find_pid_on_port(port):
    """Find the PID of a process listening on the given port (macOS/Linux)."""
    try:
        import subprocess
        result = subprocess.run(
            ["lsof", "-ti", f":{port}"],
            capture_output=True, text=True, timeout=5
        )
        if result.returncode == 0 and result.stdout.strip():
            return [int(p) for p in result.stdout.strip().split("\n")]
    except Exception:
        pass
    return []


def check_port(port):
    """Check if port is available. Kill existing process if --kill flag set."""
    sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    try:
        sock.bind(("", port))
        sock.close()
        return True
    except OSError:
        sock.close()

    pids = find_pid_on_port(port)
    if KILL_EXISTING and pids:
        for pid in pids:
            print(f"Killing existing server (PID {pid}) on port {port}...")
            try:
                os.kill(pid, signal.SIGTERM)
            except ProcessLookupError:
                pass
        import time
        time.sleep(0.5)
        return True

    pid_str = ", ".join(str(p) for p in pids) if pids else "unknown"
    print(f"Error: Port {port} is already in use (PID: {pid_str}).")
    print(f"  Run with --kill to terminate the existing server:")
    print(f"  python3 serve.py {port} --kill")
    sys.exit(1)


def write_pid_file():
    """Write current PID to .server.pid."""
    with open(PID_FILE, "w") as f:
        f.write(str(os.getpid()))


class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0')
        self.send_header('Pragma', 'no-cache')
        self.send_header('Expires', '0')
        super().end_headers()


signal.signal(signal.SIGINT, handle_signal)
signal.signal(signal.SIGTERM, handle_signal)

check_port(PORT)
write_pid_file()

try:
    server = http.server.HTTPServer(('', PORT), NoCacheHandler)
    print(f'Serving Bounce Blitz at http://localhost:{PORT} (PID: {os.getpid()})')
    server.serve_forever()
except Exception as e:
    print(f"Server error: {e}")
finally:
    remove_pid_file()
