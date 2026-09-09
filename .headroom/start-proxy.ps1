# Start Headroom proxy for Adm Cursos Secundaria.
# Usage (desde la raíz del proyecto): .\.headroom\start-proxy.ps1
#
# Headroom canónico: https://github.com/headroomlabs-ai/headroom
# Instalar (solo Python 3.13): py -3.13 -m pip install "headroom-ai[all]"
#
# Overrides opcionales por máquina (no versionados):
#   $env:HEADROOM_PYTHON  — ruta a python.exe (default: Python 3.13)
#   $env:HEADROOM_EXE      — ruta a headroom.exe
#
# Importante: no usar el mismo proxy/puerto al mismo tiempo que FactuStock
# o StockSQL (default 8787) para no cruzar memoria de proyecto.

$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path $PSScriptRoot -Parent
Set-Location $ProjectRoot

$PythonCandidates = @(
    "C:\Program Files\Python313\python.exe",
    "C:\Python313\python.exe",
    (Join-Path $env:LOCALAPPDATA "Programs\Python\Python313\python.exe")
)
$HeadroomCandidates = @(
    "C:\Program Files\Python313\Scripts\headroom.exe",
    "C:\Python313\Scripts\headroom.exe",
    (Join-Path $env:LOCALAPPDATA "Programs\Python\Python313\Scripts\headroom.exe")
)

$env:HEADROOM_MODE = "token"
$env:HEADROOM_PROTECT_TOOL_RESULTS = "Read,Grep,Shell,Glob,WebFetch"

function Resolve-PythonExe {
    if ($env:HEADROOM_PYTHON -and (Test-Path $env:HEADROOM_PYTHON)) {
        return $env:HEADROOM_PYTHON
    }

    foreach ($candidate in $PythonCandidates) {
        if ($candidate -and (Test-Path $candidate)) {
            return $candidate
        }
    }

    $pyLauncher = Get-Command py -ErrorAction SilentlyContinue
    if ($pyLauncher) {
        foreach ($version in @("3.13", "3.12", "3.11")) {
            try {
                $resolved = & py "-$version" -c "import sys; print(sys.executable)" 2>$null
                if ($LASTEXITCODE -eq 0 -and $resolved) {
                    return $resolved.Trim()
                }
            } catch {
                # ignore missing interpreter
            }
        }
    }

    return $null
}

function Resolve-HeadroomExe([string]$PythonExe) {
    if ($env:HEADROOM_EXE -and (Test-Path $env:HEADROOM_EXE)) {
        return $env:HEADROOM_EXE
    }

    foreach ($candidate in $HeadroomCandidates) {
        if ($candidate -and (Test-Path $candidate)) {
            return $candidate
        }
    }

    if ($PythonExe) {
        $pythonDir = Split-Path $PythonExe -Parent
        $siblingHeadroom = Join-Path $pythonDir "Scripts\headroom.exe"
        if (Test-Path $siblingHeadroom) {
            return $siblingHeadroom
        }
    }

    $fromPath = Get-Command headroom -ErrorAction SilentlyContinue
    if ($fromPath -and $fromPath.Source -and (Test-Path $fromPath.Source)) {
        return $fromPath.Source
    }

    return $null
}

function Test-Numpy([string]$PythonExe) {
    if (-not $PythonExe -or -not (Test-Path $PythonExe)) {
        return $false
    }

    $prevEap = $ErrorActionPreference
    $ErrorActionPreference = "Continue"
    try {
        $null = & $PythonExe -c "import numpy" 2>&1
        return ($LASTEXITCODE -eq 0)
    } catch {
        return $false
    } finally {
        $ErrorActionPreference = $prevEap
    }
}

$pythonExe = Resolve-PythonExe
$headroomExe = Resolve-HeadroomExe $pythonExe
$numpyOk = Test-Numpy $pythonExe

if (-not $headroomExe) {
    throw @"
No se encontró headroom.exe.
Instalar el Headroom oficial (headroomlabs-ai/headroom):
  py -3.13 -m pip install "headroom-ai[all]"
"@
}

Write-Host "Headroom proxy - Adm Cursos Secundaria"
Write-Host "  repo:    https://github.com/headroomlabs-ai/headroom"
Write-Host "  project: $ProjectRoot"
Write-Host "  headroom: $headroomExe"
if ($pythonExe) {
    Write-Host "  python: $pythonExe"
}

if ($numpyOk) {
    $env:HEADROOM_MEMORY_STORAGE = "project"
    $env:HEADROOM_MEMORY_PROJECT_ROOT = $ProjectRoot
    $env:HEADROOM_MEMORY_TOP_K = "10"
    $env:HEADROOM_MIN_EVIDENCE = "5"

    Write-Host "  mode=token memory=project code-graph=on"
    Write-Host ""

    & $headroomExe proxy `
        --host 127.0.0.1 `
        --port 8787 `
        --mode token `
        --memory `
        --memory-storage project `
        --memory-project-root $ProjectRoot `
        --code-graph `
        --protect-tool-results Read,Grep,Shell,Glob,WebFetch `
        --memory-top-k 10 `
        --min-evidence 5
} else {
    Write-Host "  mode=token memory=off code-graph=off (numpy unavailable)"
    Write-Host ""
    Write-Host "WARNING: numpy no disponible en $pythonExe."
    Write-Host "         Usar Python 3.13: py -3.13 -m pip install `"headroom-ai[all]`""
    Write-Host ""

    & $headroomExe proxy `
        --host 127.0.0.1 `
        --port 8787 `
        --mode token `
        --protect-tool-results Read,Grep,Shell,Glob,WebFetch
}
