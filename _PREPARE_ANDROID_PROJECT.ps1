param([string]$ProjectRoot = $PSScriptRoot)
$ErrorActionPreference='Stop'
$android=Join-Path $ProjectRoot 'android'
$gradle=Join-Path $android 'app\build.gradle'
if(Test-Path $gradle){
  $g=Get-Content $gradle -Raw
  $g=[regex]::Replace($g,'versionCode\s+\d+','versionCode 70201')
  $g=[regex]::Replace($g,'versionName\s+"[^"]+"','versionName "7.2.1"')
  # Windows PowerShell 5.1 '-Encoding UTF8' writes a BOM; Groovy rejects it at column 1.
  $utf8NoBom = New-Object System.Text.UTF8Encoding($false)
  [System.IO.File]::WriteAllText($gradle, $g, $utf8NoBom)
}
$src=Join-Path $ProjectRoot 'resources\android-icons'
$res=Join-Path $android 'app\src\main\res'
foreach($dpi in @('mdpi','hdpi','xhdpi','xxhdpi','xxxhdpi')){
  $from=Join-Path $src "mipmap-$dpi"
  $to=Join-Path $res "mipmap-$dpi"
  if((Test-Path $from) -and (Test-Path $to)){
    Copy-Item (Join-Path $from 'ic_launcher.png') $to -Force
    Copy-Item (Join-Path $from 'ic_launcher_round.png') $to -Force
    if(Test-Path (Join-Path $from 'ic_launcher_foreground.png')){ Copy-Item (Join-Path $from 'ic_launcher_foreground.png') $to -Force }
  }
}

# Use the exact premium PNG launcher art instead of wrapping the full badge inside
# Capacitor's default adaptive foreground (which can double-mask/crop branded edges).
$adaptive=Join-Path $res 'mipmap-anydpi-v26'
foreach($name in @('ic_launcher.xml','ic_launcher_round.xml')){
  $f=Join-Path $adaptive $name
  if(Test-Path $f){ Remove-Item $f -Force }
}


# Camera permission for customer/profile photo capture from inside Hisab360.
$manifest=Join-Path $android 'app\src\main\AndroidManifest.xml'
if(Test-Path $manifest){
  $m=Get-Content $manifest -Raw
  if($m -notmatch 'android\.permission\.CAMERA'){
    $cameraLines = '<manifest$1>' + "`r`n    " + '<uses-permission android:name="android.permission.CAMERA" />' + "`r`n    " + '<uses-feature android:name="android.hardware.camera" android:required="false" />'
    $m = $m -replace '<manifest([^>]*)>', $cameraLines
  }
  $utf8NoBom = New-Object System.Text.UTF8Encoding($false)
  [System.IO.File]::WriteAllText($manifest,$m,$utf8NoBom)
}

Write-Host '[OK] Android version + Hisab360 premium icon + camera permission applied.'
