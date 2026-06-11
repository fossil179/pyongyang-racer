#!/bin/bash
sleep 2
echo "${VNC_PASSWORD:-pyongyang}" | x11vnc -display :99 -forever -shared -rfbport 5900 -passwd /dev/stdin
