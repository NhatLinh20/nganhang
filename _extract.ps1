Add-Type -AssemblyName System.IO.Compression.FileSystem

$zipPath = (Get-ChildItem "d:\OneDrive" -Filter "ngan_hang_lop12.zip" -Recurse | Select-Object -First 1).FullName
$dest = "d:\nganhang\_temp_zip"

if (Test-Path $dest) { Remove-Item $dest -Recurse -Force }
New-Item $dest -ItemType Directory -Force | Out-Null

Write-Host "Extracting: $zipPath"
[System.IO.Compression.ZipFile]::ExtractToDirectory($zipPath, $dest)

Write-Host "`n--- Files ---"
Get-ChildItem $dest -Recurse | ForEach-Object {
    Write-Host "$($_.FullName) ($($_.Length) bytes)"
}

Write-Host "`n--- main.tex ---"
Get-Content (Join-Path $dest "main.tex") -Encoding UTF8
