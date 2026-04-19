#!/bin/bash

PHONE="${1}"

while true; do
    adb connect "$PHONE" >/dev/null 2>&1
    adb devices
    sleep 10
done