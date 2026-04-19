password="${1:-$(<./password.txt)}"
adbIdentifier="${2:-$(<./adbIdentifier.txt)}"

if adb -s $adbIdentifier shell dumpsys window | grep -q -E "mShowing|mOccluded"; then
    echo "Unlocking..."

    adb -s $adbIdentifier shell input keyevent 3
    sleep 1
    adb -s $adbIdentifier shell input swipe 100 1000 1100 1000 300
    adb -s $adbIdentifier shell input swipe 100 1000 1100 1000 300
    sleep 1
    adb -s $adbIdentifier shell input text "$password"
    sleep 0.4
    adb -s $adbIdentifier shell input keyevent 66

    echo "Unlocked"
else
    echo "Already unlocked"
fi