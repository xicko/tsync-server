#!/bin/bash

PHONE="${1}"

adb connect "$PHONE" >/dev/null 2>&1