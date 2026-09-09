# Setup Headroom on Windows 10 (trabajo o casa).
# Usage (desde la raíz del proyecto):
#   .\.headroom\setup-windows.ps1
#   .\.headroom\setup-windows.ps1 -StartProxy
#
# Hace: localizar Python 3.13, instalar headroom-ai[all], importar seed, imprimir
# snippet para .grok/config.toml. No copia DBs entre PCs.

[CmdletBinding()]
param(
    [switch]$StartProxy
)

$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path $PSScriptRoot -Parent
Set-Location $ProjectRoot

$SeedPath = Join-Path $PSScriptRoot "seed-memories.json"
$DbPath = Join-Path $PSScriptRoot "memory.db"

function Resolve-Python313 {
    if ($env:HEADROOM_PYTHON -and (Test-Path $env:HEADROOM_PYTHON)) {
        return $env:HEADROOM_PYTHON
    }

    $candidates = @(
        "C:\Program Files\Python313\python.exe",
        "C:\Python313\python.exe",
        (Join-Path $env:LOCALAPPDATA "Programs\Python\Python313\python.exe")
    )
    foreach ($candidate in $candidates) {
        if ($candidate -and (Test-Path $candidate)) {
            return $candidate
        }
    }

    $pyLauncher = Get-Command py -ErrorAction SilentlyContinue
    if ($pyLauncher) {
        try {
            $resolved = & py "-3.13" -c "import sys; print(sys.executable)" 2>$null
            if ($LASTEXITCODE -eq 0 -and $resolved) {
                return $resolved.Trim()
            }
        } catch {
            # ignore
        }
    }

    return $null
}

function Resolve-HeadroomExe([string]$PythonExe) {
    if ($env:HEADROOM_EXE -and (Test-Path $env:HEADROOM_EXE)) {
        return $env:HEADROOM_EXE
    }

    $candidates = @(
        "C:\Program Files\Python313\Scripts\headroom.exe",
        "C:\Python313\Scripts\headroom.exe",
        (Join-Path $env:LOCALAPPDATA "Programs\Python\Python313\Scripts\headroom.exe")
    )
    foreach ($candidate in $candidates) {
        if ($candidate -and (Test-Path $candidate)) {
            return $candidate
        }
    }

    if ($PythonExe) {
        $sibling = Join-Path (Split-Path $PythonExe -Parent) "Scripts\headroom.exe"
        if (Test-Path $sibling) {
            return $sibling
        }
    }

    $fromPath = Get-Command headroom -ErrorAction SilentlyContinue
    if ($fromPath -and $fromPath.Source -and (Test-Path $fromPath.Source)) {
        return $fromPath.Source
    }

    return $null
}

Write-Host "Headroom setup - Adm Cursos Secundaria (Windows 10)"
Write-Host "  project: $ProjectRoot"

$pythonExe = Resolve-Python313
if (-not $pythonExe) {
    throw @"
No se encontró Python 3.13.
Instalar desde https://www.python.org/downloads/release/python-3139/
  - tildar "Add python.exe to PATH"
  - NO usar Python 3.14 (numpy/litellm rotos con headroom-ai)
Después repetir: .\.headroom\setup-windows.ps1
"@
}

$ver = & $pythonExe -c "import sys; print(f'{sys.version_info.major}.{sys.version_info.minor}')"
if ($ver -ne "3.13") {
    throw "Se requiere Python 3.13, encontrado $ver en $pythonExe"
}

Write-Host "  python:  $pythonExe ($ver)"
Write-Host "  pip install headroom-ai[all] ..."
& $pythonExe -m pip install --upgrade "headroom-ai[all]"
if ($LASTEXITCODE -ne 0) {
    throw "pip install headroom-ai[all] falló (exit $LASTEXITCODE)"
}

$headroomExe = Resolve-HeadroomExe $pythonExe
if (-not $headroomExe) {
    throw "headroom.exe no apareció después del pip install. Revisá Scripts\ junto a $pythonExe"
}

Write-Host "  headroom: $headroomExe"
& $headroomExe --version

if (-not (Test-Path $SeedPath)) {
    throw "Falta seed versionable: $SeedPath"
}

Write-Host "  import seed -> $DbPath"
& $headroomExe memory import --db-path $DbPath --force $SeedPath
if ($LASTEXITCODE -ne 0) {
    throw "headroom memory import falló (exit $LASTEXITCODE)"
}

Write-Host ""
Write-Host "Listo. Agregar (o ajustar) esto en .grok/config.toml de ESTA máquina:"
Write-Host ""
Write-Host "[mcp_servers.headroom]"
Write-Host "command = `"$($headroomExe -replace '\\', '\\')`""
Write-Host "args = ["
Write-Host "  `"mcp`","
Write-Host "  `"serve`","
Write-Host "  `"--proxy-url`","
Write-Host "  `"http://127.0.0.1:8787`","
Write-Host "]"
Write-Host "enabled = true"
Write-Host "startup_timeout_sec = 45"
Write-Host "tool_timeout_sec = 60"
Write-Host ""
Write-Host "Luego: .\.headroom\start-proxy.ps1   y reabrir Grok desde la raíz."
Write-Host "No copiar .headroom/*.db entre PCs. No compartir :8787 con FactuStock ni StockSQL."

if ($StartProxy) {
    Write-Host ""
    & (Join-Path $PSScriptRoot "start-proxy.ps1")
}
