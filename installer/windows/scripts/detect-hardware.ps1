# detect-hardware.ps1
# Detects available RAM and GPU VRAM and outputs the best Ollama model for this machine.
# Output: one line — the model tag (e.g. "llama3.1:8b") or "disabled".
#
# Tier mapping:
#   < 8 GB RAM              → disabled
#   8–15 GB RAM / no GPU    → llama3.2:3b
#   16–31 GB RAM / 4–7 GB VRAM → llama3.1:8b
#   32+ GB RAM / 8–15 GB VRAM  → qwen2.5:14b
#   16+ GB VRAM             → qwen2.5:32b
#
# GPU VRAM takes priority over RAM when a GPU is present.
# Falls back to RAM-only logic if GPU detection fails.
# No external dependencies — uses only built-in Windows/PowerShell tooling.

$ErrorActionPreference = "SilentlyContinue"

# ── Detect RAM ────────────────────────────────────────────────────────────────
$cs    = Get-CimInstance -ClassName Win32_ComputerSystem -ErrorAction SilentlyContinue
$ramGB = if ($cs -and $cs.TotalPhysicalMemory) {
    [math]::Floor($cs.TotalPhysicalMemory / 1GB)
} else { 0 }

# ── Detect GPU VRAM ───────────────────────────────────────────────────────────
$vramGB = 0

# Try nvidia-smi first — bundled with NVIDIA drivers, reports correct VRAM for
# all card sizes (WMI caps at 4 GB due to UINT32 overflow on high-end cards).
$nvSmiCmd = Get-Command "nvidia-smi" -ErrorAction SilentlyContinue
if ($nvSmiCmd) {
    $nvOut = & nvidia-smi --query-gpu=memory.total --format=csv,noheader,nounits 2>$null
    if ($LASTEXITCODE -eq 0 -and $nvOut) {
        $mib = ($nvOut -split "`n")[0].Trim()
        if ($mib -match '^\d+$') {
            $vramGB = [math]::Floor([int]$mib / 1024)
        }
    }
}

# Fall back to WMI — may cap at 4 GB for VRAM > 4 GB, but useful for low-end detection.
if ($vramGB -eq 0) {
    $gpus = Get-CimInstance -ClassName Win32_VideoController -ErrorAction SilentlyContinue |
            Where-Object { $_.AdapterRAM -gt 0 }
    if ($gpus) {
        $maxVram = ($gpus | Measure-Object -Property AdapterRAM -Maximum).Maximum
        $vramGB  = [math]::Floor($maxVram / 1GB)
    }
}

# ── Model selection ───────────────────────────────────────────────────────────
# GPU VRAM takes priority when a GPU is detected.
if     ($vramGB -ge 16) { $model = "qwen2.5:32b"  }
elseif ($vramGB -ge 8)  { $model = "qwen2.5:14b"  }
elseif ($vramGB -ge 4)  { $model = "llama3.1:8b"  }
elseif ($ramGB  -ge 32) { $model = "qwen2.5:14b"  }
elseif ($ramGB  -ge 16) { $model = "llama3.1:8b"  }
elseif ($ramGB  -ge 8)  { $model = "llama3.2:3b"  }
else                    { $model = "disabled"      }

Write-Output $model
