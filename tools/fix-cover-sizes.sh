#!/bin/bash
# Fix AI-generated cover sizes to exact target dimensions.
#
# Input:  5 raw PNGs in assets/raw/ (any approximate size)
# Output: 5 correctly-named + correctly-sized PNGs in assets/
#
# Uses `sips` (macOS built-in) — no ImageMagick dependency.
#
# Usage:
#   1. Save the 5 generator images into assets/raw/ with any filenames:
#        assets/raw/landscape-16-9.png   (the 1920x1080 one)
#        assets/raw/cover-4-3.png        (the 1600x1200 one)
#        assets/raw/og-1.91-1.png        (the 1200x630 one)
#        assets/raw/icon-1-1.png         (the 1024x1024 one)
#        assets/raw/portrait-9-16.png    (the 1080x1920 one)
#   2. Run: bash tools/fix-cover-sizes.sh

set -euo pipefail

cd "$(dirname "$0")/.."

RAW=assets/raw
OUT=assets

if [ ! -d "$RAW" ]; then
  echo "Expected directory $RAW to contain the 5 raw images. Create it and drop the PNGs in."
  exit 1
fi

# Map: input filename → target size → output filename
declare -a JOBS=(
  "landscape-16-9.png     1920 1080  cover-crazygames-1920x1080.png"
  "cover-4-3.png          1600 1200  cover-crazygames-1600x1200.png"
  "og-1.91-1.png          1200 630   og-image-1200x630.png"
  "icon-1-1.png           1024 1024  icon-1024x1024.png"
  "portrait-9-16.png      1080 1920  cover-portrait-1080x1920.png"
)

fix_one() {
  local src=$1 w=$2 h=$3 dst=$4
  local srcPath="$RAW/$src"
  local dstPath="$OUT/$dst"

  if [ ! -f "$srcPath" ]; then
    echo "  SKIP  $src  (not found in $RAW/)"
    return
  fi

  # Report current dimensions
  local cur
  cur=$(sips -g pixelWidth -g pixelHeight "$srcPath" 2>/dev/null \
    | awk '/pixel(Width|Height)/{printf "%s ",$2}')
  local curW curH
  curW=$(echo "$cur" | awk '{print $1}')
  curH=$(echo "$cur" | awk '{print $2}')

  # sips resizes preserving aspect if we use -Z (bound to max dimension).
  # But we want EXACT w×h, so we need to first scale-to-cover the target,
  # then center-crop. sips has --cropToHeightWidth.
  #
  # Strategy:
  #  - Scale so the smaller of (target_w, target_h) is fully covered
  #  - Then crop from the center to exactly target_w x target_h
  # This preserves composition while guaranteeing exact output dims.

  local ratioSrc ratioDst
  ratioSrc=$(awk -v w="$curW" -v h="$curH" 'BEGIN{printf "%.4f", w/h}')
  ratioDst=$(awk -v w="$w" -v h="$h" 'BEGIN{printf "%.4f", w/h}')

  # Decide which dimension to match during pre-scale
  # If source is wider than target → match height (then crop width)
  # If source is taller than target → match width (then crop height)
  local scaleDim scaleTo
  if (( $(awk -v s="$ratioSrc" -v d="$ratioDst" 'BEGIN{print (s>d)?1:0}') )); then
    # source is wider → scale to target height
    scaleDim="--resampleHeight"
    scaleTo=$h
  else
    # source is equal/taller → scale to target width
    scaleDim="--resampleWidth"
    scaleTo=$w
  fi

  # Copy to dst path first so sips mutations land there
  cp "$srcPath" "$dstPath"

  # 1) Scale
  sips "$scaleDim" "$scaleTo" "$dstPath" >/dev/null

  # 2) Center-crop to exact target dimensions
  sips --cropToHeightWidth "$h" "$w" "$dstPath" >/dev/null

  # 3) Report result
  local finalSize
  finalSize=$(sips -g pixelWidth -g pixelHeight "$dstPath" 2>/dev/null \
    | awk '/pixel(Width|Height)/{printf "%s×",$2}' | sed 's/×$//')
  local bytes
  bytes=$(stat -f%z "$dstPath" 2>/dev/null || stat -c%s "$dstPath")
  printf "  OK    %s → %s  (%s → %dx%d, %d KB)\n" \
    "$src" "$dst" "${curW}×${curH}" "$w" "$h" "$((bytes/1024))"
}

echo "Fixing cover sizes (source → target):"
for job in "${JOBS[@]}"; do
  # shellcheck disable=SC2086
  fix_one $job
done

echo
echo "Done. Final output:"
ls -lh "$OUT"/cover-*.png "$OUT"/og-image-*.png "$OUT"/icon-*.png 2>/dev/null | awk '{printf "  %s  %s\n", $5, $9}'
