$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location -LiteralPath $Root
$AppVersion = '7.2.1'
$OutDir = Join-Path $Root 'OUTPUT'
New-Item -ItemType Directory -Force -Path $OutDir | Out-Null
$Log = Join-Path $OutDir 'BUILD_LOG_SIGNED.txt'
"Hisab360 v$AppVersion SIGNED APK Build Log - $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')" | Set-Content -LiteralPath $Log -Encoding UTF8

function Log([string]$Text='') {
  $Text | Tee-Object -FilePath $Log -Append
}

function Stage([string]$Text) {
  Write-Host ''
  Write-Host ('=' * 60)
  Write-Host ('  ' + $Text)
  Write-Host ('=' * 60)
  Log ''
  Log ('===== ' + $Text + ' =====')
}

function Invoke-External {
  param(
    [Parameter(Mandatory=$true)][string]$Label,
    [Parameter(Mandatory=$true)][string]$File,
    [string[]]$Arguments = @(),
    [string]$WorkingDirectory = $Root
  )
  Log ('> ' + $File + ' ' + ($Arguments -join ' '))
  $stdoutFile = Join-Path $env:TEMP ("hisab360_stdout_" + [guid]::NewGuid().ToString('N') + '.log')
  $stderrFile = Join-Path $env:TEMP ("hisab360_stderr_" + [guid]::NewGuid().ToString('N') + '.log')
  try {
    $proc = Start-Process -FilePath $File -ArgumentList $Arguments -WorkingDirectory $WorkingDirectory -NoNewWindow -Wait -PassThru -RedirectStandardOutput $stdoutFile -RedirectStandardError $stderrFile
    if (Test-Path $stdoutFile) { Get-Content -LiteralPath $stdoutFile -ErrorAction SilentlyContinue | ForEach-Object { Write-Host $_; Log $_ } }
    if (Test-Path $stderrFile) { Get-Content -LiteralPath $stderrFile -ErrorAction SilentlyContinue | ForEach-Object { Write-Host $_; Log $_ } }
    $code = $proc.ExitCode
  } finally {
    Remove-Item -LiteralPath $stdoutFile,$stderrFile -Force -ErrorAction SilentlyContinue
  }
  if ($code -ne 0) { throw "$Label failed with exit code $code" }
  
}

