# Adds ?v=<timestamp> to every local asset reference in the site's HTML.
# Firebase Hosting already sends no-cache, but a browser that has decided
# to hold on to an old file will ignore that far too often — and "I can't
# see the change" is impossible to debug from the other end of a phone call.
$ErrorActionPreference = 'Stop'
$root = Join-Path $PSScriptRoot 'sarvodayahinsa'
$stamp = [DateTimeOffset]::UtcNow.ToUnixTimeSeconds()

$files = Get-ChildItem -Path $root -Filter *.html -File |
         Where-Object { $_.Name -ne 'akshaynidhi.html' }

$changed = 0
foreach ($f in $files) {
    $t = Get-Content $f.FullName -Raw -Encoding utf8
    $before = $t
    # assets/whatever.js  or  assets/types/whatever.js  or  assets/ui.css
    $t = [regex]::Replace($t, '(?<=(?:src|href)=")(assets/[^"?]+\.(?:js|css))(?:\?v=\d+)?(?=")', "`$1?v=$stamp")
    if ($t -ne $before) {
        Set-Content $f.FullName -Value $t -Encoding utf8
        $changed++
    }
}
Write-Output "stamped $changed file(s) with v=$stamp"
