#!/bin/sh
# MediaPipe のライブラリとモデルを vendor/ にダウンロードする（サイト内に置いて版を固定するため）
# 使い方：tongue-game フォルダで  sh tools/fetch_vendor.sh
set -e
V=0.10.14
B=https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@$V
mkdir -p vendor/mediapipe/wasm vendor/models
curl -fL -o vendor/mediapipe/vision_bundle.mjs $B/vision_bundle.mjs
for f in vision_wasm_internal.js vision_wasm_internal.wasm vision_wasm_nosimd_internal.js vision_wasm_nosimd_internal.wasm; do
  curl -fL -o vendor/mediapipe/wasm/$f $B/wasm/$f
done
curl -fL -o vendor/models/face_landmarker.task https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task
curl -fL -o vendor/models/pose_landmarker_lite.task https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task
echo "完了：vendor/ に保存しました"
