$excel = New-Object -ComObject Excel.Application
$excel.Visible = $false
$excel.DisplayAlerts = $false

function Read-ExcelFile($path) {
    Write-Host "=== FILE: $path ==="
    try {
        $wb = $excel.Workbooks.Open($path)
        $sheetCount = $wb.Worksheets.Count
        Write-Host "So sheet: $sheetCount"
        for ($s = 1; $s -le $sheetCount; $s++) {
            $ws = $wb.Worksheets.Item($s)
            $usedRows = $ws.UsedRange.Rows.Count
            $usedCols = $ws.UsedRange.Columns.Count
            Write-Host "Sheet $s : $($ws.Name)  [rows=$usedRows, cols=$usedCols]"
            $maxRow = [Math]::Min($usedRows, 20)
            $maxCol = [Math]::Min($usedCols, 30)
            for ($r = 1; $r -le $maxRow; $r++) {
                $cells = @()
                for ($c = 1; $c -le $maxCol; $c++) {
                    $cells += $ws.Cells.Item($r, $c).Text
                }
                Write-Host "  Row $r : $($cells -join ' | ')"
            }
        }
        $wb.Close($false)
    } catch {
        Write-Host "ERROR: $($_.Exception.Message)"
    }
}

Read-ExcelFile "d:\OneDrive\Máy tính\BANG_DAP_AN_tnmaker.xlsx"
Write-Host ""
Read-ExcelFile "d:\OneDrive\Máy tính\BANG_DAP_AN_AZOTA.xlsx"

$excel.Quit()
[System.Runtime.Interopservices.Marshal]::ReleaseComObject($excel) | Out-Null
