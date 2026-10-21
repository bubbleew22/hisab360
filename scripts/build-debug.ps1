$ErrorActionPreference='Stop'
$projectRoot=Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
Set-Location -LiteralPath $projectRoot
$jdk='C:\Program Files\Microsoft\jdk-21.0.12.101-hotspot'
if(-not(Test-Path (Join-Path $jdk 'bin\java.exe'))){throw 'Java 21 is required. Update the JDK path in this script.'}
$env:JAVA_HOME=$jdk
$env:Path=(Join-Path $jdk 'bin')+';'+$env:Path
& npm.cmd run build:web
if($LASTEXITCODE -ne 0){throw 'Web build failed'}
& npx.cmd cap sync android
if($LASTEXITCODE -ne 0){throw 'Capacitor sync failed'}
& .\android\gradlew.bat -p android assembleDebug --console=plain
if($LASTEXITCODE -ne 0){throw 'Android build failed'}
New-Item -ItemType Directory -Path OUTPUT -Force | Out-Null
Copy-Item -LiteralPath android/app/build/outputs/apk/debug/app-debug.apk -Destination OUTPUT/Hisab360-v7.2.1-DEBUG.apk
Write-Host 'Ready: OUTPUT/Hisab360-v7.2.1-DEBUG.apk'
