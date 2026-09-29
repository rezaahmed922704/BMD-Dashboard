param(
    [string]$Root = "D:\Open Code Desktob",
    [int]$Port = 8767,
    [string]$DefaultPage = '/ACL%20Trade%20%E2%80%93%20District%20Sales%20Analysis/apps-script-dashboard-demo/Index.preview.html'
)

$ErrorActionPreference = 'Stop'
$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://localhost:$Port/")
$listener.Start()
Write-Output "Serving $Root at http://localhost:$Port/"

$types = @{
    '.html'   = 'text/html; charset=utf-8'
    '.htm'    = 'text/html; charset=utf-8'
    '.js'     = 'application/javascript; charset=utf-8'
    '.css'    = 'text/css; charset=utf-8'
    '.json'   = 'application/json; charset=utf-8'
    '.geojson'= 'application/geo+json; charset=utf-8'
    '.csv'    = 'text/csv; charset=utf-8'
    '.png'    = 'image/png'
    '.jpg'    = 'image/jpeg'
    '.jpeg'   = 'image/jpeg'
    '.gif'    = 'image/gif'
    '.svg'    = 'image/svg+xml'
    '.ico'    = 'image/x-icon'
}

while ($listener.IsListening) {
    $context = $null
    try {
        $context = $listener.GetContext()
        $request = $context.Request
        $response = $context.Response
        $relative = [Uri]::UnescapeDataString($request.Url.AbsolutePath).TrimStart('/')

        if ($request.HttpMethod -eq 'POST' -and $relative -eq '__upload') {
            $queryParams = @{}
            foreach ($pair in (($request.Url.Query -replace '^\?', '') -split '&')) {
                if (-not $pair) { continue }
                $parts = $pair -split '=', 2
                $key = [Uri]::UnescapeDataString($parts[0])
                $value = if ($parts.Count -gt 1) { [Uri]::UnescapeDataString(($parts[1] -replace '\+', ' ')) } else { '' }
                $queryParams[$key] = $value
            }

            $requestedName = [string]$queryParams['file']
            $fileName = [System.IO.Path]::GetFileName(($requestedName -replace '\\', '/'))
            if (-not $fileName -or $fileName -ne $requestedName -or $fileName -notmatch '\.csv$') {
                $bytes = [System.Text.Encoding]::UTF8.GetBytes((@{ ok = $false; error = 'Invalid target file name.' } | ConvertTo-Json -Compress))
                $response.StatusCode = 400
                $response.ContentType = 'application/json; charset=utf-8'
                $response.ContentLength64 = $bytes.Length
                $response.OutputStream.Write($bytes, 0, $bytes.Length)
                $response.OutputStream.Close()
                continue
            }

            $target = Join-Path $Root $fileName
            $reader = New-Object System.IO.StreamReader($request.InputStream, [System.Text.Encoding]::UTF8)
            $body = $reader.ReadToEnd()
            $reader.Close()

            if (-not $body.Trim()) {
                $bytes = [System.Text.Encoding]::UTF8.GetBytes((@{ ok = $false; error = 'Uploaded content was empty.' } | ConvertTo-Json -Compress))
                $response.StatusCode = 400
                $response.ContentType = 'application/json; charset=utf-8'
                $response.ContentLength64 = $bytes.Length
                $response.OutputStream.Write($bytes, 0, $bytes.Length)
                $response.OutputStream.Close()
                continue
            }

            # Normalise line endings and guarantee a trailing newline.
            $body = ($body -replace "`r`n", "`n")
            if (-not $body.EndsWith("`n")) { $body += "`n" }

            $uploadedRows = @($body -split "`n" | Where-Object { $_.Trim() })
            $mode = [string]$queryParams['mode']
            $backupName = $null
            $targetExists = Test-Path -LiteralPath $target -PathType Leaf
            $existing = if ($targetExists) { [System.IO.File]::ReadAllText($target) } else { '' }

            if ($targetExists) {
                $stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
                $backupName = "$fileName.backup-$stamp"
                Copy-Item -LiteralPath $target -Destination (Join-Path $Root $backupName) -Force
            }

            if ($mode -eq 'append' -and $targetExists) {
                # Keep the existing header, append the uploaded data rows only.
                $existing = ($existing -replace "`r`n", "`n")
                if (-not $existing.EndsWith("`n")) { $existing += "`n" }
                $dataRows = if ($uploadedRows.Count -gt 1) { $uploadedRows[1..($uploadedRows.Count - 1)] } else { @() }
                $content = $existing + (($dataRows -join "`n") + "`n")
                $imported = $dataRows.Count
            } else {
                # Replace: the uploaded file carries its own header row.
                $content = ($uploadedRows -join "`n") + "`n"
                $imported = [Math]::Max($uploadedRows.Count - 1, 0)
            }

            [System.IO.File]::WriteAllText($target, $content, (New-Object System.Text.UTF8Encoding($false)))
            $storedRows = @(([System.IO.File]::ReadAllText($target) -split "`n") | Where-Object { $_.Trim() })

            $payload = @{
                ok = $true
                file = $fileName
                backup = $backupName
                mode = $mode
                importedRows = $imported
                totalRows = [Math]::Max($storedRows.Count - 1, 0)
                bytes = $content.Length
            }
            $bytes = [System.Text.Encoding]::UTF8.GetBytes(($payload | ConvertTo-Json -Compress))
            $response.StatusCode = 200
            $response.ContentType = 'application/json; charset=utf-8'
            $response.ContentLength64 = $bytes.Length
            $response.OutputStream.Write($bytes, 0, $bytes.Length)
            $response.OutputStream.Close()
            continue
        }

        if ($request.HttpMethod -ne 'GET' -and $request.HttpMethod -ne 'HEAD') {
            $response.StatusCode = 405
            $response.OutputStream.Close()
            continue
        }

        if ([string]::IsNullOrWhiteSpace($relative)) {
            if ($DefaultPage) {
                $response.StatusCode = 302
                $response.Headers['Location'] = $DefaultPage
                $response.Close()
                continue
            }
            $relative = 'index.html'
        }

        $full = Join-Path $Root ($relative -replace '/', '\')

        if (Test-Path -LiteralPath $full -PathType Container) {
            $full = Join-Path $full 'Index.html'
        }

        if (Test-Path -LiteralPath $full -PathType Leaf) {
            $ext = [System.IO.Path]::GetExtension($full).ToLower()
            $bytes = [System.IO.File]::ReadAllBytes($full)
            $response.ContentType = if ($types.ContainsKey($ext)) { $types[$ext] } else { 'application/octet-stream' }
            $response.ContentLength64 = $bytes.Length
            $response.OutputStream.Write($bytes, 0, $bytes.Length)
        } else {
            $msg = [System.Text.Encoding]::UTF8.GetBytes('404 Not Found')
            $response.StatusCode = 404
            $response.ContentType = 'text/plain; charset=utf-8'
            $response.ContentLength64 = $msg.Length
            $response.OutputStream.Write($msg, 0, $msg.Length)
        }
        $response.OutputStream.Close()
    } catch {
        try { $context.Response.Abort() } catch { }
    }
}
