# Emoji POS VIGI bridge — install on the always-on Windows POS/print station.
# It pulls VIGI Channel-Zero over the store LAN and exposes low-latency HLS through a named Cloudflare Tunnel.
# Run in an elevated PowerShell. The NVR password never leaves this PC.
[CmdletBinding()]
param(
  [string]$NvrHost = '192.168.50.2',
  [Parameter(Mandatory=$true)][string]$TunnelToken,
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
hls: yes
hlsAddress: 127.0.0.1:8888
hlsSegmentCount: 3
hlsSegmentDuration: 1s
hlsPartDuration: 200ms
webrtc: yes
webrtcAddress: 127.0.0.1:8889
webrtcLocalUDPAddress: ''
webrtcLocalTCPAddress: ''
paths:
  channel-zero:
    source: $(Quote-Yaml $source)
    sourceProtocol: tcp
    sourceOnDemand: yes
"@
  Set-Content -Encoding utf8NoBOM -NoNewline -Path (Join-Path $InstallDir 'mediamtx.yml') -Value $yaml
  $run=@"
`$ErrorActionPreference='Stop'
`$dir='$($InstallDir.Replace("'","''"))'
Start-Process -FilePath (Join-Path `$dir 'mediamtx.exe') -ArgumentList (Join-Path `$dir 'mediamtx.yml') -WorkingDirectory `$dir -WindowStyle Hidden
Start-Process -FilePath (Join-Path `$dir 'cloudflared.exe') -ArgumentList 'tunnel','--no-autoupdate','run','--token','$($TunnelToken.Replace("'","''"))' -WorkingDirectory `$dir -WindowStyle Hidden
"@
  Set-Content -Encoding utf8NoBOM -NoNewline -Path (Join-Path $InstallDir 'run.ps1') -Value $run
  $cf=Join-Path $InstallDir 'cloudflared.exe'
  Invoke-WebRequest -UseBasicParsing -Uri 'https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe' -OutFile $cf
  $task='EmojiPOS-VigiBridge'
  schtasks.exe /Create /TN $task /SC ONSTART /RU SYSTEM /RL HIGHEST /TR "powershell.exe -NoProfile -ExecutionPolicy Bypass -File `"$InstallDir\run.ps1`"" /F | Out-Null
  schtasks.exe /Run /TN $task | Out-Null
  Write-Host ''
  Write-Host '安裝完成。' -ForegroundColor Green
  Write-Host 'Cloudflare Zero Trust 的 Named Tunnel Public Hostname 要指向：' -ForegroundColor Yellow
  Write-Host 'http://127.0.0.1:8888' -ForegroundColor Yellow
  Write-Host 'POS 監視器頁填入：https://你的公開網域/channel-zero' -ForegroundColor Yellow
  Write-Host '請在 NVR：設定 > Network > Network Service 確認 RTSP 啟用、554、SRTP 關閉。'
} finally {
  $nvrPassword=$null
}
