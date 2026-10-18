param(
  [Parameter(Mandatory = $true)][string]$Src,
  [Parameter(Mandatory = $true)][string]$Out,
  [Parameter(Mandatory = $true)][ValidateSet("docx", "hwpx")][string]$Kind
)
# Word(.docx) / 한글(.hwpx) 문서를 PDF 로 내보낸다. Windows + 해당 오피스가 설치된 PC 에서만 동작.
$ErrorActionPreference = "Stop"

if ($Kind -eq "docx") {
  $w = New-Object -ComObject Word.Application
  $w.Visible = $false
  $w.DisplayAlerts = 0
  try {
    $d = $w.Documents.Open($Src, $false, $true)
    $d.ExportAsFixedFormat($Out, 17)   # 17 = wdExportFormatPDF
    $d.Close($false)
  } finally { $w.Quit() }
} else {
  $hwp = New-Object -ComObject HWPFrame.HwpObject
  try { $hwp.XHwpWindows.Item(0).Visible = $false } catch {}
  [void]$hwp.RegisterModule("FilePathCheckerModuleExample", "FilePathCheckerModule")
  try {
    [void]$hwp.Open($Src, "HWPX", "forceopen:true")
    [void]$hwp.SaveAs($Out, "PDF", "")
  } finally { $hwp.Quit() }
}
