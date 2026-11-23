# MediaPipe のライブラリとモデルを vendor\ にダウンロードする（Windows の PowerShell 用）
# 使い方：tongue-game フォルダで  powershell -ExecutionPolicy Bypass -File tools\fetch_vendor.ps1
$ErrorActionPreference = "Stop"
$V = "0.10.14"
$B = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@$V"
New-Item -ItemType Directory -Force -Path vendor\mediapipe\wasm, vendor\models | Out-Null
Invoke-WebRequest "$B/vision_bundle.mjs" -OutFile vendor\mediapipe\vision_bundle.mjs
foreach ($f in "vision_wasm_internal.js","vision_wasm_internal.wasm","vision_wasm_nosimd_internal.js","vision_wasm_nosimd_internal.wasm") {
  Invoke-WebRequest "$B/wasm/$f" -OutFile "vendor\mediapipe\wasm\$f"
}
Invoke-WebRequest "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task" -OutFile vendor\models\face_landmarker.task
Invoke-WebRequest "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task" -OutFile vendor\models\pose_landmarker_lite.task
Write-Host "完了：vendor\ に保存しました"
