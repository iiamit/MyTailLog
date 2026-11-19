param([string]$Page, [string]$Out, [int]$W = 1500, [int]$H = 1200, [string]$Query = "")
# Renders docs/redesign/<Page> with headless Chrome into $env:TEMP/mytaillog-shots/<Out>.png
# -Query "only=fig-id-1,fig-id-2" isolates figures; add "&open=1" to show web artboards at full size (use -W 1500 -H 1000).
$shots = (Join-Path $env:TEMP "mytaillog-shots")
New-Item -ItemType Directory -Force $shots | Out-Null
$prof = Join-Path $env:TEMP ("mtl-chrome-" + [guid]::NewGuid().ToString("N"))
$url = "file:///" + ((Join-Path (Split-Path $PSScriptRoot -Parent) $Page) -replace "\\", "/")
if ($Query) { $url = "$url" + "?" + "$Query" }
$p = Start-Process -FilePath "C:\Program Files\Google\Chrome\Application\chrome.exe" -ArgumentList @("--headless=new","--disable-gpu","--hide-scrollbars","--no-first-run","--user-data-dir=$prof","--window-size=$W,$H","--virtual-time-budget=9000","--screenshot=$shots\$Out.png",$url) -PassThru -WindowStyle Hidden
$p.WaitForExit(60000) | Out-Null
Start-Sleep -Milliseconds 500
Remove-Item -Recurse -Force $prof -ErrorAction SilentlyContinue
if (Test-Path "$shots\$Out.png") { "$shots\$Out.png" } else { "FAILED: no screenshot written" }
