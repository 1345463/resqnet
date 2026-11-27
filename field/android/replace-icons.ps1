Add-Type -AssemblyName System.Drawing

$root = 'C:\Users\baozi6688\Desktop\qoder-cup-2026\field'
$src = [System.Drawing.Image]::FromFile((Join-Path $root 'public\icon-512.png'))
$res = Join-Path $root 'android\app\src\main\res'

$legacy = @{ 'mdpi' = 48; 'hdpi' = 72; 'xhdpi' = 96; 'xxhdpi' = 144; 'xxxhdpi' = 192 }
$foreground = @{ 'mdpi' = 108; 'hdpi' = 162; 'xhdpi' = 216; 'xxhdpi' = 324; 'xxxhdpi' = 432 }

function Resize-To($image, $width, $height, $path) {
  $bmp = New-Object System.Drawing.Bitmap($width, $height)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $g.DrawImage($image, 0, 0, $width, $height)
  $bmp.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)
  $g.Dispose()
  $bmp.Dispose()
}

foreach ($dpi in $legacy.Keys) {
  $size = $legacy[$dpi]
  $dir = Join-Path $res ("mipmap-{0}" -f $dpi)
  if (Test-Path $dir) {
    Resize-To $src $size $size (Join-Path $dir 'ic_launcher.png')
    Resize-To $src $size $size (Join-Path $dir 'ic_launcher_round.png')
  }
}

foreach ($dpi in $foreground.Keys) {
  $size = $foreground[$dpi]
  $dir = Join-Path $res ("mipmap-{0}" -f $dpi)
  if (Test-Path $dir) {
    Resize-To $src $size $size (Join-Path $dir 'ic_launcher_foreground.png')
  }
}

$src.Dispose()
Write-Output 'launcher icons replaced'