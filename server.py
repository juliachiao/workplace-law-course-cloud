#!/usr/bin/env python3
"""
SYSTEX 職場法律必修課 - 企業訓練平台
本地靜態檔案伺服器 (Port 3333)
"""
import http.server
import socketserver
import os
import sys

PORT = 3333
DIRECTORY = os.path.dirname(os.path.abspath(__file__))


class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=DIRECTORY, **kwargs)

    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()

    def log_message(self, fmt, *args):
        sys.stdout.write(f"[{self.log_date_time_string()}] {fmt % args}\n")


if __name__ == "__main__":
    socketserver.TCPServer.allow_reuse_address = True
    try:
        with socketserver.TCPServer(("", PORT), Handler) as httpd:
            print("=" * 60)
            print(" SYSTEX 職場法律必修課 - 企業訓練平台")
            print("=" * 60)
            print(f" 員工前台:  http://localhost:{PORT}/")
            print(f" 管理後台:  http://localhost:{PORT}/admin.html")
            print("-" * 60)
            print(" 員工示範帳號:  E001 / E001  (新進)")
            print("                E002 / E002  (主管)")
            print(" 管理員帳號:    admin / admin123")
            print("=" * 60)
            print(" 按 Ctrl+C 結束伺服器\n")
            httpd.serve_forever()
    except KeyboardInterrupt:
        print("\n伺服器已關閉")
        sys.exit(0)
