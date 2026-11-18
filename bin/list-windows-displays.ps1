$ErrorActionPreference = 'Stop'

# Windows Terminal positions are in physical pixels, including on mixed-DPI desktops.
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;

public static class DisplayDpi
{
    [DllImport("user32.dll")]
    public static extern IntPtr SetThreadDpiAwarenessContext(IntPtr dpiContext);
}
'@

$previousContext = [DisplayDpi]::SetThreadDpiAwarenessContext([IntPtr](-4))
if ($previousContext -eq [IntPtr]::Zero) {
    throw 'Could not enable per-monitor DPI awareness.'
}

Add-Type -AssemblyName System.Windows.Forms
$screens = [System.Windows.Forms.Screen]::AllScreens |
    Sort-Object -Property @{ Expression = 'Primary'; Descending = $true }, DeviceName

$displays = @(foreach ($screen in $screens) {
    $workArea = $screen.WorkingArea
    [pscustomobject]@{
        primary = $screen.Primary
        width = $screen.Bounds.Width
        height = $screen.Bounds.Height
        x = $workArea.Left + [Math]::Min(16, $workArea.Width - 1)
        y = $workArea.Top + [Math]::Min(16, $workArea.Height - 1)
    }
})

ConvertTo-Json -InputObject $displays -Compress
