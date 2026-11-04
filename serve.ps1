$port = 8080
$root = $PSScriptRoot
$listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::IPv6Any, $port)
$listener.Server.DualMode = $true
$listener.Start()
Write-Output "Serving $root on http://127.0.0.1:$port and http://192.168.4.108:$port"

$mimeTypes = @{
  ".html" = "text/html; charset=utf-8"
  ".css"  = "text/css; charset=utf-8"
  ".js"   = "application/javascript; charset=utf-8"
  ".json" = "application/json; charset=utf-8"
  ".png"  = "image/png"
  ".svg"  = "image/svg+xml"
  ".ico"  = "image/x-icon"
}

try {
  while ($true) {
    $client = $listener.AcceptTcpClient()
    try {
      $client.ReceiveTimeout = 5000
      $client.SendTimeout = 5000
      $stream = $client.GetStream()
      $reader = [System.IO.StreamReader]::new($stream)
      $requestLine = $reader.ReadLine()
      while ($true) {
        $line = $reader.ReadLine()
        if ($null -eq $line -or $line -eq "") { break }
      }

      if ($requestLine -match "^(GET|HEAD)\s+([^\s\?]+)") {
        $method = $Matches[1]
        $urlPath = $Matches[2]
        if ($urlPath -eq "/") { $urlPath = "/index.html" }
        $safeRel = $urlPath.TrimStart("/").Replace("/", "\")
        $filePath = Join-Path $root $safeRel

        if (Test-Path $filePath -PathType Leaf) {
          $bytes = [System.IO.File]::ReadAllBytes($filePath)
          $ext = [System.IO.Path]::GetExtension($filePath).ToLower()
          $contentType = if ($mimeTypes.ContainsKey($ext)) { $mimeTypes[$ext] } else { "application/octet-stream" }
          $header = "HTTP/1.1 200 OK`r`nContent-Type: $contentType`r`nContent-Length: $($bytes.Length)`r`nCache-Control: no-cache`r`nConnection: close`r`n`r`n"
          $headerBytes = [System.Text.Encoding]::ASCII.GetBytes($header)
          $stream.Write($headerBytes, 0, $headerBytes.Length)
          if ($method -eq "GET") {
            $stream.Write($bytes, 0, $bytes.Length)
          }
        } else {
          $body = [System.Text.Encoding]::UTF8.GetBytes("404 Not Found")
          $header = "HTTP/1.1 404 Not Found`r`nContent-Type: text/plain`r`nContent-Length: $($body.Length)`r`nConnection: close`r`n`r`n"
          $headerBytes = [System.Text.Encoding]::ASCII.GetBytes($header)
          $stream.Write($headerBytes, 0, $headerBytes.Length)
          if ($method -eq "GET") {
            $stream.Write($body, 0, $body.Length)
          }
        }
        $stream.Flush()
      }
    } catch {
      # Ignore client disconnect errors
    } finally {
      $client.Close()
    }
  }
} finally {
  $listener.Stop()
}
