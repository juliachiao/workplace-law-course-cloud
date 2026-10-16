#!/bin/bash
# 啟動企業訓練平台 (Port 3333)
cd "$(dirname "$0")"
echo "啟動 SYSTEX 企業訓練平台..."
python3 server.py
