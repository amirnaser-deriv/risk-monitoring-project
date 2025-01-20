#!/usr/bin/env python3
import os
import signal
import sys
import subprocess
import http.server
import socketserver
import webbrowser
from pathlib import Path
from urllib.parse import urlparse

# Service ports
PORTS = {
    'http': 8000,
    'feed': 8765
}

# Log file paths
LOG_DIR = Path('logs')
LOG_FILES = {
    'feed': LOG_DIR / 'feed-engine.log'
}

class CORSRequestHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        # Enable CORS for local development
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        super().end_headers()

    def do_OPTIONS(self):
        # Handle preflight requests
        self.send_response(200)
        self.end_headers()

    def do_GET(self):
        # Parse the URL
        url = urlparse(self.path)
        path = url.path

        # Map risk-monitor to risk-dashboard directory first
        if path.startswith('/risk-monitor'):
            path = path.replace('/risk-monitor', '/risk-dashboard', 1)
        # Then handle root path
        elif path == '/':
            self.send_response(301)
            self.send_header('Location', '/trading-site/')
            self.end_headers()
            return

        # Handle trailing slash redirects for directories
        if not path.endswith('/') and '.' not in path:
            # Keep the mapped path for risk-monitor redirect
            self.send_response(301)
            self.send_header('Location', path + '/')
            self.end_headers()
            return

        # Map directory requests to index.html
        if path.endswith('/'):
            path += 'index.html'

        # Set the path to serve from
        self.path = path

        try:
            # Serve the file
            return super().do_GET()
        except FileNotFoundError:
            self.send_error(404, f"File not found: {self.path}")

def find_process_on_port(port):
    """Find process ID using the specified port."""
    try:
        if os.name == 'nt':  # Windows
            result = subprocess.check_output(f'netstat -ano | findstr :{port}', shell=True)
            if result:
                return result.decode().strip().split()[-1]
        else:  # Unix-like
            result = subprocess.check_output(f'lsof -i :{port} -t', shell=True)
            if result:
                # Take only the first PID if multiple are returned
                return result.decode().strip().split('\n')[0]
    except subprocess.CalledProcessError:
        return None
    return None

def kill_process_on_port(port, service_name=None):
    """Kill the process using the specified port."""
    pid = find_process_on_port(port)
    if pid:
        try:
            if os.name == 'nt':  # Windows
                subprocess.run(['taskkill', '/F', '/PID', pid])
            else:  # Unix-like
                os.kill(int(pid), signal.SIGTERM)
            print(f"\nSuccessfully stopped {service_name or 'service'} on port {port}")
            return True
        except Exception as e:
            print(f"\nError stopping {service_name or 'service'}: {e}")
            return False
    else:
        print(f"\nNo {service_name or 'service'} found on port {port}")
        return False

def check_port_available(port):
    """Check if a port is available."""
    with socketserver.TCPServer(("", port), None) as s:
        return True

def wait_for_port(port, timeout=10, interval=0.5):
    """Wait for a port to become active."""
    import time
    start_time = time.time()
    while time.time() - start_time < timeout:
        if find_process_on_port(port):
            return True
        time.sleep(interval)
    return False

def start_server():
    """Start the development server."""
    try:
        # Ensure we're in the right directory
        script_dir = Path(__file__).parent
        if script_dir != Path.cwd():
            print(f"Changing to directory: {script_dir}")
            Path.chdir(script_dir)

        # Check if ports are available
        for service, port in PORTS.items():
            if find_process_on_port(port):
                print(f"\nPort {port} is already in use. Please try:")
                print(f"  python manage.py stop")
                print(f"Then run start again.")
                return 1

        print("\n=== Starting Real-Time Risk Monitoring System ===")

        # Create logs directory if it doesn't exist
        LOG_DIR.mkdir(exist_ok=True)

        # Start feed engine in background with logging
        print("\nStarting feed engine...")
        feed_log = open(LOG_FILES['feed'], 'w')
        feed_engine = subprocess.Popen(
            [sys.executable, 'feed-engine.py'],
            stdout=feed_log,
            stderr=subprocess.STDOUT,
            bufsize=1,
            universal_newlines=True
        )

        # Wait for feed engine to start
        if not wait_for_port(PORTS['feed']):
            print("\nError: Feed engine failed to start")
            print(f"Check logs at: {LOG_FILES['feed']}")
            feed_engine.terminate()
            feed_log.close()
            return 1
        print("Feed engine started successfully")
        print(f"Logs available at: {LOG_FILES['feed']}")

        # Start web server
        print("\nStarting web server...")
        with socketserver.TCPServer(("", PORTS['http']), CORSRequestHandler) as httpd:
            print(f"\nServer running at http://localhost:{PORTS['http']}")
            print("\nAvailable endpoints:")
            print(f"- Trading Site: http://localhost:{PORTS['http']}/trading-site/")
            print(f"- Risk Monitor: http://localhost:{PORTS['http']}/risk-monitor/")
            print("\nPress Ctrl+C to stop all services\n")
            
            # Open trading site in default browser
            webbrowser.open(f'http://localhost:{PORTS["http"]}/trading-site/')
            
            # Start server
            httpd.serve_forever()
            
    except KeyboardInterrupt:
        print("\nShutting down services...")
        if 'feed_engine' in locals():
            feed_engine.terminate()
            feed_engine.wait()
            feed_log.close()
        if 'httpd' in locals():
            httpd.shutdown()
        return 0
    except Exception as e:
        print(f"\nError: {e}")
        if 'feed_engine' in locals():
            feed_engine.terminate()
            feed_log.close()
        return 1

def print_usage():
    """Print script usage instructions."""
    print("\nUsage:")
    print("  python manage.py start  - Start all services")
    print("  python manage.py stop   - Stop all services")
    print("  python manage.py status - Check services status")

def main():
    if len(sys.argv) < 2 or sys.argv[1] not in ['start', 'stop', 'status']:
        print_usage()
        return 1

    command = sys.argv[1]

    if command == 'start':
        return start_server()
    elif command == 'stop':
        success = True
        for service, port in PORTS.items():
            if not kill_process_on_port(port, service):
                success = False
        return 0 if success else 1
    elif command == 'status':
        print("\n=== Service Status ===")
        all_running = True
        for service, port in PORTS.items():
            pid = find_process_on_port(port)
            if pid:
                print(f"{service.title()} service is running on port {port} (PID: {pid})")
                if service == 'feed' and LOG_FILES['feed'].exists():
                    try:
                        # Show last few lines of feed engine log
                        with open(LOG_FILES['feed']) as f:
                            last_lines = f.readlines()[-5:]  # Last 5 lines
                            if last_lines:
                                print("\nRecent feed engine logs:")
                                for line in last_lines:
                                    print(f"  {line.strip()}")
                    except Exception as e:
                        print(f"\nError reading feed engine logs: {e}")
            else:
                print(f"{service.title()} service is not running")
                all_running = False
        
        if not all_running:
            print("\nTo start all services, run: python manage.py start")
        else:
            print("\nAll services are running")
            print("To stop all services, run: python manage.py stop")
            
        if LOG_FILES['feed'].exists():
            print(f"\nFull feed engine logs available at: {LOG_FILES['feed']}")
        return 0

if __name__ == "__main__":
    exit(main())
