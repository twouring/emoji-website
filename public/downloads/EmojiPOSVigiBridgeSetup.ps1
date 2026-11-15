# Emoji POS VIGI bridge — install on the always-on Windows POS/print station.
# It pulls VIGI Channel-Zero over the store LAN and exposes low-latency HLS through a named Cloudflare Tunnel.
# Run in an elevated PowerShell. The NVR password never leaves this PC.
[CmdletBinding()]
param(
  [string]$NvrHost = '192.168.50.2',
  [string]$TunnelToken = '',
  [string]$InstallDir = "$env:ProgramData\EmojiPOS\vigi-bridge"
)
$ErrorActionPreference='Stop'
$ProgressPreference='SilentlyContinue'

function Convert-SecureStringToPlainText([Security.SecureString]$SecureString) {
  $ptr=[Runtime.InteropServices.Marshal]::SecureStringToBSTR($SecureString)
  try { return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr) }
  finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr) }
}
function Quote-Yaml([string]$Value) { return "'" + $Value.Replace("'", "''") + "'" }

if(-not [Environment]::Is64BitOperatingSystem){throw '需要 64 位元 Windows。'}
New-Item -ItemType Directory -Force -Path $InstallDir | Out-Null
$acl=Get-Acl $InstallDir
$acl.SetAccessRuleProtection($true,$false)
$acl.Access | ForEach-Object {$acl.RemoveAccessRule($_) | Out-Null}
$acl.AddAccessRule((New-Object System.Security.AccessControl.FileSystemAccessRule('SYSTEM','FullControl','ContainerInherit,ObjectInherit','None','Allow')))
$acl.AddAccessRule((New-Object System.Security.AccessControl.FileSystemAccessRule('Administrators','FullControl','ContainerInherit,ObjectInherit','None','Allow')))
Set-Acl $InstallDir $acl

$nvrUser=Read-Host 'VIGI NVR 使用者名稱'
if([string]::IsNullOrWhiteSpace($nvrUser)){throw 'NVR 使用者名稱不可空白。'}
$nvrPassword=Convert-SecureStringToPlainText (Read-Host 'VIGI NVR 密碼' -AsSecureString)
try {
  $encodedUser=[Uri]::EscapeDataString($nvrUser)
  $encodedPassword=[Uri]::EscapeDataString($nvrPassword)
  $source="rtsp://${encodedUser}:${encodedPassword}@${NvrHost}:554/live/0/1/avm"
  $version='1.21.3'
  $archive=Join-Path $InstallDir "mediamtx_v${version}_windows_amd64.zip"
  $url="https://github.com/bluenviron/mediamtx/releases/download/v${version}/mediamtx_v${version}_windows_amd64.zip"
  Invoke-WebRequest -UseBasicParsing -Uri $url -OutFile $archive
  Expand-Archive -Force -Path $archive -DestinationPath $InstallDir
  Remove-Item -Force $archive
  $yaml=@"
logLevel: info
rtsp: no
rtmp: no
srt: no
moq: no
webrtc: no
api: no
metrics: no
pprof: no
playback: no
hls: yes
hlsAddress: 127.0.0.1:8888
hlsSegmentCount: 7
hlsSegmentDuration: 1s
hlsPartDuration: 200ms
paths:
  channel-zero:
    source: $(Quote-Yaml $source)
    rtspTransport: tcp
    sourceOnDemand: yes
"@
  [System.IO.File]::WriteAllText((Join-Path $InstallDir 'mediamtx.yml'), $yaml, (New-Object System.Text.UTF8Encoding($false)))
  $cfLine=''
  if($TunnelToken -ne ''){
    $cf=Join-Path $InstallDir 'cloudflared.exe'
    Invoke-WebRequest -UseBasicParsing -Uri 'https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe' -OutFile $cf
    $cfLine="Start-Process -FilePath (Join-Path `$dir 'cloudflared.exe') -ArgumentList 'tunnel','--no-autoupdate','run','--token','$($TunnelToken.Replace("'","''"))' -WorkingDirectory `$dir -WindowStyle Hidden"
  }
  # mediamtx 輸出寫到 mediamtx.log，啟動失敗時可直接看原因
  $run=@"
`$ErrorActionPreference='Stop'
`$dir='$($InstallDir.Replace("'","''"))'
Start-Process -FilePath (Join-Path `$dir 'mediamtx.exe') -ArgumentList (Join-Path `$dir 'mediamtx.yml') -WorkingDirectory `$dir -WindowStyle Hidden -RedirectStandardOutput (Join-Path `$dir 'mediamtx.log') -RedirectStandardError (Join-Path `$dir 'mediamtx.err.log')
$cfLine
"@
  [System.IO.File]::WriteAllText((Join-Path $InstallDir 'run.ps1'), $run, (New-Object System.Text.UTF8Encoding($false)))
  $task='EmojiPOS-VigiBridge'
  schtasks.exe /Create /TN $task /SC ONSTART /RU SYSTEM /RL HIGHEST /TR "powershell.exe -NoProfile -ExecutionPolicy Bypass -File `"$InstallDir\run.ps1`"" /F | Out-Null
  schtasks.exe /Run /TN $task | Out-Null
  Write-Host ''
  Start-Sleep -Seconds 3
  $alive=Get-Process mediamtx -ErrorAction SilentlyContinue
  Write-Host ''
  if($alive){ Write-Host '安裝完成，mediamtx 已在背景執行。' -ForegroundColor Green }
  else { Write-Host "mediamtx 沒有啟動，請看 $InstallDir\mediamtx.err.log 與 mediamtx.log。" -ForegroundColor Red }
  Write-Host "本機驗證：http://127.0.0.1:8888/channel-zero/" -ForegroundColor Yellow
  Write-Host '給 iPad／手機看：在這台安裝 Tailscale 後執行 tailscale serve --bg 8888，POS 監視器頁填它印出的 https://…ts.net/channel-zero/' -ForegroundColor Yellow
  Write-Host '請在 NVR：設定 > Network > Network Service 確認 RTSP 啟用、554、SRTP 關閉；System > Basic Settings 啟用 Channel-Zero。'
} finally {
  $nvrPassword=$null
}