try {
  Write-Host '============================================================'
  Write-Host "  HISAB360 v$AppVersion - AUTO-SIGNED RELEASE APK"
  Write-Host '============================================================'
  Write-Host '  Java: 21 | Capacitor: 8.x'
  Write-Host '  Package: com.yasirkhan.hisab360'
  Write-Host ('  Full log: ' + (Split-Path -Leaf $Log))
  Write-Host '============================================================'

  Stage 'Java 21 check'
  $javaCandidates = @(
    'C:\Program Files\Microsoft\jdk-21.0.12.101-hotspot',
    'C:\Program Files\Microsoft\jdk-21.0.12.1-hotspot',
    'C:\Program Files\Eclipse Adoptium\jdk-21*'
  )
  $javaHome = $null
  foreach ($candidate in $javaCandidates) {
    if ($candidate.Contains('*')) {
      $match = Get-ChildItem -Path $candidate -Directory -ErrorAction SilentlyContinue | Select-Object -First 1
      if ($match -and (Test-Path (Join-Path $match.FullName 'bin\javac.exe'))) { $javaHome = $match.FullName; break }
    } elseif (Test-Path (Join-Path $candidate 'bin\javac.exe')) {
      $javaHome = $candidate; break
    }
  }
  if (-not $javaHome) {
    $whereJava = & where.exe java 2>$null
    foreach ($j in $whereJava) {
      if ($j -match '\\jdk-21[^\\]*\\bin\\java\.exe$') {
        $javaHome = Split-Path -Parent (Split-Path -Parent $j)
        break
      }
    }
  }
  if (-not $javaHome) { throw 'Java 21 not found.' }
  $env:JAVA_HOME = $javaHome
  $env:Path = (Join-Path $javaHome 'bin') + ';' + $env:Path
  Invoke-External -Label 'Java version' -File (Join-Path $javaHome 'bin\java.exe') -Arguments @('-version')
  Invoke-External -Label 'Javac version' -File (Join-Path $javaHome 'bin\javac.exe') -Arguments @('-version')
  Write-Host "[OK] Java 21: $javaHome"
  Log "JAVA_HOME=$javaHome"

  Stage 'Android SDK check'
  $sdk = Join-Path $env:LOCALAPPDATA 'Android\Sdk'
  if (-not (Test-Path $sdk)) {
    if ($env:ANDROID_SDK_ROOT -and (Test-Path $env:ANDROID_SDK_ROOT)) { $sdk = $env:ANDROID_SDK_ROOT }
    elseif ($env:ANDROID_HOME -and (Test-Path $env:ANDROID_HOME)) { $sdk = $env:ANDROID_HOME }
    else { throw 'Android SDK not found.' }
  }
  $env:ANDROID_HOME = $sdk
  $env:ANDROID_SDK_ROOT = $sdk
  $env:Path = (Join-Path $sdk 'platform-tools') + ';' + $env:Path
  Write-Host "[OK] Android SDK: $sdk"
  Log "ANDROID_HOME=$sdk"

  Stage 'Node / npm check'
  $node = (Get-Command node.exe -ErrorAction Stop).Source
  $npm = (Get-Command npm.cmd -ErrorAction Stop).Source
  Invoke-External -Label 'Node version' -File $node -Arguments @('--version')
  Invoke-External -Label 'npm version' -File $npm -Arguments @('--version')
  $nodeMajor = [int]((& $node -p "parseInt(process.versions.node.split('.')[0],10)").Trim())
  if ($nodeMajor -lt 22) { throw "Node.js 22+ required; found major $nodeMajor." }
  Write-Host "[OK] Node major $nodeMajor"

  Stage 'NPM dependencies verify / repair'
  $required = @(
    'node_modules\.bin\vite.cmd',
    'node_modules\.bin\cap.cmd',
    'node_modules\firebase\package.json',
    'node_modules\@capacitor\android\package.json',
    'node_modules\@capacitor\filesystem\package.json',
    'node_modules\@capacitor\share\package.json'
  )
  $needInstall = $false
  foreach ($rel in $required) { if (-not (Test-Path (Join-Path $Root $rel))) { $needInstall = $true } }
  if ($needInstall) {
    Write-Host '[INFO] Installing/repairing npm dependencies...'
    try {
      Invoke-External -Label 'npm install' -File $npm -Arguments @('install','--include=dev','--no-audit','--no-fund')
    } catch {
      Write-Host '[WARN] Default npm install failed; retrying official registry...'
      Invoke-External -Label 'npm install registry retry' -File $npm -Arguments @('install','--include=dev','--no-audit','--no-fund','--registry=https://registry.npmjs.org/')
    }
  }
  foreach ($rel in $required) { if (-not (Test-Path (Join-Path $Root $rel))) { throw "Required dependency missing after npm install: $rel" } }
  $vite = Join-Path $Root 'node_modules\.bin\vite.cmd'
  $cap = Join-Path $Root 'node_modules\.bin\cap.cmd'
  Invoke-External -Label 'Vite version' -File $vite -Arguments @('--version')
  Invoke-External -Label 'Capacitor version' -File $cap -Arguments @('--version')
  Write-Host '[OK] Dependencies ready.'

  Stage 'Vite production bundle'
  Invoke-External -Label 'Vite build' -File $vite -Arguments @('build')
  if (-not (Test-Path (Join-Path $Root 'dist\index.html'))) { throw 'dist\index.html missing after Vite build.' }
  Write-Host '[OK] Web bundle ready.'

  Stage 'Android project prepare'
  $androidDir = Join-Path $Root 'android'
  $gradlew = Join-Path $androidDir 'gradlew.bat'
  if (-not (Test-Path $gradlew)) {
    Invoke-External -Label 'Capacitor add android' -File $cap -Arguments @('add','android')
  }
  $localProperties = 'sdk.dir=' + ($sdk -replace '\\','/')
  Set-Content -LiteralPath (Join-Path $androidDir 'local.properties') -Value $localProperties -Encoding ASCII
  $gradleProps = Join-Path $androidDir 'gradle.properties'
  if (-not (Test-Path $gradleProps)) { New-Item -ItemType File -Path $gradleProps | Out-Null }
  $gp = Get-Content -LiteralPath $gradleProps -Raw -ErrorAction SilentlyContinue
  if ($null -eq $gp) { $gp = '' }
  if ($gp -notmatch '(?m)^org\.gradle\.jvmargs=') { Add-Content -LiteralPath $gradleProps -Value 'org.gradle.jvmargs=-Xmx2048m -Dfile.encoding=UTF-8' }
  if ($gp -notmatch '(?m)^org\.gradle\.daemon=') { Add-Content -LiteralPath $gradleProps -Value 'org.gradle.daemon=false' }
  if ($gp -notmatch '(?m)^org\.gradle\.parallel=') { Add-Content -LiteralPath $gradleProps -Value 'org.gradle.parallel=false' }
  Write-Host '[OK] Android project ready.'

  Stage 'Capacitor sync + Android polish'
  Invoke-External -Label 'Capacitor sync' -File $cap -Arguments @('sync','android')
  Set-Content -LiteralPath (Join-Path $androidDir 'local.properties') -Value $localProperties -Encoding ASCII
  $prep = Join-Path $Root '_PREPARE_ANDROID_PROJECT.ps1'
  if (Test-Path $prep) {
    Write-Host ("> & `"{0}`" -ProjectRoot `"{1}`"" -f $prep,$Root)
    & $prep -ProjectRoot $Root
    if ($LASTEXITCODE -ne 0) { throw "Android version/icon prepare failed with exit code $LASTEXITCODE" }
  }
  Write-Host '[OK] Capacitor sync complete.'


  Stage 'Persistent signing key'
  $SignDir = Join-Path $env:USERPROFILE 'Hisab360-Signing'
  New-Item -ItemType Directory -Force -Path $SignDir | Out-Null
  $KeyStore = Join-Path $SignDir 'hisab360-release.jks'
  $CredFile = Join-Path $SignDir 'SIGNING-INFO.txt'
  $Alias = 'hisab360'

  function New-H360Password([int]$Length=32) {
    # Alphanumeric only: safe through CMD, PowerShell, keytool and Gradle.
    $alphabet='ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789'
    $bytes=New-Object byte[] $Length
    $rng=[System.Security.Cryptography.RandomNumberGenerator]::Create()
    try { $rng.GetBytes($bytes) } finally { $rng.Dispose() }
    -join ($bytes | ForEach-Object { $alphabet[$_ % $alphabet.Length] })
  }

  function Read-H360Credentials {
    if (-not (Test-Path -LiteralPath $CredFile)) { return $null }
    $map=@{}
    foreach($line in @(Get-Content -LiteralPath $CredFile -ErrorAction Stop)) {
      if($line -match '^([A-Z_]+)=(.*)$'){ $map[$matches[1]]=$matches[2] }
    }
    if(-not $map.ContainsKey('STORE_PASSWORD') -or -not $map.ContainsKey('KEY_PASSWORD')) { return $null }
    if([string]::IsNullOrWhiteSpace([string]$map['STORE_PASSWORD']) -or [string]::IsNullOrWhiteSpace([string]$map['KEY_PASSWORD'])) { return $null }
    return $map
  }

  $creds=Read-H360Credentials
  $needNewKey = (-not (Test-Path -LiteralPath $KeyStore)) -or ($null -eq $creds)
  if($needNewKey) {
    # User approved a fresh key. Remove only incomplete Hisab360 signing artifacts.
    Remove-Item -LiteralPath $KeyStore,$CredFile -Force -ErrorAction SilentlyContinue
    $StorePass=New-H360Password 32
    $KeyPass=$StorePass
    $keytool=Join-Path $javaHome 'bin\keytool.exe'
    Write-Host '[INFO] Creating a new permanent Hisab360 signing key...'
    Log ("> $keytool -genkeypair ... -keystore $KeyStore -alias $Alias")
    # Direct invocation preserves dname and paths as single arguments.
    & $keytool '-genkeypair' '-v' '-keystore' $KeyStore '-storepass' $StorePass '-alias' $Alias '-keypass' $KeyPass '-keyalg' 'RSA' '-keysize' '4096' '-validity' '36500' '-dname' 'CN=YasirKhan,OU=Hisab360,O=Hisab360,L=Faisalabad,ST=Punjab,C=PK' 2>&1 | ForEach-Object { Write-Host $_; Log ([string]$_) }
    if($LASTEXITCODE -ne 0 -or -not (Test-Path -LiteralPath $KeyStore)) { throw "Create Hisab360 JKS failed with exit code $LASTEXITCODE" }
    @(
      'HISAB360_SIGNING_V2=1',
      "KEYSTORE=$KeyStore",
      "ALIAS=$Alias",
      "STORE_PASSWORD=$StorePass",
      "KEY_PASSWORD=$KeyPass"
    ) | Set-Content -LiteralPath $CredFile -Encoding ASCII
    $creds=Read-H360Credentials
    if($null -eq $creds){ throw 'Signing key was created but credentials could not be read back.' }
    Write-Host "[OK] New permanent JKS created: $KeyStore"
  } else {
    Write-Host "[OK] Reusing permanent JKS: $KeyStore"
  }

  $StorePass=[string]$creds['STORE_PASSWORD']
  $KeyPass=[string]$creds['KEY_PASSWORD']
  if($StorePass.Length -lt 6 -or $KeyPass.Length -lt 6){ throw 'Stored signing password is invalid.' }
  $keytool=Join-Path $javaHome 'bin\keytool.exe'
  & $keytool '-list' '-keystore' $KeyStore '-storepass' $StorePass '-alias' $Alias *> $null
  if($LASTEXITCODE -ne 0){ throw 'Existing Hisab360 signing key could not be verified. Delete only the Hisab360-Signing folder and rebuild to create a fresh key.' }
  Write-Host '[OK] Signing key verified.'

  Stage 'Signed release APK build'
  if (-not (Test-Path $gradlew)) { throw 'android\gradlew.bat missing.' }

  # Inject signingConfig into generated Capacitor Gradle project using environment variables.
  $appGradle=Join-Path $androidDir 'app\build.gradle'
  $g=Get-Content $appGradle -Raw
  if($g -notmatch 'HISAB360_AUTO_SIGNING'){
    $signBlock=@'
    // HISAB360_AUTO_SIGNING
    signingConfigs {
        release {
            storeFile file(System.getenv("H360_KEYSTORE"))
            storePassword System.getenv("H360_STORE_PASS")
            keyAlias System.getenv("H360_KEY_ALIAS")
            keyPassword System.getenv("H360_KEY_PASS")
        }
    }
'@
    $g=$g -replace 'android\s*\{',("android {`r`n"+$signBlock)
    $g=$g -replace 'buildTypes\s*\{\s*release\s*\{', 'buildTypes { release { signingConfig signingConfigs.release'
    $utf8NoBom=New-Object System.Text.UTF8Encoding($false)
    [System.IO.File]::WriteAllText($appGradle,$g,$utf8NoBom)
  }

  $env:H360_KEYSTORE=$KeyStore
  $env:H360_STORE_PASS=$StorePass
  $env:H360_KEY_ALIAS=$Alias
  $env:H360_KEY_PASS=$KeyPass

  Invoke-External -Label 'Gradle release build' -File $gradlew -Arguments @('assembleRelease','--no-daemon','--stacktrace','--console=plain') -WorkingDirectory $androidDir
  $artifact=Join-Path $androidDir 'app\build\outputs\apk\release\app-release.apk'
  if(-not (Test-Path $artifact)){ throw "Signed release artifact not found: $artifact" }

  $dest=Join-Path $OutDir 'Hisab360-v7.2.1-SIGNED.apk'
  Copy-Item $artifact $dest -Force

  # Verify signature using newest available apksigner.
  $apkSigner=Get-ChildItem (Join-Path $sdk 'build-tools') -Filter apksigner.bat -Recurse -ErrorAction SilentlyContinue |
    Sort-Object FullName -Descending | Select-Object -First 1
  if($apkSigner){
    Invoke-External -Label 'APK signature verify' -File $apkSigner.FullName -Arguments @('verify','--verbose','--print-certs',$dest)
  } else {
    Write-Host '[WARN] apksigner.bat not found; Gradle signing completed but separate verification skipped.'
  }

  $size=(Get-Item $dest).Length
  Log ''
  Log "BUILD SUCCESSFUL - SIGNED APK - $size bytes - $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')"
  Write-Host ''
  Write-Host '============================================================'
  Write-Host '  SIGNED APK BUILD SUCCESSFUL'
  Write-Host '============================================================'
  Write-Host "  APK: $dest"
  Write-Host "  JKS: $KeyStore"
  Write-Host "  Signing info: $CredFile"
  Write-Host '============================================================'
  Start-Process explorer.exe $OutDir
  exit 0
}
catch {
  $message=$_.Exception.Message
  Log ''
  Log ('[ERROR] '+$message)
  if($_.ScriptStackTrace){Log $_.ScriptStackTrace}
  Log ('BUILD FAILED - '+(Get-Date -Format 'yyyy-MM-dd HH:mm:ss'))
  Write-Host ''
  Write-Host '============================================================' -ForegroundColor Red
  Write-Host '  BUILD FAILED' -ForegroundColor Red
  Write-Host '============================================================' -ForegroundColor Red
  Write-Host ('  '+$message) -ForegroundColor Red
  Write-Host ('  Full log: '+$Log)
  Write-Host '============================================================' -ForegroundColor Red
  try { Start-Process notepad.exe $Log } catch {}
  exit 1
}
