Add-Type -AssemblyName System.Drawing

$root = Split-Path -Parent $PSScriptRoot
$out = Join-Path $root 'public'

foreach ($size in 192, 512) {
  $bmp = New-Object System.Drawing.Bitmap($size, $size)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias

  $rect = New-Object System.Drawing.Rectangle(0, 0, $size, $size)
  $brush = New-Object System.Drawing.Drawing2D.LinearGradientBrush(
    $rect,
    [System.Drawing.Color]::FromArgb(103, 232, 249),
    [System.Drawing.Color]::FromArgb(14, 165, 233),
    45
  )
  $g.FillRectangle($brush, $rect)

  $font = New-Object System.Drawing.Font('Arial', [float]($size * 0.34), [System.Drawing.FontStyle]::Bold)
  $color = [System.Drawing.Color]::FromArgb(4, 18, 26)
  $textBrush = New-Object System.Drawing.SolidBrush($color)
  $format = New-Object System.Drawing.StringFormat
  $format.Alignment = [System.Drawing.StringAlignment]::Center
  $format.LineAlignment = [System.Drawing.StringAlignment]::Center
  $textRect = New-Object System.Drawing.RectangleF(0, 0, $size, $size)
  $g.DrawString('RQ', $font, $textBrush, $textRect, $format)

  $path = Join-Path $out ("icon-{0}.png" -f $size)
  $bmp.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)
  $g.Dispose()
  $bmp.Dispose()
}

Write-Output "icons generated"