param([Parameter(Mandatory=$true)][string]$PrinterName)
# Receive binary ESC/POS from Node stdin and write it unchanged to the Windows spooler.
$ErrorActionPreference = 'Stop'
Add-Type @'
using System;
using System.Runtime.InteropServices;
public static class RawPrinter {
  [StructLayout(LayoutKind.Sequential, CharSet=CharSet.Unicode)] public class DOCINFO {
    [MarshalAs(UnmanagedType.LPWStr)] public string pDocName;
    [MarshalAs(UnmanagedType.LPWStr)] public string pOutputFile;
    [MarshalAs(UnmanagedType.LPWStr)] public string pDataType;
  }
  [DllImport("winspool.drv", CharSet=CharSet.Unicode, SetLastError=true)] public static extern bool OpenPrinter(string name, out IntPtr handle, IntPtr defaults);
  [DllImport("winspool.drv", SetLastError=true)] public static extern bool ClosePrinter(IntPtr handle);
  [DllImport("winspool.drv", CharSet=CharSet.Unicode, SetLastError=true)] public static extern bool StartDocPrinter(IntPtr handle, int level, DOCINFO doc);
  [DllImport("winspool.drv", SetLastError=true)] public static extern bool EndDocPrinter(IntPtr handle);
  [DllImport("winspool.drv", SetLastError=true)] public static extern bool StartPagePrinter(IntPtr handle);
  [DllImport("winspool.drv", SetLastError=true)] public static extern bool EndPagePrinter(IntPtr handle);
  [DllImport("winspool.drv", SetLastError=true)] public static extern bool WritePrinter(IntPtr handle, byte[] bytes, int count, out int written);
}
'@
$input = [Console]::OpenStandardInput()
$buffer = New-Object byte[] 8192
$stream = New-Object System.IO.MemoryStream
while (($n = $input.Read($buffer, 0, $buffer.Length)) -gt 0) { $stream.Write($buffer, 0, $n) }
$bytes = $stream.ToArray()
if ($bytes.Length -eq 0) { throw 'No ESC/POS bytes received' }
$handle = [IntPtr]::Zero
if (-not [RawPrinter]::OpenPrinter($PrinterName, [ref]$handle, [IntPtr]::Zero)) { throw "OpenPrinter failed: $([Runtime.InteropServices.Marshal]::GetLastWin32Error())" }
try {
  $doc = New-Object RawPrinter+DOCINFO
  $doc.pDocName = 'emoji POS'
  $doc.pDataType = 'RAW'
  if (-not [RawPrinter]::StartDocPrinter($handle, 1, $doc)) { throw 'StartDocPrinter failed' }
  try {
    if (-not [RawPrinter]::StartPagePrinter($handle)) { throw 'StartPagePrinter failed' }
    try {
      $written = 0
      if (-not [RawPrinter]::WritePrinter($handle, $bytes, $bytes.Length, [ref]$written) -or $written -ne $bytes.Length) { throw 'WritePrinter failed' }
    } finally { [void][RawPrinter]::EndPagePrinter($handle) }
  } finally { [void][RawPrinter]::EndDocPrinter($handle) }
} finally { [void][RawPrinter]::ClosePrinter($handle) }
