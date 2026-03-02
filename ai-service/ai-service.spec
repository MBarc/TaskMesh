# -*- mode: python ; coding: utf-8 -*-
#
# PyInstaller spec for the TaskMesh AI service.
#
# Key concerns handled here:
#   - ctranslate2 ships native DLLs (CPU/CUDA) that PyInstaller cannot discover
#     automatically. collect_all() ensures they are included.
#   - faster_whisper has its own data files that must travel with the bundle.
#   - uvicorn uses string-based module loading for its event loop / protocol
#     backends, so those modules are invisible to the static import analyser
#     and must be listed explicitly as hiddenimports.
#   - UPX compression is disabled — it corrupts native DLLs.

from PyInstaller.utils.hooks import collect_all

# Pull in everything ctranslate2 and faster_whisper need
ct2_datas,    ct2_binaries,    ct2_hiddenimports    = collect_all('ctranslate2')
fw_datas,     fw_binaries,     fw_hiddenimports     = collect_all('faster_whisper')

a = Analysis(
    ['app.py'],
    pathex=['.'],
    binaries=ct2_binaries + fw_binaries,
    datas=ct2_datas + fw_datas,
    hiddenimports=[
        # ── uvicorn dynamic loaders ───────────────────────────────────────
        'uvicorn.logging',
        'uvicorn.loops',
        'uvicorn.loops.auto',
        'uvicorn.loops.asyncio',
        'uvicorn.protocols',
        'uvicorn.protocols.http',
        'uvicorn.protocols.http.auto',
        'uvicorn.protocols.http.h11_impl',
        'uvicorn.protocols.websockets',
        'uvicorn.protocols.websockets.auto',
        'uvicorn.protocols.websockets.websockets_impl',
        'uvicorn.lifespan',
        'uvicorn.lifespan.off',
        'uvicorn.lifespan.on',
        # ── starlette / fastapi internals ─────────────────────────────────
        'starlette.routing',
        'starlette.middleware',
        'starlette.middleware.cors',
        # ── pydantic v2 ───────────────────────────────────────────────────
        'pydantic.deprecated.class_validators',
        'pydantic_core',
        # ── httpx (used by extraction.py for Ollama calls) ────────────────
        'httpx',
        'httpcore',
        # ── our local modules (discovered via import graph, listed for safety)
        'extraction',
        'transcription',
    ] + ct2_hiddenimports + fw_hiddenimports,
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[
        # Exclude things we definitely don't need to keep the bundle smaller
        'tkinter',
        'matplotlib',
        'numpy.distutils',
        'IPython',
        'PIL',
    ],
    noarchive=False,
)

pyz = PYZ(a.pure)

exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name='ai-service',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=False,      # IMPORTANT: UPX corrupts ctranslate2 / CUDA native DLLs
    console=True,   # Keep console=True so NSSM can capture stdout/stderr logs
    icon=None,
)

coll = COLLECT(
    exe,
    a.binaries,
    a.datas,
    strip=False,
    upx=False,
    upx_exclude=[],
    name='ai-service',
)
